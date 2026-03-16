import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  is_online: boolean | null;
  last_active: string | null;
};

type HotelInfoRow = {
  id: string;
  name: string | null;
  description: string | null;
};

const CATEGORIES = [
  { id: 'messages', label: 'Mesajlar', icon: '💬', route: '/customer/messages' },
  { id: 'rooms', label: 'Odalar', icon: '🛏️', route: '/customer/rooms' },
  { id: 'key', label: 'Dijital Anahtar', icon: '🔑', route: '/customer/key' },
  { id: 'hotel', label: 'Otel', icon: '🏨', route: '/customer/hotel/' },
  { id: 'staff', label: 'Destek', icon: '👤', route: null },
] as const;

function getDisplayName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  const email = user.email ?? '';
  const part = email.split('@')[0];
  if (part) return part.charAt(0).toUpperCase() + part.slice(1);
  return 'Misafir';
}

export default function CustomerHome() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeStaff, setActiveStaff] = useState<StaffRow[]>([]);
  const [hotelInfo, setHotelInfo] = useState<HotelInfoRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [staffRes, hotelRes] = await Promise.all([
      supabase
        .from('staff')
        .select('id, full_name, department, profile_image, is_online, last_active')
        .eq('is_active', true)
        .eq('is_online', true)
        .order('last_active', { ascending: false }),
      supabase.from('hotel_info').select('id, name, description').limit(1).maybeSingle(),
    ]);
    setActiveStaff(staffRes.data ?? []);
    setHotelInfo(hotelRes.data ?? null);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    load().then(() => setLoading(false));
  }, [load]);

  const displayName = getDisplayName();
  const locationName = hotelInfo?.name ?? 'Valoria Hotel';

  if (loading && activeStaff.length === 0 && !hotelInfo) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.welcomeBlock}>
          <Skeleton height={28} width={220} borderRadius={8} style={{ marginBottom: 6 }} />
          <Skeleton height={18} width={180} borderRadius={6} />
        </View>
        <Skeleton height={48} borderRadius={12} style={{ marginBottom: 24 }} />
        <View style={styles.categoryRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={56} height={56} borderRadius={12} style={{ marginRight: 12 }} />
          ))}
        </View>
        <Text style={styles.sectionTitle}>Sana özel</Text>
        <SkeletonCard />
        <Text style={styles.sectionTitle}>Popüler şu an</Text>
        <Skeleton height={56} borderRadius={12} />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
    >
      <View style={styles.welcomeBlock}>
        <Text style={styles.welcomeTitle}>
          👋 {displayName ? `Hoş geldin, ${displayName}!` : 'Hoş geldin!'}
        </Text>
        <Text style={styles.welcomeLocation}>📍 {locationName}</Text>
      </View>

      <TouchableOpacity
        style={styles.searchBar}
        activeOpacity={0.8}
        onPress={() => {}}
      >
        <Text style={styles.searchPlaceholder}>🔍 Neye ihtiyacın var?</Text>
      </TouchableOpacity>

      <Text style={styles.sectionLabel}>Hızlı kategoriler</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.categoryRow}
        style={styles.categoryScroll}
      >
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat.id}
            style={styles.categoryItem}
            onPress={() => {
              if (cat.route) router.push(cat.route as string);
              else if (cat.id === 'staff' && activeStaff[0])
                router.push({ pathname: '/customer/staff/[id]', params: { id: activeStaff[0].id } });
            }}
            activeOpacity={0.7}
          >
            <View style={styles.categoryIcon}>
              <Text style={styles.categoryEmoji}>{cat.icon}</Text>
            </View>
            <Text style={styles.categoryLabel} numberOfLines={1}>{cat.label}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      <Text style={styles.sectionTitle}>Sana özel</Text>
      <View style={styles.forYouSection}>
        {activeStaff.length > 0 && (
          <TouchableOpacity
            style={styles.forYouCard}
            onPress={() => router.push({ pathname: '/customer/staff/[id]', params: { id: activeStaff[0].id } })}
            activeOpacity={0.8}
          >
            <View style={styles.forYouRow}>
              <Image
                source={{ uri: activeStaff[0].profile_image || 'https://via.placeholder.com/48' }}
                style={styles.forYouAvatar}
              />
              <View style={styles.forYouBody}>
                <Text style={styles.forYouTitle}>{activeStaff[0].full_name || 'Personel'}</Text>
                <Text style={styles.forYouSub}>{activeStaff[0].department || '—'} • Son aktif</Text>
              </View>
              {activeStaff[0].is_online && <View style={styles.onlineDot} />}
            </View>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.hotelCard} onPress={() => router.push('/customer/hotel/')} activeOpacity={0.8}>
          <Text style={styles.hotelCardTitle}>Otel hakkında</Text>
          <Text style={styles.hotelCardDesc} numberOfLines={2}>
            {hotelInfo?.description || 'Lüks konaklama deneyimi. Misafirlerimize en iyi hizmeti sunuyoruz.'}
          </Text>
          <Text style={styles.hotelCardLink}>Devamını oku →</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.sectionTitle}>Popüler şu an</Text>
      <View style={styles.popularCard}>
        <Text style={styles.popularText}>
          🟢 {activeStaff.length} kişi şu an aktif — sorularınız için mesaj atabilirsiniz.
        </Text>
      </View>

      {activeStaff.length > 1 && (
        <>
          <Text style={styles.sectionTitle}>Aktif çalışanlar</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.staffRow}>
            {activeStaff.slice(0, 6).map((staff) => (
              <TouchableOpacity
                key={staff.id}
                style={styles.staffItem}
                onPress={() => router.push({ pathname: '/customer/staff/[id]', params: { id: staff.id } })}
                activeOpacity={0.7}
              >
                <View style={styles.avatarWrap}>
                  <Image
                    source={{ uri: staff.profile_image || 'https://via.placeholder.com/80' }}
                    style={styles.avatar}
                  />
                  {staff.is_online && <View style={styles.onlineBadge} />}
                </View>
                <Text style={styles.staffName} numberOfLines={1}>{staff.full_name || 'Personel'}</Text>
                <Text style={styles.staffDept} numberOfLines={1}>{staff.department || '—'}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + 24 },
  welcomeBlock: { marginBottom: theme.spacing.lg },
  welcomeTitle: { ...theme.typography.title, color: theme.colors.text, marginBottom: 4 },
  welcomeLocation: { ...theme.typography.bodySmall, color: theme.colors.textSecondary },
  searchBar: {
    height: 48,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: theme.spacing.lg,
    justifyContent: 'center',
    marginBottom: theme.spacing.xl,
    ...theme.shadows.sm,
  },
  searchPlaceholder: { ...theme.typography.body, color: theme.colors.textMuted },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    ...theme.typography.titleSmall,
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  categoryScroll: { marginHorizontal: -theme.spacing.lg },
  categoryRow: { flexDirection: 'row', paddingVertical: theme.spacing.sm, paddingRight: theme.spacing.lg, gap: 12 },
  categoryItem: { alignItems: 'center', minWidth: 64 },
  categoryIcon: {
    width: 56,
    height: 56,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    ...theme.shadows.sm,
  },
  categoryEmoji: { fontSize: 24 },
  categoryLabel: { fontSize: 12, fontWeight: '500', color: theme.colors.textSecondary, maxWidth: 72 },
  forYouSection: { gap: theme.spacing.md },
  forYouCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  forYouRow: { flexDirection: 'row', alignItems: 'center' },
  forYouAvatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  forYouBody: { flex: 1 },
  forYouTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  forYouSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
  onlineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: theme.colors.success,
  },
  hotelCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  hotelCardTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 6 },
  hotelCardDesc: { ...theme.typography.bodySmall, color: theme.colors.textSecondary },
  hotelCardLink: { color: theme.colors.primary, fontWeight: '600', marginTop: 8, fontSize: 14 },
  popularCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  popularText: { ...theme.typography.bodySmall, color: theme.colors.textSecondary },
  staffRow: { flexDirection: 'row', gap: 16, paddingVertical: 8 },
  staffItem: { alignItems: 'center', width: 80 },
  avatarWrap: { position: 'relative' },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  onlineBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  staffName: { marginTop: 6, fontWeight: '600', fontSize: 13, color: theme.colors.text },
  staffDept: { fontSize: 11, color: theme.colors.textSecondary },
});
