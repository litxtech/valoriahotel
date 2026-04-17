import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { guestGetOrCreateConversationWithStaff } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  is_online: boolean | null;
  role?: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
};

export default function NewChatScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ staffId?: string }>();
  const { appToken, setAppToken } = useGuestMessagingStore();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingId, setStartingId] = useState<string | null>(null);

  useEffect(() => {
    loadStaff();
  }, []);

  useEffect(() => {
    if (!loading && params.staffId && !startingId) {
      startChat(params.staffId);
    }
  }, [loading, params.staffId]);

  /** Giriş yapmış kullanıcı (Apple/Google dahil) için app_token getir/oluştur. */
  const ensureAppToken = async (): Promise<string | null> => {
    let token = useGuestMessagingStore.getState().appToken;
    if (token) return token;
    await supabase.auth.refreshSession();
    const { data: { session } } = await supabase.auth.getSession();
    const row = await getOrCreateGuestForCaller(session?.user);
    const t = row?.app_token ?? null;
    if (t) await setAppToken(t);
    return t;
  };

  const loadStaff = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) await ensureAppToken();
    // Giriş yapmış kullanıcı: staff tablosundan çek (verification_badge dahil)
    if (session) {
      const { data: directData } = await supabase
        .from('staff')
        .select('id, full_name, department, profile_image, is_online, role, verification_badge')
        .eq('is_active', true)
        .is('deleted_at', null)
        .order('full_name');
      const direct = (directData ?? []) as StaffRow[];
      setStaff(
        sortStaffAdminFirst(direct, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr'))
      );
      setLoading(false);
      return;
    }
    // Giriş yok: RPC ile personel listesi (anon)
    const { data: rpcData } = await supabase.rpc('messaging_list_staff_for_guest');
    const rows: StaffRow[] = Array.isArray(rpcData) ? rpcData : rpcData ? [rpcData] : [];
    setStaff(sortStaffAdminFirst(rows, (a, b) => (a.full_name || '').localeCompare(b.full_name || '', 'tr')));
    setLoading(false);
  };

  const startChat = async (staffId: string) => {
    let token = appToken;
    if (!token) token = await ensureAppToken();
    if (!token) {
      router.replace('/customer/(tabs)/messages');
      return;
    }
    setStartingId(staffId);
    const convId = await guestGetOrCreateConversationWithStaff(token, staffId);
    setStartingId(null);
    if (convId) router.replace({ pathname: '/customer/chat/[id]', params: { id: convId } });
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Personel ile sohbet başlat</Text>
      <FlatList
        data={staff}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          !loading ? (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>Listelenecek personel bulunamadı.</Text>
              <Text style={styles.emptySub}>Aktif personel eklenince burada görünecektir.</Text>
            </View>
          ) : null
        }
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={() => startChat(item.id)}
            disabled={!!startingId}
            activeOpacity={0.7}
          >
            <AvatarWithBadge badge={item.verification_badge ?? null} avatarSize={56} badgeSize={12} showBadge={false}>
              <CachedImage uri={item.profile_image || 'https://via.placeholder.com/56'} style={styles.avatar} contentFit="cover" />
            </AvatarWithBadge>
            <View style={styles.rowBody}>
              <StaffNameWithBadge name={item.full_name || 'Personel'} badge={item.verification_badge ?? null} textStyle={styles.name} />
              <Text style={styles.dept}>
                {item.department || item.role || '—'}
                {item.is_online ? '  ·  🟢 Çevrimiçi' : ''}
              </Text>
            </View>
            {startingId === item.id ? (
              <ActivityIndicator size="small" color={MESSAGING_COLORS.primary} />
            ) : (
              <Text style={styles.arrow}>→</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: MESSAGING_COLORS.textSecondary,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: { width: 48, height: 48, borderRadius: 24, marginRight: 12 },
  rowBody: { flex: 1 },
  name: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  dept: { fontSize: 13, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  arrow: { fontSize: 18, color: MESSAGING_COLORS.textSecondary },
  empty: { padding: 32, alignItems: 'center' },
  emptyText: { fontSize: 16, color: MESSAGING_COLORS.textSecondary },
  emptySub: { fontSize: 14, color: MESSAGING_COLORS.textSecondary, marginTop: 8 },
});
