import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Modal, TextInput, Alert, ActivityIndicator } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { invokeEdgeWithAuth } from '@/lib/invokeEdgeWithAuth';
import { getEdgeFunctionErrorMessage } from '@/lib/functionsError';
import { useAuthStore } from '@/stores/authStore';
import { CachedImage } from '@/components/CachedImage';
import { adminTheme } from '@/constants/adminTheme';
import { getAuthProviderLabel } from '@/lib/updateGuestLoginInfo';

const BAN_DURATIONS = [
  { label: '1 saat', hours: 1 },
  { label: '24 saat', hours: 24 },
  { label: '1 hafta', hours: 24 * 7 },
  { label: '1 ay', hours: 24 * 30 },
  { label: '1 yıl', hours: 24 * 365 },
];

type Guest = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  status: string;
  created_at: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
  auth_user_id?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  last_login_device_id?: string | null;
  is_guest_app_account?: boolean;
  photo_url?: string | null;
  last_login_platform?: string | null;
  last_login_at?: string | null;
  auth_provider?: string | null;
  auth_user_created_at?: string | null;
};

function formatPlatform(platform: string | null | undefined): string {
  if (!platform) return '';
  const m: Record<string, string> = { android: 'Android', ios: 'iOS', web: 'Web' };
  return m[platform] ?? platform;
}

export default function GuestsList() {
  const currentStaffId = useAuthStore((s) => s.staff?.id);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [riskyDeviceIds, setRiskyDeviceIds] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<'pending' | 'all'>('all');
  const [loading, setLoading] = useState(true);
  const [deleteTarget, setDeleteTarget] = useState<Guest | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [banTarget, setBanTarget] = useState<Guest | null>(null);
  const [banHours, setBanHours] = useState(24);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const now = new Date().toISOString();
    try {
      // Admin listesi RPC ile (RLS bypass); böylece admin her zaman misafirleri görür
      const { data: guestRows, error: guestError } = await supabase.rpc('admin_list_guests', {
        p_filter: filter === 'pending' ? 'pending' : 'all',
      });
      if (guestError) {
        setLoadError(guestError.message);
        setGuests([]);
        setLoading(false);
        return;
      }
      setLoadError(null);
      const list = (guestRows ?? []) as Array<{
        id: string;
        full_name: string;
        phone: string | null;
        email: string | null;
        status: string;
        created_at: string;
        room_id: string | null;
        room_number: string | null;
        auth_user_id?: string | null;
        banned_until?: string | null;
        deleted_at?: string | null;
        last_login_device_id?: string | null;
        is_guest_app_account?: boolean;
        photo_url?: string | null;
        last_login_platform?: string | null;
        last_login_at?: string | null;
        auth_provider?: string | null;
        auth_user_created_at?: string | null;
      }>;
      setGuests(
        list.map((row) => ({
          id: row.id,
          full_name: row.full_name,
          phone: row.phone,
          email: row.email,
          status: row.status,
          created_at: row.created_at,
          room_id: row.room_id,
          rooms: row.room_number ? { room_number: row.room_number } : null,
          auth_user_id: row.auth_user_id,
          banned_until: row.banned_until,
          deleted_at: row.deleted_at,
          last_login_device_id: row.last_login_device_id,
          is_guest_app_account: row.is_guest_app_account,
          photo_url: row.photo_url,
          last_login_platform: row.last_login_platform,
          last_login_at: row.last_login_at,
          auth_provider: row.auth_provider,
          auth_user_created_at: row.auth_user_created_at,
        }))
      );

      const [staffDeleted, staffBanned, guestsDeleted, guestsBanned] = await Promise.all([
        supabase.from('staff').select('last_login_device_id').not('deleted_at', 'is', null),
        supabase.from('staff').select('last_login_device_id').gt('banned_until', now),
        supabase.from('guests').select('last_login_device_id').not('deleted_at', 'is', null),
        supabase.from('guests').select('last_login_device_id').gt('banned_until', now),
      ]);
      const ids = new Set<string>();
      for (const r of [...(staffDeleted.data ?? []), ...(staffBanned.data ?? []), ...(guestsDeleted.data ?? []), ...(guestsBanned.data ?? [])]) {
        const d = (r as { last_login_device_id?: string | null }).last_login_device_id;
        if (d && String(d).trim()) ids.add(String(d).trim());
      }
      setRiskyDeviceIds(ids);
    } catch (e) {
      setLoadError((e as Error)?.message ?? 'Liste yüklenemedi');
      setGuests([]);
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const isRisky = (g: Guest) => {
    const did = g.last_login_device_id?.trim();
    if (!did || !riskyDeviceIds.has(did)) return false;
    const created = new Date(g.created_at).getTime();
    return created >= Date.now() - 30 * 24 * 60 * 60 * 1000;
  };

  const confirmDelete = async () => {
    if (!deleteTarget || !adminReason.trim() || !deleteTarget.auth_user_id) {
      Alert.alert('Eksik', 'Silme nedeni girin. Sadece uygulama ile giriş yapmış misafir silinebilir.');
      return;
    }
    setDeleting(true);
    try {
      const { data, error } = await invokeEdgeWithAuth('delete-user-account', {
        mode: 'admin',
        target_auth_id: deleteTarget.auth_user_id,
        user_type: 'guest',
        admin_reason: adminReason.trim(),
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      setDeleteTarget(null);
      setAdminReason('');
      await load();
      Alert.alert('Başarılı', 'Hesap silindi.');
    } catch (e) {
      const msg = await getEdgeFunctionErrorMessage(e);
      Alert.alert('Hata', msg || 'Silinemedi.');
    } finally {
      setDeleting(false);
    }
  };

  const confirmBan = async () => {
    if (!banTarget || !currentStaffId) return;
    setBanning(true);
    try {
      const until = new Date(Date.now() + banHours * 60 * 60 * 1000).toISOString();
      await supabase.from('guests').update({ banned_until: until, banned_by: currentStaffId, ban_reason: banReason.trim() || null }).eq('id', banTarget.id);
      setBanTarget(null);
      setBanReason('');
      setBanHours(24);
      await load();
      Alert.alert('Başarılı', 'Misafir banlandı.');
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban uygulanamadı.');
    } finally {
      setBanning(false);
    }
  };

  const unban = async (g: Guest) => {
    try {
      await supabase.from('guests').update({ banned_until: null, banned_by: null, ban_reason: null }).eq('id', g.id);
      await load();
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Ban kaldırılamadı.');
    }
  };

  const formatDate = (s: string) => new Date(s).toLocaleString('tr-TR');

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, filter === 'pending' && styles.tabActive]} onPress={() => setFilter('pending')}>
          <Text style={[styles.tabText, filter === 'pending' && styles.tabTextActive]}>Onay Bekleyen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, filter === 'all' && styles.tabActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>Tümü</Text>
        </TouchableOpacity>
      </View>
      {loadError && (
        <View style={styles.errorBanner}>
          <Ionicons name="warning-outline" size={20} color={adminTheme.colors.error} />
          <Text style={styles.errorText}>{loadError}</Text>
          <TouchableOpacity onPress={() => load()}>
            <Text style={styles.errorRetry}>Tekrar dene</Text>
          </TouchableOpacity>
        </View>
      )}
      {loading ? (
        <Text style={styles.loading}>Yükleniyor...</Text>
      ) : (
        <FlatList
          data={guests}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Link href={`/admin/guests/${item.id}`} asChild>
                <TouchableOpacity style={styles.cardInner} activeOpacity={0.8}>
                  <View style={styles.cardRow}>
                    <View style={styles.avatarWrap}>
                      {item.photo_url ? (
                        <CachedImage uri={item.photo_url} style={styles.avatarImg} contentFit="cover" />
                      ) : (
                        <Text style={styles.avatarLetter}>{(item.full_name || '?').charAt(0).toUpperCase()}</Text>
                      )}
                    </View>
                    <View style={styles.cardBody}>
                      <Text style={styles.name}>{item.full_name}</Text>
                  {(item.phone || item.email) && <Text style={styles.meta}>{item.phone || item.email}</Text>}
                  <View style={styles.badges}>
                    {item.is_guest_app_account && <View style={styles.badgeGuestApp}><Text style={styles.badgeText}>Misafir hesap (Guest app)</Text></View>}
                    {item.deleted_at && <View style={styles.badgeDeleted}><Text style={styles.badgeText}>Silindi</Text></View>}
                    {item.banned_until && new Date(item.banned_until) > new Date() && <View style={styles.badgeBanned}><Text style={styles.badgeText}>Banlı</Text></View>}
                    {isRisky(item) && <View style={styles.badgeRisky}><Text style={styles.badgeText}>Riskli</Text></View>}
                    <View style={[styles.badge, item.status === 'pending' && styles.badgePending]}>
                      <Text style={styles.badgeText}>{item.status}</Text>
                    </View>
                  </View>
                      <Text style={styles.date}>Kayıt: {formatDate(item.created_at)}</Text>
                      {(item.last_login_platform || item.auth_provider) && (
                        <Text style={styles.deviceInfo}>
                          {[formatPlatform(item.last_login_platform), getAuthProviderLabel(item.auth_provider ?? undefined)].filter(Boolean).join(' · ')}
                        </Text>
                      )}
                      {item.last_login_at && (
                        <Text style={styles.lastLogin}>Son giriş: {formatDate(item.last_login_at)}</Text>
                      )}
                      {item.rooms?.room_number && <Text style={styles.room}>Oda {item.rooms.room_number}</Text>}
                    </View>
                  </View>
                </TouchableOpacity>
              </Link>
              {!item.deleted_at && item.auth_user_id && (
                <View style={styles.actionRow}>
                  {item.banned_until && new Date(item.banned_until) > new Date() ? (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => unban(item)}>
                      <Text style={styles.actionBtnText}>Ban kaldır</Text>
                    </TouchableOpacity>
                  ) : (
                    <TouchableOpacity style={styles.actionBtn} onPress={() => setBanTarget(item)}>
                      <Ionicons name="ban-outline" size={18} color={adminTheme.colors.warning} />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity style={styles.actionBtn} onPress={() => setDeleteTarget(item)}>
                    <Ionicons name="trash-outline" size={18} color={adminTheme.colors.error} />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        />
      )}

      <Modal visible={!!banTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Misafiri banla</Text>
            {banTarget && <Text style={styles.modalSubtitle}>{banTarget.full_name}</Text>}
            <View style={styles.durationRow}>
              {BAN_DURATIONS.map((d) => (
                <TouchableOpacity key={d.label} style={[styles.durationChip, banHours === d.hours && styles.durationChipActive]} onPress={() => setBanHours(d.hours)}>
                  <Text style={[styles.durationChipText, banHours === d.hours && styles.durationChipTextActive]}>{d.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.modalLabel}>Neden (isteğe bağlı)</Text>
            <TextInput style={styles.modalInputShort} value={banReason} onChangeText={setBanReason} placeholder="Ban nedeni..." placeholderTextColor={adminTheme.colors.textMuted} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setBanTarget(null); setBanReason(''); setBanHours(24); }}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, banning && styles.modalConfirmDisabled]} onPress={confirmBan} disabled={banning}>
                {banning ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Banla</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!deleteTarget} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>Misafir hesabını sil</Text>
            {deleteTarget && (
              <Text style={styles.modalSubtitle}>
                {deleteTarget.full_name} — Uygulama açtığında "Hesabınız silindi" görüp lobiye dönecek.
              </Text>
            )}
            <Text style={styles.modalLabel}>Silme nedeni (zorunlu)</Text>
            <TextInput style={styles.modalInput} value={adminReason} onChangeText={setAdminReason} placeholder="Neden..." placeholderTextColor={adminTheme.colors.textMuted} multiline numberOfLines={2} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.modalCancel} onPress={() => { setDeleteTarget(null); setAdminReason(''); }}>
                <Text style={styles.modalCancelText}>İptal</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalConfirm, deleting && styles.modalConfirmDisabled]} onPress={confirmDelete} disabled={deleting || !adminReason.trim()}>
                {deleting ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.modalConfirmText}>Sil</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}


const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  tabs: { flexDirection: 'row', padding: 16, gap: 8 },
  tab: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e2e8f0', alignItems: 'center' },
  tabActive: { backgroundColor: '#1a365d' },
  tabText: { color: '#4a5568', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  loading: { padding: 24 },
  list: { padding: 16 },
  cardRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    overflow: 'hidden',
  },
  avatarImg: { width: 48, height: 48, borderRadius: 24 },
  avatarLetter: { fontSize: 20, fontWeight: '700', color: '#4a5568' },
  cardBody: { flex: 1, minWidth: 0 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  name: { fontSize: 18, fontWeight: '700', color: '#1a202c' },
  meta: { fontSize: 14, color: '#718096', marginTop: 4 },
  cardInner: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  badgeGuestApp: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#ccfbf1' },
  badgeDeleted: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: adminTheme.colors.errorLight },
  badgeBanned: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: adminTheme.colors.warningLight },
  badgeRisky: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#fef3c7' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#c6f6d5' },
  badgePending: { backgroundColor: '#feebc8' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1a202c' },
  date: { fontSize: 12, color: '#a0aec0', marginTop: 4 },
  deviceInfo: { fontSize: 12, color: '#64748b', marginTop: 2 },
  lastLogin: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  room: { fontSize: 14, color: '#2b6cb0', marginTop: 4 },
  actionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#e2e8f0' },
  actionBtn: { padding: 8 },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: adminTheme.colors.primary },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalBox: { backgroundColor: '#fff', borderRadius: 16, padding: 20, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 16 },
  modalLabel: { fontSize: 14, fontWeight: '600', color: '#475569', marginBottom: 8 },
  modalInputShort: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, marginBottom: 16 },
  modalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, padding: 12, fontSize: 14, minHeight: 60, textAlignVertical: 'top', marginBottom: 16 },
  durationRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  durationChip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, backgroundColor: '#f1f5f9' },
  durationChipActive: { backgroundColor: adminTheme.colors.primary },
  durationChipText: { fontSize: 14, fontWeight: '600', color: '#1a202c' },
  durationChipTextActive: { color: '#fff' },
  modalActions: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  modalCancel: { paddingVertical: 10, paddingHorizontal: 20 },
  modalCancelText: { fontSize: 15, fontWeight: '600', color: '#64748b' },
  modalConfirm: { backgroundColor: adminTheme.colors.error, paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, minWidth: 80, alignItems: 'center' },
  modalConfirmDisabled: { opacity: 0.7 },
  modalConfirmText: { fontSize: 15, fontWeight: '600', color: '#fff' },
  errorBanner: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: 16, margin: 16, backgroundColor: adminTheme.colors.errorLight, borderRadius: 8, borderWidth: 1, borderColor: adminTheme.colors.error },
  errorText: { flex: 1, fontSize: 14, color: '#1a202c' },
  errorRetry: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.primary },
});
