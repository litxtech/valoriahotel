import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { openWhatsApp, openTel, openMailto, whatsappUrlFromPhone } from '@/lib/contactLaunch';

type ContractContact = {
  guest_id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  last_accepted_at: string;
  room_number: string | null;
};

type GuestContact = {
  id: string;
  full_name: string;
  phone: string | null;
  email: string | null;
  room_number: string | null;
  status: string;
};

type StaffContact = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  department: string | null;
};

function norm(s: string | null | undefined): string {
  return (s ?? '').trim();
}

function ContactButtons({ phone, email }: { phone: string | null; email: string | null }) {
  const p = norm(phone);
  const e = norm(email);
  const canWa = p ? !!whatsappUrlFromPhone(p) : false;
  return (
    <View style={styles.actionRow}>
      <TouchableOpacity
        style={[styles.actionBtn, styles.actionWa, (!canWa || !p) && styles.actionDisabled]}
        onPress={() => p && openWhatsApp(p)}
        disabled={!canWa || !p}
        activeOpacity={0.85}
      >
        <Ionicons name="logo-whatsapp" size={18} color={!canWa || !p ? '#94a3b8' : '#fff'} />
        <Text style={[styles.actionBtnText, (!canWa || !p) && styles.actionBtnTextDisabled]}>WhatsApp</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, styles.actionTel, !p && styles.actionDisabled]}
        onPress={() => p && openTel(p)}
        disabled={!p}
        activeOpacity={0.85}
      >
        <Ionicons name="call-outline" size={18} color={!p ? '#94a3b8' : '#fff'} />
        <Text style={[styles.actionBtnText, !p && styles.actionBtnTextDisabled]}>Ara</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.actionBtn, styles.actionMail, !e && styles.actionDisabled]}
        onPress={() => e && openMailto(e)}
        disabled={!e}
        activeOpacity={0.85}
      >
        <Ionicons name="mail-outline" size={18} color={!e ? '#94a3b8' : '#fff'} />
        <Text style={[styles.actionBtnText, !e && styles.actionBtnTextDisabled]}>E-posta</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function ContactDirectoryScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [contractContacts, setContractContacts] = useState<ContractContact[]>([]);
  const [otherGuests, setOtherGuests] = useState<GuestContact[]>([]);
  const [staffContacts, setStaffContacts] = useState<StaffContact[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);

    const { data: accRows, error: accErr } = await supabase
      .from('contract_acceptances')
      .select('guest_id, accepted_at, room_id, guests(id, full_name, phone, email)')
      .not('guest_id', 'is', null)
      .order('accepted_at', { ascending: false })
      .limit(600);

    if (accErr) {
      setError(accErr.message);
      setContractContacts([]);
      setOtherGuests([]);
      setStaffContacts([]);
      return;
    }

    const roomIds = [...new Set((accRows ?? []).map((r) => r.room_id).filter(Boolean))] as string[];
    let roomMap: Record<string, string> = {};
    if (roomIds.length > 0) {
      const { data: rooms } = await supabase.from('rooms').select('id, room_number').in('id', roomIds);
      roomMap = (rooms ?? []).reduce((m, r) => ({ ...m, [r.id]: r.room_number }), {} as Record<string, string>);
    }

    const contractByGuest = new Map<string, ContractContact>();
    for (const r of accRows ?? []) {
      const gid = r.guest_id as string;
      if (contractByGuest.has(gid)) continue;
      const raw = r.guests as
        | { id: string; full_name: string | null; phone: string | null; email: string | null }
        | { id: string; full_name: string | null; phone: string | null; email: string | null }[]
        | null;
      const g = Array.isArray(raw) ? raw[0] : raw;
      if (!g) continue;
      const phone = norm(g.phone) || null;
      const email = norm(g.email) || null;
      if (!phone && !email) continue;
      const rid = r.room_id as string | null;
      contractByGuest.set(gid, {
        guest_id: gid,
        full_name: norm(g.full_name) || 'İsimsiz',
        phone,
        email,
        last_accepted_at: r.accepted_at as string,
        room_number: rid ? roomMap[rid] ?? null : null,
      });
    }
    setContractContacts([...contractByGuest.values()].sort((a, b) => b.last_accepted_at.localeCompare(a.last_accepted_at)));

    const contractGuestIds = new Set(contractByGuest.keys());

    const { data: guestRpc, error: guestErr } = await supabase.rpc('admin_list_guests', { p_filter: 'all' });
    if (guestErr) {
      setError((e) => e ?? guestErr.message);
      setOtherGuests([]);
    } else {
      const list = (guestRpc ?? []) as Array<{
        id: string;
        full_name: string;
        phone: string | null;
        email: string | null;
        room_number: string | null;
        status: string;
        deleted_at?: string | null;
      }>;
      const others: GuestContact[] = [];
      for (const row of list) {
        if (row.deleted_at) continue;
        const phone = norm(row.phone) || null;
        const email = norm(row.email) || null;
        if (!phone && !email) continue;
        if (contractGuestIds.has(row.id)) continue;
        others.push({
          id: row.id,
          full_name: row.full_name || 'İsimsiz',
          phone,
          email,
          room_number: row.room_number,
          status: row.status,
        });
      }
      others.sort((a, b) => a.full_name.localeCompare(b.full_name, 'tr'));
      setOtherGuests(others);
    }

    const { data: staffRows, error: staffErr } = await supabase
      .from('staff')
      .select('id, full_name, email, phone, department')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name');

    if (staffErr) {
      setError((e) => e ?? staffErr.message);
      setStaffContacts([]);
    } else {
      const staffList: StaffContact[] = (staffRows ?? [])
        .map((s) => ({
          id: s.id,
          full_name: s.full_name,
          email: norm(s.email) || null,
          phone: norm(s.phone) || null,
          department: s.department,
        }))
        .filter((s) => s.email || s.phone);
      setStaffContacts(staffList);
    }
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const q = query.trim().toLowerCase();

  const filterContract = useMemo(() => {
    if (!q) return contractContacts;
    return contractContacts.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        norm(c.phone).toLowerCase().includes(q) ||
        norm(c.email).toLowerCase().includes(q) ||
        norm(c.room_number).toLowerCase().includes(q)
    );
  }, [contractContacts, q]);

  const filterGuests = useMemo(() => {
    if (!q) return otherGuests;
    return otherGuests.filter(
      (c) =>
        c.full_name.toLowerCase().includes(q) ||
        norm(c.phone).toLowerCase().includes(q) ||
        norm(c.email).toLowerCase().includes(q) ||
        norm(c.room_number).toLowerCase().includes(q) ||
        c.status.toLowerCase().includes(q)
    );
  }, [otherGuests, q]);

  const filterStaff = useMemo(() => {
    if (!q) return staffContacts;
    return staffContacts.filter(
      (s) =>
        norm(s.full_name).toLowerCase().includes(q) ||
        norm(s.email).toLowerCase().includes(q) ||
        norm(s.phone).toLowerCase().includes(q) ||
        norm(s.department).toLowerCase().includes(q)
    );
  }, [staffContacts, q]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        <Text style={styles.loadingText}>İletişim bilgileri yükleniyor…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
      keyboardShouldPersistTaps="handled"
    >
      {error ? (
        <View style={styles.errorBanner}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      <Text style={styles.intro}>
        Sözleşme formunda telefon veya e-posta verip onaylayan misafirler üst bölümde listelenir. Diğer misafir kayıtları ve personel aşağıdadır. WhatsApp, arama ve e-posta için
        kısayol düğmelerini kullanın.
      </Text>

      <View style={styles.searchWrap}>
        <Ionicons name="search-outline" size={20} color="#64748b" style={styles.searchIcon} />
        <TextInput
          style={styles.searchInput}
          placeholder="İsim, telefon, e-posta, oda…"
          placeholderTextColor="#94a3b8"
          value={query}
          onChangeText={setQuery}
          autoCorrect={false}
          autoCapitalize="none"
        />
        {query.length > 0 ? (
          <TouchableOpacity onPress={() => setQuery('')} hitSlop={12}>
            <Ionicons name="close-circle" size={22} color="#94a3b8" />
          </TouchableOpacity>
        ) : null}
      </View>

      <Text style={styles.sectionTitle}>Sözleşme ile paylaşılan iletişim</Text>
      <Text style={styles.sectionSub}>
        Formda girilen telefon / e-posta ve sözleşme onayı olan misafirler (son onay tarihine göre).
      </Text>
      {filterContract.length === 0 ? (
        <Text style={styles.empty}>Kayıt yok veya aramanızla eşleşmedi.</Text>
      ) : (
        filterContract.map((c) => (
          <View key={c.guest_id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardName}>{c.full_name}</Text>
                {c.phone ? <Text style={styles.cardLine}>{c.phone}</Text> : null}
                {c.email ? <Text style={styles.cardLine}>{c.email}</Text> : null}
                <Text style={styles.cardMeta}>
                  Son onay: {new Date(c.last_accepted_at).toLocaleString('tr-TR')}
                  {c.room_number ? ` · Oda ${c.room_number}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailLink}
                onPress={() => router.push(`/admin/guests/${c.guest_id}`)}
                hitSlop={8}
              >
                <Text style={styles.detailLinkText}>Misafir</Text>
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.primary} />
              </TouchableOpacity>
            </View>
            <ContactButtons phone={c.phone} email={c.email} />
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Diğer misafir iletişimleri</Text>
      <Text style={styles.sectionSub}>Telefon veya e-postası olan misafirler; sözleşme bölümünde olanlar burada tekrarlanmaz.</Text>
      {filterGuests.length === 0 ? (
        <Text style={styles.empty}>Kayıt yok veya aramanızla eşleşmedi.</Text>
      ) : (
        filterGuests.map((g) => (
          <View key={g.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardName}>{g.full_name}</Text>
                {g.phone ? <Text style={styles.cardLine}>{g.phone}</Text> : null}
                {g.email ? <Text style={styles.cardLine}>{g.email}</Text> : null}
                <Text style={styles.cardMeta}>
                  {g.status}
                  {g.room_number ? ` · Oda ${g.room_number}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.detailLink}
                onPress={() => router.push(`/admin/guests/${g.id}`)}
                hitSlop={8}
              >
                <Text style={styles.detailLinkText}>Misafir</Text>
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.primary} />
              </TouchableOpacity>
            </View>
            <ContactButtons phone={g.phone} email={g.email} />
          </View>
        ))
      )}

      <Text style={[styles.sectionTitle, styles.sectionSpacer]}>Personel</Text>
      <Text style={styles.sectionSub}>Aktif personel; kayıtlı e-posta veya telefonu olanlar.</Text>
      {filterStaff.length === 0 ? (
        <Text style={styles.empty}>Kayıt yok veya aramanızla eşleşmedi.</Text>
      ) : (
        filterStaff.map((s) => (
          <View key={s.id} style={styles.card}>
            <View style={styles.cardTop}>
              <View style={styles.cardTitleBlock}>
                <Text style={styles.cardName}>{s.full_name ?? '—'}</Text>
                {s.department ? <Text style={styles.cardDept}>{s.department}</Text> : null}
                {s.phone ? <Text style={styles.cardLine}>{s.phone}</Text> : null}
                {s.email ? <Text style={styles.cardLine}>{s.email}</Text> : null}
              </View>
              <TouchableOpacity
                style={styles.detailLink}
                onPress={() => router.push(`/admin/staff/${s.id}`)}
                hitSlop={8}
              >
                <Text style={styles.detailLinkText}>Profil</Text>
                <Ionicons name="chevron-forward" size={18} color={adminTheme.colors.primary} />
              </TouchableOpacity>
            </View>
            <ContactButtons phone={s.phone} email={s.email} />
          </View>
        ))
      )}

      {Platform.OS === 'web' ? <View style={{ height: 24 }} /> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#f7fafc' },
  loadingText: { marginTop: 12, color: '#64748b', fontSize: 14 },
  intro: { fontSize: 13, color: '#64748b', lineHeight: 20, marginBottom: 14 },
  errorBanner: { backgroundColor: '#fee2e2', padding: 12, borderRadius: 10, marginBottom: 12 },
  errorText: { color: '#b91c1c', fontSize: 13 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingHorizontal: 12,
    marginBottom: 20,
  },
  searchIcon: { marginRight: 8 },
  searchInput: { flex: 1, paddingVertical: Platform.OS === 'ios' ? 12 : 10, fontSize: 15, color: '#1e293b' },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: '#0f172a', marginBottom: 4 },
  sectionSub: { fontSize: 12, color: '#64748b', marginBottom: 12, lineHeight: 18 },
  sectionSpacer: { marginTop: 28 },
  empty: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic', marginBottom: 16 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 12,
  },
  cardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  cardTitleBlock: { flex: 1, minWidth: 0 },
  cardName: { fontSize: 16, fontWeight: '700', color: '#1e293b' },
  cardDept: { fontSize: 13, color: '#64748b', marginTop: 2 },
  cardLine: { fontSize: 14, color: '#334155', marginTop: 4 },
  cardMeta: { fontSize: 12, color: '#94a3b8', marginTop: 6 },
  detailLink: { flexDirection: 'row', alignItems: 'center', marginLeft: 8 },
  detailLinkText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.primary },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    flexGrow: 1,
    justifyContent: 'center',
    minWidth: '28%',
  },
  actionWa: { backgroundColor: '#25D366' },
  actionTel: { backgroundColor: '#0369a1' },
  actionMail: { backgroundColor: '#4f46e5' },
  actionDisabled: { backgroundColor: '#e2e8f0' },
  actionBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  actionBtnTextDisabled: { color: '#94a3b8' },
});
