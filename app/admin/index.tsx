import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
  useWindowDimensions,
  Platform,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { staffListConversations } from '@/lib/messagingApi';
import { useAuthStore } from '@/stores/authStore';
import { useAdminBadgeDismissedStore } from '@/stores/adminBadgeDismissedStore';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';

type Stats = {
  roomsTotal: number;
  roomsOccupied: number;
  guestsActive: number;
  staffActive: number;
  stockPending: number;
  staffPending: number;
  unreadNotifs: number;
  messagesUnread: number;
  feedTotal: number;
  reportsPending: number;
  acceptancesUnassigned: number;
};

const GAP = 12;
const H_PAD = 20;

type SectionItem = {
  href: string;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  badge?: number;
};

const SECTIONS: { title: string; subtitle?: string; items: SectionItem[] }[] = [
  {
    title: 'Konaklama & Odalar',
    subtitle: 'Oda ve misafir işlemleri',
    items: [
      { href: '/admin/rooms', icon: 'bed-outline', label: 'Oda yönetimi' },
      { href: '/admin/rooms/new', icon: 'add-circle-outline', label: 'Yeni oda' },
      { href: '/admin/checkin', icon: 'calendar-outline', label: 'Check-in / Check-out' },
      { href: '/admin/housekeeping', icon: 'leaf-outline', label: 'Housekeeping' },
      { href: '/admin/tasks', icon: 'clipboard-outline', label: 'Personel görevleri' },
      { href: '/admin/guests', icon: 'people-outline', label: 'Misafirler' },
      { href: '/admin/report', icon: 'document-text-outline', label: 'Günlük rapor' },
      { href: '/admin/stays', icon: 'bed-outline', label: 'Konaklama geçmişi' },
      { href: '/admin/sales', icon: 'cash-outline', label: 'Satış & Komisyon' },
      { href: '/admin/hmb-reports', icon: 'document-attach-outline', label: 'HMB Raporu (Maliye)' },
    ],
  },
  {
    title: 'İletişim',
    subtitle: 'Topluluk içeriği ve duyurular',
    items: [
      { href: '/admin/feed', icon: 'images-outline', label: 'Gönderiler' },
      { href: '/admin/notifications/bulk', icon: 'megaphone-outline', label: 'Toplu duyuru' },
      { href: '/admin/reports', icon: 'flag-outline', label: 'Şikayetler (paylaşım bildirimleri)', badge: 0 },
    ],
  },
  {
    title: 'Stok & Onaylar',
    subtitle: 'Envanter ve onay bekleyenler',
    items: [
      { href: '/admin/stock', icon: 'cube-outline', label: 'Stok yönetimi' },
      { href: '/admin/stock/all', icon: 'layers-outline', label: 'Tüm stoklar' },
      { href: '/admin/stock/approvals', icon: 'checkmark-done-outline', label: 'Onay bekleyenler', badge: 0 },
      { href: '/admin/expenses', icon: 'wallet-outline', label: 'Personel harcamaları', badge: 0 },
      { href: '/admin/carbon', icon: 'leaf-outline', label: 'Karbon girdileri' },
      { href: '/admin/salary', icon: 'cash-outline', label: 'Maaş yönetimi' },
    ],
  },
  {
    title: 'Erişim & Güvenlik',
    items: [
      { href: '/admin/access', icon: 'key-outline', label: 'Geçiş kontrolü' },
      { href: '/admin/cameras', icon: 'videocam-outline', label: 'Kamera yönetimi' },
      { href: '/admin/permissions', icon: 'shield-checkmark-outline', label: 'İzinler' },
      { href: '/admin/kbs-settings', icon: 'scan-outline', label: 'KBS Ayarları (Admin)' },
      { href: '/admin/kbs-permissions', icon: 'shield-outline', label: 'KBS Yetkileri (OPS)' },
    ],
  },
  {
    title: 'Kurumsal & Ayarlar',
    subtitle: 'Sözleşmeler ve personel',
    items: [
      { href: '/admin/profile', icon: 'person-circle-outline', label: 'Profilim (hesap düzenle)' },
      { href: '/admin/app-links', icon: 'link-outline', label: 'Uygulamalar & Web Siteleri' },
      { href: '/admin/settings/printer', icon: 'print-outline', label: 'Yazici ayarlari' },
      { href: '/admin/contracts', icon: 'document-outline', label: 'Sözleşmeler' },
      { href: '/admin/contracts/contact-directory', icon: 'call-outline', label: 'İletişim rehberi' },
      { href: '/admin/contracts/all', icon: 'document-text-outline', label: 'Tüm Sözleşmelerim' },
      { href: '/admin/staff', icon: 'person-add-outline', label: 'Çalışan ekleme', badge: 0 },
      { href: '/admin/staff/list', icon: 'people-outline', label: 'Kullanıcılar listesi' },
      { href: '/admin/qr-designs', icon: 'qr-code-outline', label: 'QR tasarımları' },
    ],
  },
];

export default function AdminDashboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { staff } = useAuthStore();
  const [stats, setStats] = useState<Stats>({
    roomsTotal: 0,
    roomsOccupied: 0,
    guestsActive: 0,
    staffActive: 0,
    stockPending: 0,
    staffPending: 0,
    unreadNotifs: 0,
    messagesUnread: 0,
    feedTotal: 0,
    reportsPending: 0,
    acceptancesUnassigned: 0,
  });
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!staff?.id) return;
    const [
      roomsRes,
      roomsOccupiedRes,
      guestsRes,
      staffRes,
      stockRes,
      staffPendingRes,
      unreadRes,
      feedCountRes,
      reportsPendingRes,
      acceptancesUnassignedRes,
      conversationsList,
    ] = await Promise.all([
      supabase.from('rooms').select('*', { count: 'exact', head: true }),
      supabase.from('rooms').select('*', { count: 'exact', head: true }).eq('status', 'occupied'),
      supabase.from('guests').select('id', { count: 'exact', head: true }).eq('status', 'checked_in'),
      supabase.from('staff').select('id', { count: 'exact', head: true }).eq('is_active', true).eq('is_online', true),
      supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('staff_applications').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('staff_id', staff.id).is('read_at', null),
      supabase.from('feed_posts').select('*', { count: 'exact', head: true }),
      supabase.from('feed_post_reports').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('contract_acceptances').select('id', { count: 'exact', head: true }).is('assigned_staff_id', null),
      staffListConversations(staff.id),
    ]);

    const messagesUnread = (conversationsList ?? []).reduce((s, c) => s + (c.unread_count ?? 0), 0);
    setStats({
      roomsTotal: roomsRes.count ?? 0,
      roomsOccupied: roomsOccupiedRes.count ?? 0,
      guestsActive: guestsRes.count ?? 0,
      staffActive: staffRes.count ?? 0,
      stockPending: stockRes.count ?? 0,
      staffPending: staffPendingRes.count ?? 0,
      unreadNotifs: unreadRes.count ?? 0,
      messagesUnread,
      feedTotal: feedCountRes.count ?? 0,
      reportsPending: reportsPendingRes.count ?? 0,
      acceptancesUnassigned: acceptancesUnassignedRes.count ?? 0,
    });
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const occupancyPct = stats.roomsTotal > 0 ? Math.round((stats.roomsOccupied / stats.roomsTotal) * 100) : 0;
  const contentWidth = width - H_PAD * 2;
  const statCardSize = (contentWidth - GAP) / 2;

  const { getEffectiveBadge, setDismissed } = useAdminBadgeDismissedStore();

  const getBadgeKey = (itemLabel: string): keyof typeof stats | null => {
    if (itemLabel.includes('Onay bekleyenler')) return 'stockPending';
    if (itemLabel.includes('Çalışan ekleme')) return 'staffPending';
    if (itemLabel.includes('Şikayetler')) return 'reportsPending';
    if (itemLabel === 'Sözleşmeler') return 'acceptancesUnassigned';
    return null;
  };

  const getBadge = (sectionTitle: string, itemLabel: string): number | undefined => {
    const key = getBadgeKey(itemLabel);
    if (!key) return undefined;
    const raw = stats[key];
    if (raw == null) return undefined;
    const effective = getEffectiveBadge(key as any, raw);
    return effective > 0 ? effective : undefined;
  };

  const handleTilePress = (item: SectionItem, sectionTitle: string) => {
    const key = getBadgeKey(item.label);
    if (key) {
      const raw = stats[key];
      if (raw != null && raw > 0) setDismissed(key as any, raw);
    }
    router.push(item.href as any);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />
      }
      showsVerticalScrollIndicator={false}
    >
      {/* Özet kartları */}
      <View style={[styles.statsGrid, { width: contentWidth, gap: GAP }]}>
        <TouchableOpacity
          style={[styles.statCard, styles.statCardPrimary, { width: statCardSize, minHeight: 100 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/admin/rooms')}
        >
          <View style={styles.statIconWrap}>
            <Ionicons name="pie-chart" size={24} color="rgba(255,255,255,0.95)" />
          </View>
          <Text style={styles.statNumberPrimary}>{occupancyPct}%</Text>
          <Text style={styles.statLabelPrimary}>Doluluk</Text>
          <Text style={styles.statSubPrimary}>
            {stats.roomsOccupied}/{stats.roomsTotal} oda
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, { width: statCardSize, minHeight: 100 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/admin/guests')}
        >
          <View style={[styles.statIconWrap, styles.statIconWrapNeutral]}>
            <Ionicons name="people" size={22} color={adminTheme.colors.primary} />
          </View>
          <Text style={styles.statNumber}>{stats.guestsActive}</Text>
          <Text style={styles.statLabel}>Aktif misafir</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, { width: statCardSize, minHeight: 100 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/admin/staff')}
        >
          <View style={[styles.statIconWrap, styles.statIconWrapNeutral]}>
            <Ionicons name="person" size={22} color={adminTheme.colors.primary} />
          </View>
          <Text style={styles.statNumber}>{stats.staffActive}</Text>
          <Text style={styles.statLabel}>Çevrimiçi personel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.statCard, { width: statCardSize, minHeight: 100 }]}
          activeOpacity={0.9}
          onPress={() => router.push('/admin/feed')}
        >
          <View style={[styles.statIconWrap, styles.statIconWrapAccent]}>
            <Ionicons name="images" size={22} color={adminTheme.colors.accent} />
          </View>
          <Text style={styles.statNumber}>{stats.feedTotal}</Text>
          <Text style={styles.statLabel}>Paylaşım</Text>
        </TouchableOpacity>
      </View>

      {SECTIONS.map((section, sectionIdx) => (
        <View key={sectionIdx} style={styles.section}>
          <AdminCard padded={false} elevated>
            <View style={styles.sectionHeadPadded}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              {section.subtitle ? (
                <Text style={styles.sectionSubtitle}>{section.subtitle}</Text>
              ) : null}
            </View>
            <View style={styles.menuList}>
              {section.items.map((item, idx) => {
                const badge = getBadge(section.title, item.label) ?? item.badge;
                const showBadge = badge != null && badge > 0;
                const isLast = idx === section.items.length - 1;
                return (
                  <TouchableOpacity
                    key={idx}
                    style={[styles.menuRow, !isLast && styles.menuRowBorder]}
                    onPress={() => handleTilePress(item, section.title)}
                    activeOpacity={0.65}
                  >
                    <View style={styles.menuIconWrap}>
                      <Ionicons name={item.icon} size={22} color={adminTheme.colors.primaryMuted} />
                    </View>
                    <Text style={styles.menuLabel} numberOfLines={2}>
                      {item.label}
                    </Text>
                    <View style={styles.menuRowRight}>
                      {showBadge ? (
                        <View style={styles.menuBadge}>
                          <Text style={styles.menuBadgeText}>{badge > 99 ? '99+' : badge}</Text>
                        </View>
                      ) : null}
                      <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          </AdminCard>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    paddingHorizontal: H_PAD,
    paddingTop: 16,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
    marginBottom: 18,
  },
  statCard: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    ...Platform.select({
      ios: adminTheme.shadow.sm,
      android: { elevation: 2 },
    }),
  },
  statCardPrimary: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: 'transparent',
  },
  statIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statIconWrapNeutral: {
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  statIconWrapAccent: {
    backgroundColor: adminTheme.colors.warningLight,
  },
  statNumberPrimary: {
    fontSize: 26,
    fontWeight: '800',
    color: '#fff',
  },
  statLabelPrimary: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.95)',
    marginTop: 2,
  },
  statSubPrimary: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.75)',
    marginTop: 2,
  },
  statNumber: {
    fontSize: 22,
    fontWeight: '800',
    color: adminTheme.colors.text,
  },
  statLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.colors.textSecondary,
    marginTop: 4,
  },

  section: {
    marginBottom: 16,
  },
  sectionHeadPadded: {
    paddingHorizontal: adminTheme.spacing.lg,
    paddingTop: adminTheme.spacing.lg,
    paddingBottom: adminTheme.spacing.sm,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: adminTheme.colors.text,
    letterSpacing: -0.2,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
    marginTop: 4,
    lineHeight: 18,
  },

  menuList: {
    paddingBottom: 4,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: adminTheme.spacing.lg,
    minHeight: 52,
  },
  menuRowBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: adminTheme.colors.borderLight,
  },
  menuIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.text,
    lineHeight: 21,
    paddingRight: 8,
  },
  menuRowRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: adminTheme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 7,
    marginRight: 6,
  },
  menuBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
});
