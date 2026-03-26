import { useEffect, useState, useRef } from 'react';
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
  Image,
  Modal,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, Stack, useNavigation, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import {
  staffGetMessages,
  staffSendMessage,
  staffMarkConversationRead,
  staffGetConversationHeader,
  staffSetConversationMuted,
  staffDeleteMessage,
  subscribeToMessages,
  subscribeToTypingPresence,
  uploadImageMessageForStaff,
} from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import type { Message } from '@/lib/messaging';
import { theme } from '@/constants/theme';
import { VoiceMessagePlayer } from '@/components/VoiceMessagePlayer';
import * as ImagePicker from 'expo-image-picker';
import { uriToArrayBuffer, getMimeAndExt } from '@/lib/uploadMedia';
import { ensureCameraPermission } from '@/lib/cameraPermission';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { CachedImage } from '@/components/CachedImage';
import {
  useMessagingBubbleStore,
  getBubbleColorForSender,
  getContrastTextColor,
  BUBBLE_OTHER_DIRECT,
  BUBBLE_COLOR_OPTIONS,
} from '@/stores/messagingBubbleStore';

const ALL_STAFF_GROUP_NAME = 'Tüm Çalışanlar';

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
}

function formatMessageDateAndTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function MessageBubble({
  msg,
  isOwn,
  isGroup,
  onImagePress,
  onDelete,
  bubbleColor,
}: {
  msg: Message;
  isOwn: boolean;
  isGroup: boolean;
  onImagePress?: (uri: string) => void;
  onDelete?: (msg: Message) => void;
  bubbleColor?: string;
}) {
  const voiceUri = msg.message_type === 'voice' ? (msg.media_url || msg.content) : null;
  const isImage = msg.message_type === 'image' && (msg.media_url || msg.media_thumbnail);
  const imageUri = msg.media_url || msg.media_thumbnail || '';
  const displayName = msg.sender_name?.trim() || (msg.sender_type === 'guest' ? 'Misafir' : null) || '?';
  const initial = displayName.charAt(0).toUpperCase();
  const timeStr = isGroup ? formatMessageDateAndTime(msg.created_at) : formatMessageTime(msg.created_at);
  const color = bubbleColor ?? BUBBLE_OTHER_DIRECT;
  const textColor = getContrastTextColor(color);

  const renderContent = (own: boolean) => {
    if (msg.message_type === 'text') {
      return <Text style={[own ? styles.bubbleTextOwn : styles.bubbleTextOther, { color: textColor }]}>{msg.content || ''}</Text>;
    }
    if (msg.message_type === 'voice' && voiceUri) {
      return <VoiceMessagePlayer uri={voiceUri} isOwn={own} />;
    }
    if (isImage) {
      return (
        <TouchableOpacity style={[styles.imageWrap, styles.imageWrapPlaceholder]} onPress={() => onImagePress?.(imageUri)} activeOpacity={1}>
          <CachedImage
            uri={msg.media_thumbnail || msg.media_url || ''}
            style={styles.bubbleImage}
            contentFit="cover"
            transition={0}
          />
        </TouchableOpacity>
      );
    }
    return (
      <Text style={[own ? styles.bubbleTextOwn : styles.bubbleTextOther, { color: textColor }]}>
        [{msg.message_type}] {msg.content || msg.media_url || '—'}
      </Text>
    );
  };

  return (
    <Pressable
      style={[styles.bubbleWrap, isOwn ? styles.bubbleWrapOwn : styles.bubbleWrapOther]}
      onLongPress={isOwn && onDelete ? () => onDelete(msg) : undefined}
      delayLongPress={400}
    >
      {!isOwn && (
        <View style={styles.otherMeta}>
          <View style={styles.avatarWrap}>
            {msg.sender_avatar ? (
              <CachedImage uri={msg.sender_avatar} style={styles.avatarImg} contentFit="cover" />
            ) : (
              <View style={styles.avatarPlaceholder}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            )}
          </View>
          <View style={styles.otherContent}>
            {displayName ? (
              <Text style={styles.senderName}>{displayName}</Text>
            ) : null}
            <View style={[styles.bubble, styles.bubbleOther, { backgroundColor: color }]}>
              {renderContent(false)}
              <View style={styles.bubbleFooter}>
                <Text style={[styles.bubbleTimeOther, { color: textColor, opacity: 0.9 }]}>{timeStr}</Text>
              </View>
            </View>
          </View>
        </View>
      )}
      {isOwn && (
        <View style={[styles.bubble, styles.bubbleOwn, { backgroundColor: color }]}>
          {renderContent(true)}
          <View style={styles.bubbleFooter}>
            <Text style={[styles.bubbleTimeOwn, { color: textColor, opacity: 0.9 }]}>{timeStr}</Text>
            {msg.is_read ? (
              <Ionicons name="checkmark-done" size={14} color={textColor} style={styles.readIcon} />
            ) : (
              <Ionicons name="checkmark" size={14} color={textColor} style={styles.readIcon} />
            )}
          </View>
        </View>
      )}
    </Pressable>
  );
}

export default function StaffChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const { openGroupSettings } = useLocalSearchParams<{ openGroupSettings?: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const { staff } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [conversationType, setConversationType] = useState<string>('direct');
  const [conversationName, setConversationName] = useState<string>('Sohbet');
  const [headerAvatar, setHeaderAvatar] = useState<string | null>(null);
  const [isAllStaffGroup, setIsAllStaffGroup] = useState(false);
  const [showGroupSettings, setShowGroupSettings] = useState(false);
  const [editGroupName, setEditGroupName] = useState('');
  const [editGroupAvatar, setEditGroupAvatar] = useState<string | null>(null);
  const [savingGroup, setSavingGroup] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const [fullscreenImageUri, setFullscreenImageUri] = useState<string | null>(null);
  const [showBubbleColorModal, setShowBubbleColorModal] = useState(false);
  const [allStaffMuted, setAllStaffMuted] = useState(false);
  const listRef = useRef<FlatList>(null);
  const subscriptionRef = useRef<ReturnType<typeof subscribeToMessages> | null>(null);
  const typingPresenceRef = useRef<ReturnType<typeof subscribeToTypingPresence> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [typingNames, setTypingNames] = useState<string[]>([]);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const { myBubbleColor, setMyBubbleColor, loadStored: loadBubbleStore } = useMessagingBubbleStore();
  const inputRowExtra = Platform.OS === 'android' ? -20 : 56;
  const androidKbPadding = Platform.OS === 'android' && keyboardHeight > 0 ? keyboardHeight + inputRowExtra + insets.bottom : 0;

  useEffect(() => {
    loadBubbleStore();
  }, []);
  useEffect(() => {
    if (!conversationId) return;
    supabase
      .from('conversations')
      .select('type, name')
      .eq('id', conversationId)
      .single()
      .then(async ({ data }) => {
        const row = data as { type: string; name: string | null } | null;
        setConversationType(row?.type ?? 'direct');
        const isAllStaff = row?.type === 'group' && row?.name === ALL_STAFF_GROUP_NAME;
        setIsAllStaffGroup(isAllStaff);
        if (staff?.id) {
          const header = await staffGetConversationHeader(conversationId, staff.id);
          setConversationName(header.name);
          setHeaderAvatar(header.avatar);
        } else {
          setConversationName(row?.name ?? 'Sohbet');
          setHeaderAvatar(null);
        }
        if (isAllStaff && staff?.id) {
          const { data: part } = await supabase
            .from('conversation_participants')
            .select('is_muted')
            .eq('conversation_id', conversationId)
            .eq('participant_id', staff.id)
            .in('participant_type', ['staff', 'admin'])
            .maybeSingle();
          setAllStaffMuted(!!(part as { is_muted?: boolean } | null)?.is_muted);
        }
      });
  }, [conversationId, staff?.id]);

  const isAdmin = staff?.role === 'admin';
  const isGroup = conversationType === 'group';
  const canEditGroup = isAdmin && isAllStaffGroup && isGroup;

  const openGroupSettingsModal = () => {
    setEditGroupName(conversationName);
    setEditGroupAvatar(headerAvatar);
    setShowGroupSettings(true);
  };

  useEffect(() => {
    if (!canEditGroup) return;
    if (openGroupSettings !== '1') return;
    const t = setTimeout(() => openGroupSettingsModal(), 150);
    return () => clearTimeout(t);
  }, [canEditGroup, openGroupSettings, conversationName, headerAvatar]);

  useEffect(() => {
    const isAllStaff = isAllStaffGroup;
    navigation.setOptions({
      headerTitle: () => (
        <View style={styles.headerTitleRow}>
          {headerAvatar ? (
            <CachedImage uri={headerAvatar} style={styles.headerAvatar} contentFit="cover" />
          ) : (
            <View style={styles.headerAvatarPlaceholder}>
              <Text style={styles.headerAvatarInitial}>{(conversationName || '?').charAt(0).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.headerTitleText} numberOfLines={1}>{conversationName}</Text>
        </View>
      ),
      headerStyle: {
        backgroundColor: theme.colors.surface,
        borderBottomWidth: 1,
        borderBottomColor: theme.colors.borderLight,
      },
      headerTintColor: theme.colors.text,
      headerBackTitle: 'Geri',
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginRight: 8 }}>
          <TouchableOpacity onPress={() => setShowBubbleColorModal(true)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="color-palette-outline" size={24} color={theme.colors.primary} />
          </TouchableOpacity>
          {isAllStaff ? (
            <TouchableOpacity
              onPress={async () => {
                if (!staff?.id || !conversationId) return;
                const next = !allStaffMuted;
                const { error } = await staffSetConversationMuted(conversationId, staff.id, next);
                if (error) Alert.alert('Hata', error);
                else setAllStaffMuted(next);
              }}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons
                name={allStaffMuted ? 'notifications-off' : 'notifications'}
                size={24}
                color={theme.colors.primary}
              />
            </TouchableOpacity>
          ) : null}
          {isAllStaff ? (
            <View style={styles.headerGroupBadge}>
              <Ionicons name="people" size={18} color={theme.colors.primary} />
              <Text style={styles.headerGroupBadgeText}>Grup</Text>
            </View>
          ) : null}
        </View>
      ),
    });
  }, [conversationName, headerAvatar, isAllStaffGroup, allStaffMuted, navigation, conversationId, staff?.id]);

  const scrollTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => {
    if (!staff || !conversationId) {
      setLoading(false);
      return;
    }
    scrollTimeoutsRef.current = [];
    (async () => {
      const list = await staffGetMessages(conversationId, 50, undefined, staff.id);
      setMessages(list);
      staffMarkConversationRead(conversationId, staff.id);
      setLoading(false);
      const scrollToEnd = () => listRef.current?.scrollToEnd({ animated: true });
      const hasImage = list.some((m: Message) => m.message_type === 'image');
      if (Platform.OS === 'android') {
        scrollToEnd();
        scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 150), setTimeout(scrollToEnd, 450));
        if (hasImage) scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 750));
      } else {
        scrollTimeoutsRef.current.push(setTimeout(scrollToEnd, 150));
      }
    })();
    return () => scrollTimeoutsRef.current.forEach((t) => clearTimeout(t));
  }, [staff?.id, conversationId]);

  useEffect(() => {
    if (!conversationId) return;
    subscriptionRef.current = subscribeToMessages(
      conversationId,
      (newMsg) => {
        setMessages((prev) => {
          const withoutTemp = prev.filter((m) => !String(m.id).startsWith('temp-'));
          if (withoutTemp.some((m) => m.id === newMsg.id)) return prev;
          return [...withoutTemp, newMsg];
        });
        setTimeout(() => listRef.current?.scrollToEnd({ animated: true }), 100);
      },
      {
        onMessageDeleted: (messageId) => {
          setMessages((prev) => prev.filter((m) => m.id !== messageId));
        },
      }
    );
    return () => subscriptionRef.current?.unsubscribe?.();
  }, [conversationId]);

  useEffect(() => {
    if (!conversationId || !staff) return;
    typingPresenceRef.current = subscribeToTypingPresence(
      conversationId,
      { displayName: staff.full_name || staff.email || 'Personel', userId: staff.id },
      setTypingNames
    );
    return () => {
      typingPresenceRef.current?.unsubscribe?.();
      typingPresenceRef.current = null;
    };
  }, [conversationId, staff?.id, staff?.full_name, staff?.email]);

  // Android: klavye açılınca mesaj kutusu klavyenin üstünde kalsın
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKeyboardHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || !staff || !conversationId || sending) return;
    setSending(true);
    setInput('');
    typingPresenceRef.current?.updateTyping(false);
    const tempId = `temp-${Date.now()}`;
    const optimistic: Message = {
      id: tempId,
      conversation_id: conversationId,
      sender_id: staff.id,
      sender_type: 'staff',
      sender_name: staff.full_name || staff.email,
      sender_avatar: staff.profile_image ?? null,
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
    const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
      conversationId,
      staff.id,
      staff.full_name || staff.email,
      staff.profile_image ?? null,
      text
    );
    setSending(false);
    if (error) {
      setInput(text);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      Alert.alert('Mesaj gönderilemedi', error);
      return;
    }
    if (sent) {
      const convId = nextConversationId ?? conversationId;
      const { notifyConversationRecipients } = await import('@/lib/notificationService');
      notifyConversationRecipients({
        conversationId: convId,
        excludeStaffId: staff.id,
        title: conversationName || 'Yeni mesaj',
        body: text.slice(0, 80) + (text.length > 80 ? '…' : ''),
        data: { conversationId: convId, url: `/staff/chat/${convId}` },
      }).catch(() => {});
      if (nextConversationId !== conversationId) {
        router.replace({ pathname: '/staff/chat/[id]', params: { id: nextConversationId } });
        return;
      }
      listRef.current?.scrollToEnd({ animated: true });
    }
  };

  const sendImageFromSource = async (source: 'camera' | 'library') => {
    if (!staff || !conversationId || sending) return;
    if (source === 'camera') {
      const granted = await ensureCameraPermission({
        title: 'Kamera izni',
        message: 'Sohbette fotoğraf çekmek için kamera erişimi gerekiyor.',
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
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsEditing: false });
    if (result.canceled || !result.assets[0]?.uri) return;
    const uri = result.assets[0].uri;
    setSending(true);
    try {
      console.log('[StaffChat] Resim seçildi, uri:', uri?.slice?.(0, 80));
      const arrayBuffer = await uriToArrayBuffer(uri);
      console.log('[StaffChat] uriToArrayBuffer OK, byteLength:', arrayBuffer?.byteLength);
      const { mime } = getMimeAndExt(uri, 'image');
      console.log('[StaffChat] mime:', mime);
      const mediaUrl = await uploadImageMessageForStaff(arrayBuffer, mime);
      if (!mediaUrl) {
        console.warn('[StaffChat] uploadImageMessageForStaff null döndü');
        Alert.alert('Hata', 'Resim yüklenemedi.');
        return;
      }
      console.log('[StaffChat] mediaUrl alındı:', mediaUrl?.slice?.(0, 60));
      const { data: sent, error, conversationId: nextConversationId } = await staffSendMessage(
        conversationId,
        staff.id,
        staff.full_name || staff.email,
        staff.profile_image ?? null,
        'Fotoğraf',
        'image',
        mediaUrl
      );
      if (error) {
        Alert.alert('Mesaj gönderilemedi', error);
        return;
      }
      if (sent) {
        const convId = nextConversationId ?? conversationId;
        const { notifyConversationRecipients } = await import('@/lib/notificationService');
        notifyConversationRecipients({
          conversationId: convId,
          excludeStaffId: staff.id,
          title: conversationName || 'Yeni mesaj',
          body: 'Fotoğraf gönderildi.',
          data: { conversationId: convId, url: `/staff/chat/${convId}` },
        }).catch(() => {});
        if (nextConversationId !== conversationId) {
          router.replace({ pathname: '/staff/chat/[id]', params: { id: nextConversationId } });
          return;
        }
        const list = await staffGetMessages(nextConversationId, 50, undefined, staff.id);
        setMessages(list);
        listRef.current?.scrollToEnd({ animated: true });
      }
    } catch (e) {
      const err = e as Error;
      console.error('[StaffChat] Resim yükleme hatası:', err?.message, err?.stack);
      Alert.alert('Hata', err?.message ?? 'Resim gönderilemedi.');
    } finally {
      setSending(false);
    }
  };

  const uploadGroupAvatar = async (uri: string): Promise<string> => {
    if (!conversationId) throw new Error('Konuşma bulunamadı.');
    const arrayBuffer = await uriToArrayBuffer(uri);
    const ext = uri.toLowerCase().includes('.png') ? 'png' : 'jpg';
    const contentType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const fileName = `conversations/${conversationId}.${ext}`;
    const { error } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
      contentType,
      upsert: true,
    });
    if (error) throw error;
    const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName);
    return publicUrl;
  };

  const pickAvatarForGroup = async () => {
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Grup avatari secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Grup avatari secmek icin ayarlardan izin verin.',
    });
    if (!granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets[0]?.uri) return;
    setUploadingAvatar(true);
    try {
      const url = await uploadGroupAvatar(result.assets[0].uri);
      setEditGroupAvatar(url);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Fotoğraf yüklenemedi.');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const saveGroupSettings = async () => {
    if (!conversationId || savingGroup) return;
    const name = (editGroupName || '').trim() || conversationName;
    setSavingGroup(true);
    try {
      const { error } = await supabase
        .from('conversations')
        .update({ name, avatar: editGroupAvatar ?? null, updated_at: new Date().toISOString() })
        .eq('id', conversationId);
      if (error) {
        Alert.alert('Hata', error.message);
        return;
      }
      setConversationName(name);
      setHeaderAvatar(editGroupAvatar);
      setShowGroupSettings(false);
    } finally {
      setSavingGroup(false);
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
    if (!conversationId) return;
    Alert.alert('Mesajı sil', 'Bu mesajı silmek istediğinize emin misiniz?', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await staffDeleteMessage(conversationId, msg.id);
          if (error) {
            Alert.alert('Hata', error);
            return;
          }
          setMessages((prev) => prev.filter((m) => m.id !== msg.id));
        },
      },
    ]);
  };

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <Stack.Screen
          options={{
            title: conversationName,
            headerStyle: { backgroundColor: theme.colors.surface },
            headerTintColor: theme.colors.text,
          }}
        />
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingLabel}>Mesajlar yükleniyor...</Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: conversationName,
          headerStyle: {
            backgroundColor: theme.colors.surface,
            borderBottomWidth: 1,
            borderBottomColor: theme.colors.borderLight,
          },
          headerTintColor: theme.colors.text,
          headerTitleStyle: { fontSize: 17, fontWeight: '700', color: theme.colors.text },
        }}
      />
      <KeyboardAvoidingView
        style={[styles.container, androidKbPadding > 0 && { paddingBottom: androidKbPadding }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        <FlatList
          ref={listRef}
          data={messages}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          onContentSizeChange={() => { if (messages.length > 0) listRef.current?.scrollToEnd({ animated: false }); }}
          onLayout={Platform.OS === 'android' ? () => { if (messages.length > 0) requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: false })); } : undefined}
          ListHeaderComponent={
            canEditGroup ? (
              <TouchableOpacity
                style={styles.groupSettingsBar}
                onPress={openGroupSettingsModal}
                activeOpacity={0.7}
              >
                <Ionicons name="settings-outline" size={20} color={theme.colors.primary} />
                <Text style={styles.groupSettingsBarText}>Grup adı ve avatarı düzenle</Text>
                <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ) : null
          }
          renderItem={({ item }) => {
            const isOwn = item.sender_id === staff?.id;
            const bubbleColor = isOwn ? (myBubbleColor ?? BUBBLE_OTHER_DIRECT) : (isGroup ? getBubbleColorForSender(item.sender_id) : BUBBLE_OTHER_DIRECT);
            return (
              <MessageBubble
                msg={item}
                isOwn={isOwn}
                isGroup={isGroup}
                onImagePress={setFullscreenImageUri}
                onDelete={handleDeleteMessage}
                bubbleColor={bubbleColor}
              />
            );
          }}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIcon}>
                <Ionicons name="chatbubble-outline" size={40} color={theme.colors.textMuted} />
              </View>
              <Text style={styles.emptyTitle}>Henüz mesaj yok</Text>
              <Text style={styles.emptyText}>
                {isGroup ? 'Grup sohbetinde ilk mesajı siz yazın.' : 'Bu sohbette ilk mesajı siz yazın.'}
              </Text>
            </View>
          }
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
            placeholderTextColor={theme.colors.textMuted}
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
          <TouchableOpacity style={styles.mediaBtn} onPress={showImageOptions} disabled={sending} activeOpacity={0.7}>
            <Ionicons name="camera-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.mediaBtn} onPress={() => sendImageFromSource('library')} disabled={sending} activeOpacity={0.7}>
            <Ionicons name="images-outline" size={20} color={theme.colors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]}
            onPress={send}
            disabled={!input.trim() || sending}
            activeOpacity={0.85}
          >
            {sending ? (
              <ActivityIndicator size="small" color={theme.colors.white} />
            ) : (
              <Ionicons name="send" size={20} color={theme.colors.white} />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      <Modal visible={showGroupSettings} transparent animationType="fade">
        <TouchableOpacity
          activeOpacity={1}
          style={styles.bubbleColorModalOverlay}
          onPress={() => setShowGroupSettings(false)}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()} style={styles.bubbleColorModalBox}>
            <Text style={styles.bubbleColorModalTitle}>Grup ayarları</Text>
            <View style={styles.modalAvatarRow}>
              <TouchableOpacity
                onPress={pickAvatarForGroup}
                disabled={uploadingAvatar}
                style={styles.modalAvatarTouch}
              >
                {editGroupAvatar ? (
                  <CachedImage uri={editGroupAvatar} style={styles.modalAvatarImg} contentFit="cover" />
                ) : (
                  <View style={styles.modalAvatarPlaceholder}>
                    <Text style={styles.modalAvatarPlaceholderText}>Fotoğraf</Text>
                  </View>
                )}
                {uploadingAvatar ? (
                  <View style={styles.modalAvatarLoading}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : null}
              </TouchableOpacity>
              <Text style={styles.modalAvatarHint}>Profil resmi</Text>
            </View>
            <Text style={styles.modalLabel}>Grup adı</Text>
            <TextInput
              style={styles.modalInput}
              value={editGroupName}
              onChangeText={setEditGroupName}
              placeholder="Örn: Tüm Çalışanlar"
              placeholderTextColor={theme.colors.textMuted}
            />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setShowGroupSettings(false)}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSaveBtn, savingGroup && styles.modalSaveBtnDisabled]}
                onPress={saveGroupSettings}
                disabled={savingGroup}
              >
                {savingGroup ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.modalSaveText}>Kaydet</Text>
                )}
              </TouchableOpacity>
            </View>
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

      <Modal visible={!!fullscreenImageUri} transparent animationType="fade">
        <TouchableOpacity activeOpacity={1} style={styles.imageModalOverlay} onPress={() => setFullscreenImageUri(null)}>
          <TouchableOpacity activeOpacity={1} style={[styles.imageModalContent, { maxWidth: winWidth, maxHeight: winHeight }]} onPress={() => {}}>
            {fullscreenImageUri ? (
              <CachedImage uri={fullscreenImageUri} style={[styles.imageModalImage, { width: winWidth, height: winHeight }]} contentFit="contain" />
            ) : null}
          </TouchableOpacity>
          <TouchableOpacity style={styles.imageModalCloseBtn} onPress={() => setFullscreenImageUri(null)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close" size={28} color="#fff" />
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  loadingLabel: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  headerGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.primaryLight,
  },
  headerGroupBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    maxWidth: 220,
  },
  headerAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  headerAvatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerAvatarInitial: {
    color: theme.colors.white,
    fontSize: 14,
    fontWeight: '700',
  },
  headerTitleText: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    flex: 1,
  },
  listContent: {
    padding: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
  },
  groupSettingsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 12,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  groupSettingsBarText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  bubbleWrap: {
    marginBottom: 14,
  },
  bubbleWrapOwn: {
    alignItems: 'flex-end',
  },
  bubbleWrapOther: {
    alignItems: 'flex-start',
  },
  otherMeta: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
  },
  otherContent: {
    flex: 1,
    minWidth: 0,
  },
  avatarWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarImg: {
    width: 32,
    height: 32,
    borderRadius: 16,
  },
  avatarPlaceholder: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitial: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 14,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.primary,
    marginBottom: 4,
    marginLeft: 2,
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
    ...theme.shadows.sm,
  },
  bubbleOwn: {
    backgroundColor: theme.colors.primary,
    borderBottomRightRadius: 6,
  },
  bubbleOther: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  bubbleTextOwn: {
    color: theme.colors.white,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleTextOther: {
    color: theme.colors.text,
    fontSize: 15,
    lineHeight: 20,
  },
  bubbleFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: 6,
    gap: 4,
  },
  bubbleTimeOwn: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.88)',
  },
  bubbleTimeOther: {
    fontSize: 11,
    color: theme.colors.textMuted,
  },
  readIcon: {
    marginLeft: 2,
  },
  imageWrap: { marginTop: 2, width: 200, height: 200, borderRadius: 12, overflow: 'hidden' },
  imageWrapPlaceholder: { backgroundColor: theme.colors.borderLight },
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
  bubbleColorModalBox: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 24, width: '100%', maxWidth: 320 },
  bubbleColorModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 20 },
  bubbleColorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  bubbleColorChip: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: 'transparent' },
  bubbleColorChipSelected: { borderColor: theme.colors.primary },
  bubbleColorModalClose: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 24 },
  bubbleColorModalCloseText: { fontSize: 16, color: theme.colors.primary, fontWeight: '600' },
  modalAvatarRow: { alignItems: 'center', marginBottom: 20 },
  modalAvatarTouch: { width: 80, height: 80, borderRadius: 40, overflow: 'hidden', alignSelf: 'center' },
  modalAvatarImg: { width: 80, height: 80 },
  modalAvatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarPlaceholderText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  modalAvatarLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalAvatarHint: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  modalInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 16,
    marginBottom: 20,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  modalCancelText: { color: theme.colors.textMuted, fontWeight: '600' },
  modalSaveBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    minWidth: 90,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: { opacity: 0.7 },
  modalSaveText: { color: '#fff', fontWeight: '700' },
  mediaBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.backgroundSecondary ?? '#f0f0f0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    alignItems: 'center',
    paddingVertical: 48,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 14,
    color: theme.colors.textMuted,
    textAlign: 'center',
  },
  typingRow: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 4,
    paddingBottom: 2,
    minHeight: 22,
    backgroundColor: theme.colors.surface,
  },
  typingText: { fontSize: 12, color: theme.colors.textMuted },
  typingMultiRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 },
  typingChip: { width: 20, height: 20, borderRadius: 10, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  typingChipLetter: { fontSize: 11, fontWeight: '700', color: theme.colors.white },
  typingTextSmall: { fontSize: 11, color: theme.colors.textMuted },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    paddingBottom: Platform.OS === 'ios' ? 28 : 36,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    gap: 10,
  },
  input: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 12,
    fontSize: 15,
    maxHeight: 100,
    color: '#1F2937',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
});
