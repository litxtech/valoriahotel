import { useEffect, useState, useRef, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  TouchableOpacity,
  Pressable,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
  ActivityIndicator,
  Alert,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import {
  guestGetMessages,
  guestSendMessage,
  guestMarkConversationRead,
  guestListConversations,
  guestGetConversationHeader,
  guestDeleteMessage,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadImageMessageForGuest,
} from '@/lib/messagingApi';
import type { Message } from '@/lib/messaging';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { supabase } from '@/lib/supabase';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import { Ionicons } from '@expo/vector-icons';
import { CachedImage } from '@/components/CachedImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMessagingBubbleStore, getContrastTextColor, BUBBLE_OTHER_DIRECT, BUBBLE_COLOR_OPTIONS } from '@/stores/messagingBubbleStore';

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  msg,
  isOwn,
  onImagePress,
  onDelete,
  bubbleColor,
}: {
  msg: Message;
  isOwn: boolean;
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  bubbleColor: string;
}) {
  const voiceUri = msg.message_type === 'voice' ? (msg.media_url || msg.content) : null;
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const textColor = getContrastTextColor(bubbleColor);
  return (
    <Pressable
      style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}
      onLongPress={isOwn && onDelete ? () => onDelete(msg) : undefined}
      delayLongPress={400}
    >
      {!isOwn && (msg.sender_name?.trim() || 'Misafir') ? (
        <Text style={styles.senderName}>{msg.sender_name?.trim() || 'Misafir'}</Text>
      ) : null}
      <View style={[styles.bubble, isOwn ? styles.bubbleOwn : styles.bubbleOther, { backgroundColor: bubbleColor }]}>
        {msg.message_type === 'text' ? (
          <Text style={[styles.bubbleText, { color: textColor }]}>
            {msg.content || ''}
          </Text>
        ) : msg.message_type === 'voice' && voiceUri ? (
          <VoiceMessagePlayer uri={voiceUri} isOwn={isOwn} />
        ) : isImage && imageUri ? (
          <TouchableOpacity style={[styles.imageWrap, styles.imageWrapPlaceholder]} onPress={() => onImagePress?.(imageUri)} activeOpacity={1}>
            <CachedImage key={imageUri} uri={imageUri} style={styles.bubbleImage} contentFit="cover" transition={0} />
          </TouchableOpacity>
        ) : (
          <Text style={[styles.bubbleText, { color: textColor }]}>
            [{msg.message_type}] {msg.content || msg.media_url || '—'}
          </Text>
        )}
        <Text style={[styles.bubbleTime, { color: textColor, opacity: 0.9 }]}>
          {formatMessageTime(msg.created_at)}
          {isOwn && (msg.is_read ? ' ✓✓' : ' ✓')}
        </Text>
      </View>
    </Pressable>
  );
}

export default function CustomerChatScreen() {
  const { id: conversationId, name: conversationName } = useLocalSearchParams<{ id: string; name?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { appToken, setAppToken, setUnreadCount } = useGuestMessagingStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [tokenTried, setTokenTried] = useState(false);
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [headerName, setHeaderName] = useState<string>(conversationName || 'Sohbet');
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
  const listRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastRealtimeAtRef = useRef<number>(0);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const initialScrollDoneRef = useRef(false);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();

  useEffect(() => {
    loadBubbleStore();
  }, []);

  useEffect(() => {
    if (appToken || tokenTried) return;
    (async () => {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const row = await getOrCreateGuestForCaller(session?.user);
      if (row?.app_token) await setAppToken(row.app_token);
      setTokenTried(true);
    })();
  }, [appToken, tokenTried, setAppToken]);

  useEffect(() => {
    setHeaderName(conversationName || 'Sohbet');
    setHeaderAvatar(null);
  }, [conversationId, conversationName]);

  useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {headerAvatar ? (
            <CachedImage uri={headerAvatar} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarInitial}>{(headerName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>{headerName}</Text>
        </View>
      ),
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginRight: 8 }}>
          <TouchableOpacity onPress={() => setShowBubbleColorModal(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="color-palette-outline" size={24} color={MESSAGING_COLORS.primary} />
          </TouchableOpacity>
          <Text style={styles.headerOnline}>🟢 Çevrimiçi</Text>
        </View>
      ),
    });
  }, [navigation, headerName, headerAvatar]);

  useEffect(() => {
    if (!appToken || !conversationId) {
      setLoading(false);
      return;
    }
    (async () => {
      await guestMarkConversationRead(appToken, conversationId);
      const [list, header] = await Promise.all([
        guestGetMessages(appToken, conversationId),
        guestGetConversationHeader(appToken, conversationId),
      ]);
      setMessages(list);
      setHeaderName(header.name);
      setHeaderAvatar(header.avatar);
      const convos = await guestListConversations(appToken);
      const total = convos.reduce((s, c) => s + (c.unread_count ?? 0), 0);
      setUnreadCount(total);
      setLoading(false);
    })();
  }, [appToken, conversationId, setUnreadCount]);

  // Realtime: yeni mesaj geldiğinde anında listeyi güncelle; optimistik temp mesajları gerçekle değiştir
  useEffect(() => {
    if (!conversationId) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        lastRealtimeAtRef.current = Date.now();
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => !String(m.id).startsWith('temp-'));
          if (withoutTemp.some((m) => m.id === newMsg.id)) return prev;
          return [...withoutTemp, newMsg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 150);
      },
      {
        onMessageDeleted: (messageId) => {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
      }
    );
    return () => {
      subscriptionRef.current?.unsubscribe?.();
    };
  }, [conversationId]);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  // Yazıyor göstergesi: presence ile karşı tarafın yazıp yazmadığını dinle; kendi yazarken track et
  useEffect(() => {
    if (!appToken || !conversationId) return;
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: 'Misafir', userId: appToken },
      setTypingNames
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [appToken, conversationId]);

  // Sohbet odasındayken gelen mesajlar: kısa aralıklı polling (realtime bazen misafir tarafında atlayabiliyor)
  useEffect(() => {
    if (!appToken || !conversationId || loading) return;
    const poll = async () => {
      const list = await guestGetMessages(appToken, conversationId, 50);
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => !String(m.id).startsWith('temp-'));
        if (withoutTemp.length === list.length && withoutTemp[withoutTemp.length - 1]?.id === list[list.length - 1]?.id) return prev;
        return list;
      });
    };
    const interval = setInterval(poll, 3_000);
    return () => clearInterval(interval);
  }, [appToken, conversationId, loading]);

  // Tüm hook'lar erken return'lerden önce çağrılmalı (Rules of Hooks)
  const sortedMessages = useMemo(
    () => [...messages].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [messages]
  );
  // Sohbet odasına girildiğinde en son mesaja otomatik kaydır (Android'de layout ve resim yüklemesi geciktiği için birkaç deneme)
  useEffect(() => {
    if (!loading && sortedMessages.length > 0 && !initialScrollDoneRef.current) {
      const scrollToEndOnce = () => listRef.current?.scrollToEnd({ animated: true });
      const hasImage = sortedMessages.some((m) => m.message_type === 'image');
      if (Platform.OS === 'android') {
        scrollToEndOnce();
        const t1 = setTimeout(scrollToEndOnce, 150);
        const t2 = setTimeout(() => {
          initialScrollDoneRef.current = true;
          scrollToEndOnce();
        }, 450);
        const t3 = hasImage ? setTimeout(scrollToEndOnce, 750) : null;
        return () => {
          clearTimeout(t1);
          clearTimeout(t2);
          if (t3) clearTimeout(t3);
        };
      }
      initialScrollDoneRef.current = true;
      const t = setTimeout(scrollToEndOnce, 100);
      return () => clearTimeout(t);
    }
  }, [loading, sortedMessages.length]);

  const send = async () => {
    const text = input.trim();
    if (!text || !appToken || !conversationId || sending) return;
    setSending(true);
    setInput('');
    typingPresenceRef.current?.updateTyping(false);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: '',
      sender_type: 'guest',
      sender_name: null,
      sender_avatar: null,
      message_type: 'text',
      content: text,
      media_url: null,
      media_thumbnail: null,
      file_name: null,
      file_size: null,
      mime_type: null,
      is_delivered: false,
      delivered_at: null,
      is_read: false,
      read_at: null,
      is_edited: false,
      edited_at: null,
      is_deleted: false,
      deleted_at: null,
      reply_to_id: null,
      scheduled_at: null,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, optimistic]);
    setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 50);
    const { messageId, conversationId: nextConversationId } = await guestSendMessage(appToken, conversationId, text);
    setSending(false);
    if (messageId) {
      const convId = nextConversationId ?? conversationId;
      const { notifyAdmins, notifyConversationRecipients } = await import('@/lib/notificationService');
      notifyAdmins({
        title: '💬 Yeni misafir mesajı',
        body: text.slice(0, 60) + (text.length > 60 ? '…' : ''),
        data: { url: '/admin/messages' },
      }).catch(() => {});
      notifyConversationRecipients({
        conversationId: convId,
        excludeAppToken: appToken,
        title: '💬 Yeni mesaj',
        body: text.slice(0, 80) + (text.length > 80 ? '…' : ''),
        data: { conversationId: convId, url: `/customer/chat/${convId}` },
      }).catch(() => {});
      if (nextConversationId && nextConversationId !== conversationId) {
        router.replace({ pathname: '/customer/chat/[id]', params: { id: nextConversationId, name: headerName } });
        return;
      }
      const list = await guestGetMessages(appToken, nextConversationId ?? conversationId, 50);
      setMessages(list);
      setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
    } else {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
    }
  };

  const sendImageFromSource = async (source: 'camera' | 'library') => {
    if (!appToken || !conversationId || sending) return;
    if (source === 'camera') {
      const granted = await ensureCameraPermission({
        title: 'Kamera izni',
        message: 'Sohbete fotoğraf çekmek için kamera erişimi gerekiyor.',
        settingsMessage: 'Kamera izni kapalı. Sohbete fotoğraf eklemek için ayarlardan izin verin.',
      });
      if (!granted) return;
    } else {
      const granted = await ensureMediaLibraryPermission({
        title: 'Galeri izni',
        message: 'Sohbette fotograf secmek icin galeri erisimi istiyoruz.',
        settingsMessage: 'Galeri izni kapali. Sohbete fotograf eklemek icin ayarlardan izin verin.',
      });
      if (!granted) {
        return;
      }
    }
    const result = source === 'camera'
      ? await ImagePicker.launchCameraAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ['images'],
          quality: 0.8,
          allowsEditing: false,
        });
    if (result.canceled || !result.assets[0]?.uri) return;
    let uri = result.assets[0].uri;
    setSending(true);
    try {
      // Edge Function body limit (~1MB) için resmi küçültüp sıkıştırıyoruz. Android’de daha agresif (002 hatası önlemi).
      const maxWidth = 1200;
      const compress = 0.65;
      try {
        const manipulated = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: maxWidth } }], {
          compress,
          format: ImageManipulator.SaveFormat.JPEG,
        });
        if (manipulated?.uri) uri = manipulated.uri;
      } catch (_) {
        // Manipülasyon başarısız olursa orijinal uri ile devam et
      }
      console.log('[Chat] Resim seçildi, uri:', uri?.slice?.(0, 80));
      let arrayBuffer = await uriToArrayBuffer(uri);
      // Edge Function MAX_DECODED_BYTES aşılırsa tekrar küçült
      const MAX_BYTES = 1_000_000;
      if (arrayBuffer.byteLength > MAX_BYTES) {
        try {
          const w = arrayBuffer.byteLength > 800_000 ? 600 : 800;
          const again = await ImageManipulator.manipulateAsync(uri, [{ resize: { width: w } }], {
            compress: 0.5,
            format: ImageManipulator.SaveFormat.JPEG,
          });
          if (again?.uri) {
            arrayBuffer = await uriToArrayBuffer(again.uri);
          }
        } catch (_) {}
      }
      console.log('[Chat] uriToArrayBuffer OK, byteLength:', arrayBuffer?.byteLength);
      const { mime } = getMimeAndExt(uri, 'image');
      console.log('[Chat] mime:', mime);
      const mediaUrl = await uploadImageMessageForGuest(appToken, conversationId, arrayBuffer, mime);
      console.log('[Chat] mediaUrl alındı:', mediaUrl?.slice?.(0, 60));
      const { messageId, conversationId: nextConversationId } = await guestSendMessage(appToken, conversationId, 'Fotoğraf', 'image', mediaUrl);
      if (messageId) {
        const convId = nextConversationId ?? conversationId;
        const { notifyAdmins, notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyAdmins({
          title: '💬 Yeni misafir mesajı',
          body: 'Fotoğraf gönderildi.',
          data: { url: '/admin/messages' },
        }).catch(() => {});
        notifyConversationRecipients({
          conversationId: convId,
          excludeAppToken: appToken,
          title: '💬 Yeni mesaj',
          body: 'Fotoğraf gönderildi.',
          data: { conversationId: convId, url: `/customer/chat/${convId}` },
        }).catch(() => {});
        if (nextConversationId && nextConversationId !== conversationId) {
          router.replace({ pathname: '/customer/chat/[id]', params: { id: nextConversationId, name: headerName } });
          return;
        }
        const list = await guestGetMessages(appToken, nextConversationId ?? conversationId, 50);
        setMessages(list);
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      }
    } catch (e) {
      const err = e as Error;
      console.error('[Chat] Resim yükleme hatası:', err?.message, err?.stack);
      Alert.alert('Hata', err?.message ?? 'Resim gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  const showImageOptions = () => {
    Alert.alert(
      'Fotoğraf gönder',
      undefined,
      [
        { text: 'Resim çek', onPress: () => sendImageFromSource('camera') },
        { text: 'Galeriden seç', onPress: () => sendImageFromSource('library') },
        { text: 'İptal', style: 'cancel' },
      ]
    );
  };

  const handleDeleteMessage = (msg: Message) => {
    if (!appToken) return;
    Alert.alert('Mesajı sil', 'Bu mesajı silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const ok = await guestDeleteMessage(appToken, msg.id);
          if (!ok) {
            Alert.alert('Hata', 'Mesaj silinemedi.');
            return;
          }
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        },
      },
    ]);
  };

  if (!appToken) {
    return (
      <View style={styles.centered}>
        <Text style={styles.placeholder}>
          {tokenTried ? 'Mesajlaşma için giriş yapın.' : 'Yükleniyor…'}
        </Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  const kbHeight = typeof keyboardHeight === 'number' ? keyboardHeight : 0;
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const androidKbPadding = Platform.OS === 'android' && kbHeight > 0 ? kbHeight + inputRowExtra + insets.bottom : 0;
  return (
    <KeyboardAvoidingView
      style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <FlatList
        keyboardShouldPersistTaps="handled"
        ref={listRef}
        data={sortedMessages}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, sortedMessages.length > 0 && styles.listContentGrow]}
        renderItem={({ item }) => {
          const isOwn = item.sender_type === 'guest';
          const bubbleColor = isOwn ? myBubbleColor : BUBBLE_OTHER_DIRECT;
          return (
            <MessageBubble
              msg={item}
              isOwn={isOwn}
              onImagePress={setFullscreenImageUri}
              onDelete={handleDeleteMessage}
              bubbleColor={bubbleColor}
            />
          );
        }}
        ListEmptyComponent={<Text style={styles.empty}>Henüz mesaj yok. İlk mesajı siz gönderin.</Text>}
        onContentSizeChange={() => {
          if (sortedMessages.length === 0) return;
          listRef.current?.scrollToEnd({ animated: false });
        }}
        onLayout={Platform.OS === 'android' ? () => {
          if (sortedMessages.length > 0 && !initialScrollDoneRef.current) {
            requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false }));
          }
        } : undefined}
      />
      {typingNames.length > 0 ? (
        <View style={styles.typingRow}>
          {typingNames.length === 1 ? (
            <Text style={styles.typingText} numberOfLines={1}>{typingNames[0]} yazıyor...</Text>
          ) : (
            <View style={styles.typingMultiRow}>
              {typingNames.slice(0, 4).map((name) => (
                <View key={name} style={styles.typingChip}>
                  <Text style={styles.typingChipLetter}>{name.charAt(0).toUpperCase()}</Text>
                </View>
              ))}
              <Text style={styles.typingTextSmall}> yazıyor...</Text>
            </View>
          )}
        </View>
      ) : null}
      <View style={styles.inputRow}>
        <TextInput
          style={styles.input}
          placeholder="Mesaj yaz..."
          placeholderTextColor={MESSAGING_COLORS.textSecondary}
          value={input}
          onChangeText={(t) => {
            setInput(t);
            typingPresenceRef.current?.updateTyping(true);
            if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
            typingTimeoutRef.current = setTimeout(() => {
              typingPresenceRef.current?.updateTyping(false);
              typingTimeoutRef.current = null;
            }, 3000);
          }}
          multiline
          maxLength={2000}
          onSubmitEditing={send}
        />
        <TouchableOpacity
          style={styles.mediaBtn}
          onPress={showImageOptions}
          disabled={sending}
          accessibilityLabel="Fotoğraf"
          activeOpacity={0.7}
        >
          <Ionicons name="camera-outline" size={20} color={MESSAGING_COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.mediaBtn}
          onPress={() => sendImageFromSource('library')}
          disabled={sending}
          accessibilityLabel="Galeriden seç"
          activeOpacity={0.7}
        >
          <Ionicons name="images-outline" size={20} color={MESSAGING_COLORS.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
          onPress={send}
          disabled={!input.trim() || sending}
          activeOpacity={0.85}
        >
          {sending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Ionicons name="send" size={22} color="#fff" />
          )}
        </TouchableOpacity>
      </View>

      <Modal visible={!!fullscreenImageUri} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.imageModalOverlay} onPress={() => setFullscreenImageUri(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.imageModalContent, { maxWidth: winWidth, maxHeight: winHeight }]} onPress={() => {}}>
            {fullscreenImageUri ? (
              <CachedImage key={fullscreenImageUri} uri={fullscreenImageUri} style={[styles.imageModalImage, { width: winWidth, height: winHeight }]} contentFit="contain" />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageModalCloseBtn} onPress={() => setFullscreenImageUri(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <Modal visible={showBubbleColorModal} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.bubbleColorModalOverlay} onPress={() => setShowBubbleColorModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.bubbleColorModalBox}>
            <Text style={styles.bubbleColorModalTitle}>Mesaj balon renginiz</Text>
            <View style={styles.bubbleColorRow}>
              {BUBBLE_COLOR_OPTIONS.map((c) => (
                <TouchableOpacity
                  key={c}
                  style={[styles.bubbleColorChip, { backgroundColor: c }, myBubbleColor === c && styles.bubbleColorChipSelected]}
                  onPress={() => { setMyBubbleColor(c); setShowBubbleColorModal(false); }}
                />
              ))}
            </View>
            <TouchableOpacity style={styles.bubbleColorModalClose} onPress={() => setShowBubbleColorModal(false)}>
              <Text style={styles.bubbleColorModalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  placeholder: { color: MESSAGING_COLORS.textSecondary },
  headerOnline: { fontSize: 13, color: MESSAGING_COLORS.success, fontWeight: '600', marginRight: 12 },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 220,
  },
  headerAvatar: { width: 32, height: 32, borderRadius: 16 },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarInitial: { color: '#fff', fontSize: 14, fontWeight: '700' },
  headerTitleText: { fontSize: 17, fontWeight: '700', color: MESSAGING_COLORS.text, flex: 1 },
  listContent: { padding: 16, paddingBottom: 24 },
  listContentGrow: { flexGrow: 1 },
  typingRow: { paddingHorizontal: 16, paddingVertical: 4, paddingBottom: 2, minHeight: 22 },
  typingText: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  typingMultiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typingChip: { width: 20, height: 20, borderRadius: 10, backgroundColor: MESSAGING_COLORS.primary, justifyContent: 'center', alignItems: 'center' },
  typingChipLetter: { fontSize: 11, fontWeight: '700', color: '#fff' },
  typingTextSmall: { fontSize: 11, color: MESSAGING_COLORS.textSecondary },
  bubbleWrap: { marginBottom: 10 },
  bubbleWrapOwn: { alignItems: 'flex-end' },
  bubbleWrapOther: { alignItems: 'flex-start' },
  senderName: { fontSize: 12, color: MESSAGING_COLORS.primary, marginBottom: 2, marginLeft: 12 },
  bubble: {
    maxWidth: '80%',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 18,
  },
  bubbleOwn: { backgroundColor: MESSAGING_COLORS.primary },
  bubbleOther: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#e5e7eb' },
  bubbleText: { fontSize: 15 },
  bubbleTextOwn: { color: '#fff' },
  bubbleTextOther: { color: MESSAGING_COLORS.text },
  bubbleTime: { fontSize: 11, marginTop: 4 },
  bubbleTimeOwn: { color: 'rgba(255,255,255,0.85)' },
  bubbleTimeOther: { color: MESSAGING_COLORS.textSecondary },
  imageWrap: { marginTop: 2, width: 200, height: 200, borderRadius: 12, overflow: 'hidden' },
  imageWrapPlaceholder: { backgroundColor: '#e5e7eb' },
  bubbleImage: { width: 200, height: 200, borderRadius: 12 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: { justifyContent: 'center', alignItems: 'center' },
  imageModalImage: { maxWidth: '100%', maxHeight: '100%' },
  imageModalCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleColorModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  bubbleColorModalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 320 },
  bubbleColorModalTitle: { fontSize: 18, fontWeight: '700', color: '#1F2937', marginBottom: 20 },
  bubbleColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  bubbleColorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  bubbleColorChipSelected: { borderColor: MESSAGING_COLORS.primary },
  bubbleColorModalClose: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  bubbleColorModalCloseText: { fontSize: 16, color: MESSAGING_COLORS.primary, fontWeight: '600' },
  empty: { textAlign: 'center', color: MESSAGING_COLORS.textSecondary, marginTop: 24 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 12,
    paddingVertical: 8,
    paddingBottom: Platform.OS === 'ios' ? 24 : 48,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    backgroundColor: '#f5f5f5',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 16,
    marginRight: 8,
    color: '#1F2937',
  },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 4,
    borderWidth: 0,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
    shadowColor: MESSAGING_COLORS.primary,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  sendBtnDisabled: { opacity: 0.5, shadowOpacity: 0 },
});
