import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SectionList,
  RefreshControl,
  ActivityIndicator,
  Pressable,
  Alert,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { staffDeleteConversation, staffListConversations, subscribeToConversationList, staffSetConversationMuted } from '@/lib/messagingApi';
import type { ConversationWithMeta } from '@/lib/messaging';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { SwipeToDelete } from '@/components/SwipeToDelete';

const ALL_STAFF_GROUP_NAME = 'Tüm Çalışanlar';

function formatTime(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (d.getTime() > now.getTime() - 86400000 * 2) return 'Dün';
  return d.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' });
}

function ConversationRow({
  item,
  onPress,
  onMutePress,
  onDelete,
  staffId,
}: {
  item: ConversationWithMeta;
  onPress: () => void;
  onMutePress?: () => void;
  onDelete?: () => void;
  staffId?: string;
}) {
  const unread = item.unread_count ?? 0;
  const isAllStaff = item.type === 'group' && item.name === ALL_STAFF_GROUP_NAME;
  const displayName = item.name || 'Sohbet';
  const isMuted = item.is_muted ?? false;

  return (
    <SwipeToDelete onSwipeDelete={() => onDelete?.()}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        android_ripple={{ color: theme.colors.borderLight }}
      >
        <View style={[styles.avatarWrap, isAllStaff && styles.avatarWrapGroup]}>
          {isAllStaff ? (
            <View style={styles.avatarGroup}>
              <Ionicons name="people" size={24} color={theme.colors.white} />
            </View>
          ) : (item.type === 'direct' ? item.other_avatar : item.avatar) ? (
            <CachedImage
              uri={(item.type === 'direct' ? item.other_avatar : item.avatar) as string}
              style={styles.avatarImg}
              contentFit="cover"
            />
          ) : (
            <Text style={styles.avatarText} numberOfLines={1}>
              {displayName.charAt(0).toUpperCase()}
            </Text>
          )}
        </View>
        <View style={styles.rowBody}>
          <View style={styles.rowTitleRow}>
            <Text style={styles.rowTitle} numberOfLines={1}>
              {displayName}
            </Text>
            <Text style={styles.rowTime}>{formatTime(item.last_message_at ?? null)}</Text>
          </View>
          <Text
            style={[styles.rowPreview, unread > 0 && styles.rowPreviewUnread]}
            numberOfLines={1}
          >
            {item.last_message_preview || 'Henüz mesaj yok'}
          </Text>
        </View>
        {isAllStaff && staffId && onMutePress ? (
          <Pressable
            onPress={(e) => { e.stopPropagation(); onMutePress(); }}
            style={styles.muteBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons
              name={isMuted ? 'notifications-off' : 'notifications'}
              size={22}
              color={isMuted ? theme.colors.textMuted : theme.colors.primary}
            />
          </Pressable>
        ) : null}
        {unread > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{unread > 99 ? '99+' : unread}</Text>
          </View>
        )}
      </Pressable>
    </SwipeToDelete>
  );
}

export default function StaffMessagesTabScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const { setUnreadCount } = useStaffUnreadMessagesStore();
  const [conversations, setConversations] = useState<ConversationWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!staff) return;
    setRefreshing(true);
    const list = await staffListConversations(staff.id);
    setConversations(list);
    const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setUnreadCount(total);
    setRefreshing(false);
    setLoading(false);
  }, [staff, setUnreadCount]);

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      return () => {};
    }, [setUnreadCount])
  );

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!staff?.id) return;
    const sub = subscribeToConversationList(staff.id, load);
    return () => sub.unsubscribe?.();
  }, [staff?.id, load]);

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

  const allStaffConv = conversations.find((c) => c.type === 'group' && c.name === ALL_STAFF_GROUP_NAME);
  const otherConvs = conversations.filter((c) => !(c.type === 'group' && c.name === ALL_STAFF_GROUP_NAME));
  const sections: { title: string; data: ConversationWithMeta[] }[] = [];
  if (allStaffConv) sections.push({ title: 'Grup', data: [allStaffConv] });
  if (otherConvs.length) sections.push({ title: 'Sohbetler', data: otherConvs });

  const renderSectionHeader = ({ section }: { section: { title: string } }) => (
    <View style={styles.sectionHeader}>
      <Ionicons
        name={section.title === 'Grup' ? 'people' : 'chatbubbles-outline'}
        size={18}
        color={theme.colors.primary}
      />
      <Text style={styles.sectionHeaderText}>{section.title}</Text>
    </View>
  );

  const openAllStaffChat = () => {
    if (!allStaffConv) {
      Alert.alert('Bilgi', 'Ekip sohbeti henüz oluşturulmamış.');
      return;
    }
    router.push({ pathname: '/staff/chat/[id]', params: { id: allStaffConv.id } });
  };

  const openGroupEdit = () => {
    if (!allStaffConv) {
      Alert.alert('Bilgi', 'Düzenlenecek ekip grubu bulunamadı.');
      return;
    }
    // Staff chat içinde admin'lere grup ayarlarını aç (admin layout'a geçiş bazı cihazlarda redirect tetikleyebiliyor).
    router.push({ pathname: '/staff/chat/[id]', params: { id: allStaffConv.id, openGroupSettings: '1' } });
  };

  const isAdmin = staff?.role === 'admin';

  const renderHeaderActions = () => (
    <>
      <Pressable
        onPress={() => router.push('/staff/new-chat')}
        style={({ pressed }) => [styles.newMessageBtn, pressed && { opacity: 0.92 }]}
        android_ripple={{ color: theme.colors.borderLight }}
      >
        <Ionicons name="create-outline" size={18} color={theme.colors.white} />
        <Text style={styles.newMessageBtnText}>Yeni mesaj</Text>
      </Pressable>
      {isAdmin && (
        <View style={styles.adminTools}>
          <Pressable
            onPress={openAllStaffChat}
            style={({ pressed }) => [styles.adminToolBtn, pressed && styles.adminToolBtnPressed]}
          >
            <Ionicons name="people-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.adminToolBtnText}>Ekip sohbeti</Text>
          </Pressable>
          <Pressable
            onPress={() => router.push('/staff/new-group')}
            style={({ pressed }) => [styles.adminToolBtn, pressed && styles.adminToolBtnPressed]}
          >
            <Ionicons name="add-circle-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.adminToolBtnText}>Grup oluştur</Text>
          </Pressable>
          <Pressable
            onPress={openGroupEdit}
            style={({ pressed }) => [styles.adminToolBtn, pressed && styles.adminToolBtnPressed]}
          >
            <Ionicons name="create-outline" size={16} color={theme.colors.primary} />
            <Text style={styles.adminToolBtnText}>Grup düzenle / isim ver</Text>
          </Pressable>
        </View>
      )}
    </>
  );

  return (
    <View style={styles.container}>
      {loading && conversations.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Sohbetler yükleniyor...</Text>
        </View>
      ) : conversations.length === 0 ? (
        <View style={styles.empty}>
          <View style={styles.emptyIconWrap}>
            <Ionicons name="chatbubbles-outline" size={48} color={theme.colors.textMuted} />
          </View>
          <Text style={styles.emptyTitle}>Henüz sohbet yok</Text>
          <Text style={styles.emptyText}>Misafirler veya ekip arkadaşlarınızla mesajlaşmaya başlayın.</Text>
          {renderHeaderActions()}
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => item.id}
          ListHeaderComponent={renderHeaderActions()}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={load}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          stickySectionHeadersEnabled={false}
          renderSectionHeader={renderSectionHeader}
          renderItem={({ item }) => (
            <ConversationRow
              item={item}
              staffId={staff?.id}
              onPress={() => router.push({ pathname: '/staff/chat/[id]', params: { id: item.id } })}
              onDelete={() => handleDeleteConversation(item)}
              onMutePress={
                item.type === 'group' && item.name === ALL_STAFF_GROUP_NAME && staff
                  ? async () => {
                      const next = !(item.is_muted ?? false);
                      await staffSetConversationMuted(item.id, staff.id, next);
                      load();
                    }
                  : undefined
              }
            />
          )}
        />
      )}
    </View>
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
  loadingText: {
    fontSize: 15,
    color: theme.colors.textMuted,
  },
  listContent: {
    paddingVertical: theme.spacing.sm,
    paddingBottom: theme.spacing.xxl,
  },
  newMessageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    paddingVertical: 14,
    paddingHorizontal: 18,
    marginHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.primary,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    ...theme.shadows.sm,
  },
  newMessageBtnText: {
    color: theme.colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  adminTools: {
    marginHorizontal: theme.spacing.lg,
    marginTop: 4,
    marginBottom: theme.spacing.sm,
    gap: 8,
  },
  adminToolBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  adminToolBtnPressed: {
    opacity: 0.9,
  },
  adminToolBtnText: {
    color: theme.colors.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    paddingTop: theme.spacing.md,
  },
  sectionHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    marginHorizontal: theme.spacing.lg,
    marginVertical: 4,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  rowPressed: {
    opacity: 0.9,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
    overflow: 'hidden',
  },
  avatarImg: {
    width: 52,
    height: 52,
  },
  avatarWrapGroup: {
    backgroundColor: theme.colors.primaryDark,
  },
  avatarGroup: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: theme.colors.primaryDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    color: theme.colors.white,
    fontWeight: '700',
    fontSize: 20,
  },
  rowBody: {
    flex: 1,
    minWidth: 0,
  },
  rowTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  rowTitle: {
    fontWeight: '700',
    fontSize: 16,
    color: theme.colors.text,
    flex: 1,
  },
  rowPreview: {
    fontSize: 14,
    color: theme.colors.textMuted,
    marginTop: 2,
  },
  rowPreviewUnread: {
    fontWeight: '600',
    color: theme.colors.text,
  },
  rowTime: {
    fontSize: 12,
    color: theme.colors.textMuted,
  },
  badge: {
    backgroundColor: theme.colors.primary,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  badgeText: {
    color: theme.colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
  muteBtn: {
    padding: 8,
    marginLeft: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  empty: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xxl,
  },
  emptyIconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 15,
    color: theme.colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
});
