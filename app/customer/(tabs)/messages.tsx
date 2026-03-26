import { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { guestDeleteConversation, guestListConversations } from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { supabase } from '@/lib/supabase';
import { formatRelative } from '@/lib/date';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';

/** Sohbet adından avatar emoji tahmini: oda numarası → grup, aksi halde ilk harf */
function chatAvatarChar(name: string | null | undefined): string {
  const n = (name || 'Sohbet').trim();
  if (/^\d+/.test(n)) return '👨‍👩‍👧'; // Oda numarası (örn. 102 Nolu Oda)
  const first = n.charAt(0).toUpperCase();
  return first || '💬';
}

export default function CustomerMessagesScreen() {
  const router = useRouter();
  const { appToken, setAppToken, loadStoredToken, setUnreadCount } = useGuestMessagingStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await loadStoredToken();
      if (cancelled) return;
      if (!useGuestMessagingStore.getState().appToken) {
        await supabase.auth.refreshSession();
        const { data: { session: s } } = await supabase.auth.getSession();
        const row = await getOrCreateGuestForCaller(s?.user);
        if (row?.app_token) await setAppToken(row.app_token);
      }
      if (cancelled) return;
      const { data: { session: s } } = await supabase.auth.getSession();
      setHasSession(!!s);
      setAuthChecked(true);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (!appToken || !authChecked) {
        if (authChecked) setConversations([]);
        setLoading(false);
        return () => {};
      }
      loadConversations();
      pollRef.current = setInterval(loadConversations, 45000);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [appToken, authChecked])
  );

  const loadConversations = async () => {
    if (!appToken) return;
    setRefreshing(true);
    const list = await guestListConversations(appToken);
    const totalUnread = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setUnreadCount(totalUnread);
    const sorted = [...list].sort((a, b) => {
      const ta = new Date(a.last_message_at ?? 0).getTime();
      const tb = new Date(b.last_message_at ?? 0).getTime();
      return tb - ta;
    });
    setConversations(sorted);
    setRefreshing(false);
    setLoading(false);
  };

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      return () => {};
    }, [setUnreadCount])
  );

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!appToken) return;
    const name = item.name || 'Sohbet';
    Alert.alert('Sohbeti sil', `"${name}" sohbetini listenizden kaldırmak istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const ok = await guestDeleteConversation(appToken, item.id);
          if (!ok) {
            Alert.alert('Hata', 'Sohbet silinemedi.');
            return;
          }
          setConversations((prev) => prev.filter((c) => c.id !== item.id));
        },
      },
    ]);
  };

  if (authChecked && !appToken) {
    if (!hasSession) {
      return (
        <View style={styles.container}>
          <View style={styles.loginPrompt}>
            <Text style={styles.loginTitle}>Mesajlaşma</Text>
            <Text style={styles.loginSubtitle}>
              Personel ve otelle mesajlaşmak için giriş yapın. Giriş kodu gerekmez.
            </Text>
            <TouchableOpacity style={styles.loginBtn} onPress={() => router.push('/auth')} activeOpacity={0.8}>
              <Text style={styles.loginBtnText}>Giriş yap</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }
    return (
      <View style={styles.container}>
        <View style={styles.loginPrompt}>
          <Text style={styles.loginTitle}>Mesajlaşma</Text>
          <Text style={styles.loginSubtitle}>Mesajlaşma hesabınız hazırlanıyor veya tekrar deneyin.</Text>
          <TouchableOpacity
            style={styles.loginBtn}
            onPress={async () => {
              await supabase.auth.refreshSession();
              const { data: { session: s } } = await supabase.auth.getSession();
              const row = await getOrCreateGuestForCaller(s?.user);
              if (row?.app_token) await setAppToken(row.app_token);
              setAuthChecked(false);
              setLoading(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={styles.loginBtnText}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={loadConversations}
            colors={[MESSAGING_COLORS.primary]}
          />
        }
        ListHeaderComponent={
          <TouchableOpacity
            style={styles.newMessageBtn}
            onPress={() => router.push('/customer/new-chat')}
            activeOpacity={0.8}
          >
            <Text style={styles.newMessageBtnIcon}>✏️</Text>
            <Text style={styles.newMessageBtnText}>Yeni mesaj yaz</Text>
          </TouchableOpacity>
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Henüz sohbet yok.</Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => {
          const name = item.name || 'Sohbet';
          const unread = item.unread_count ?? 0;
          return (
            <SwipeToDelete onSwipeDelete={() => handleDeleteConversation(item)}>
              <TouchableOpacity
                style={styles.card}
                onPress={() =>
                  router.push({
                    pathname: '/customer/chat/[id]',
                    params: { id: item.id, name },
                  })
                }
                activeOpacity={0.7}
              >
                <View style={styles.avatar}>
                  {item.avatar ? (
                    <CachedImage uri={item.avatar} style={styles.avatarImg} contentFit="cover" />
                  ) : (
                    <Text style={styles.avatarText}>{chatAvatarChar(name)}</Text>
                  )}
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={1}>{name}</Text>
                  <Text style={styles.cardPreview} numberOfLines={1}>
                    {item.last_message_preview || '—'}
                  </Text>
                </View>
                <View style={styles.cardMeta}>
                  <Text style={styles.cardTime}>
                    {item.last_message_at ? formatRelative(item.last_message_at) : '—'}
                  </Text>
                  {unread > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            </SwipeToDelete>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  listContent: { padding: 12, paddingBottom: 24 },
  loginPrompt: {
    margin: 16,
    padding: 20,
    backgroundColor: '#fff',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  loginTitle: { fontSize: 20, fontWeight: '700', color: MESSAGING_COLORS.text, marginBottom: 8 },
  loginSubtitle: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginBottom: 16, lineHeight: 20 },
  loginBtn: {
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  loginBtnText: { color: '#fff', fontWeight: '600', fontSize: 16 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    ...(Platform.OS === 'android' && { elevation: 1 }),
    ...(Platform.OS === 'ios' && {
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 4,
    }),
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#f3f4f6',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  avatarText: { fontSize: 24 },
  cardBody: { flex: 1, minWidth: 0 },
  cardName: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  cardPreview: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  cardMeta: { alignItems: 'flex-end', marginLeft: 8 },
  cardTime: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: MESSAGING_COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 4,
    paddingHorizontal: 6,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  newMessageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 14,
    borderRadius: 12,
    backgroundColor: MESSAGING_COLORS.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  newMessageBtnIcon: { fontSize: 18 },
  newMessageBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MESSAGING_COLORS.textSecondary },
});
