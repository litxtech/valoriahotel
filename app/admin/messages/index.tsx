import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import {
  staffDeleteConversation,
  staffListConversations,
  subscribeToConversationList,
} from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.getTime() > now.getTime() - 86400000 * 2) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

export default function AdminMessagesScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    if (!staff) return;
    setRefreshing(true);
    const list = await staffListConversations(staff.id);
    setConversations(list);
    setRefreshing(false);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [staff?.id]);

  useEffect(() => {
    if (!staff?.id) return;
    const sub = subscribeToConversationList(staff.id, load);
    return () => {
      sub.unsubscribe?.();
    };
  }, [staff?.id]);

  const handleDeleteConversation = (item: ConversationWithMeta) => {
    if (!staff?.id) return;
    const name = item.name || 'Sohbet';
    Alert.alert('Sohbeti sil', `"${name}" sohbetini listenizden kaldırmak istiyor musunuz?`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await staffDeleteConversation(item.id, staff.id);
          if (error) {
            Alert.alert('Hata', error);
            return;
          }
          setConversations((prev) => prev.filter((c) => c.id !== item.id));
        },
      },
    ]);
  };

  if (!staff) return null;

  if (loading && conversations.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.actions}>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/admin/messages/new')}>
          <Text style={styles.newBtnText}>+ Yeni sohbet</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.bulkBtn} onPress={() => router.push('/admin/messages/bulk')}>
          <Text style={styles.bulkBtnText}>Toplu mesaj</Text>
        </TouchableOpacity>
      </TouchableOpacity>
      <FlatList
        data={conversations}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} colors={[MESSAGING_COLORS.primary]} />}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Henüz sohbet yok.</Text>
            <Text style={styles.emptySub}>Misafir veya personelle "Yeni sohbet" ile başlayın.</Text>
          </View>
        }
        renderItem={({ item }) => (
          <SwipeToDelete onSwipeDelete={() => handleDeleteConversation(item)}>
            <TouchableOpacity
              style={styles.row}
              onPress={() => router.push({ pathname: '/admin/messages/chat/[id]', params: { id: item.id } })}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                {(item.type === 'direct' ? item.other_avatar : item.avatar) ? (
                  <CachedImage uri={(item.type === 'direct' ? item.other_avatar : item.avatar) as string} style={styles.avatarImg} contentFit="cover" />
                ) : (
                  <Text style={styles.avatarText}>{(item.name || 'Sohbet').charAt(0)}</Text>
                )}
              </View>
              <View style={styles.rowBody}>
                <Text style={styles.rowTitle} numberOfLines={1}>{item.name || 'Sohbet'}</Text>
                <Text style={styles.rowPreview} numberOfLines={1}>{item.last_message_preview || '—'}</Text>
              </View>
              <Text style={styles.rowTime}>{formatTime(item.last_message_at ?? null)}</Text>
              {(item.unread_count ?? 0) > 0 && (
                <View style={styles.badge}><Text style={styles.badgeText}>{item.unread_count}</Text></View>
              )}
            </TouchableOpacity>
          </SwipeToDelete>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  actions: { flexDirection: 'row', padding: 12, gap: 8 },
  newBtn: {
    flex: 1,
    backgroundColor: MESSAGING_COLORS.primary,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  newBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  bulkBtn: {
    flex: 1,
    backgroundColor: MESSAGING_COLORS.info,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  bulkBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: MESSAGING_COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  rowBody: { flex: 1 },
  rowTitle: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  rowPreview: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  rowTime: { fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  badge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: MESSAGING_COLORS.error,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MESSAGING_COLORS.textSecondary },
  emptySub: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 8 },
});
