import { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, ScrollView } from 'react-native';
import { Link } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { formatDateTime } from '@/lib/date';
import { adminTheme } from '@/constants/adminTheme';

type StayRow = {
  id: string;
  full_name: string;
  room_number: string;
  check_in_at: string | null;
  check_out_at: string | null;
  status: string;
  nights_count: number | null;
  total_amount_net: number | null;
  vat_amount: number | null;
  accommodation_tax_amount: number | null;
};

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { style: 'decimal', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
}

function nightsDisplay(checkIn: string | null, checkOut: string | null, nightsCount: number | null): string {
  if (nightsCount != null && nightsCount > 0) return `${nightsCount} gece`;
  if (!checkIn) return '—';
  const start = new Date(checkIn).getTime();
  const end = checkOut ? new Date(checkOut).getTime() : Date.now();
  const nights = Math.max(1, Math.ceil((end - start) / (24 * 60 * 60 * 1000)));
  return `${nights} gece`;
}

export default function StaysScreen() {
  const [rows, setRows] = useState<StayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('guests')
      .select('id, full_name, check_in_at, check_out_at, status, nights_count, total_amount_net, vat_amount, accommodation_tax_amount, rooms(room_number)')
      .not('check_in_at', 'is', null)
      .order('check_in_at', { ascending: false })
      .limit(500);

    if (error) {
      setRows([]);
      return;
    }
    setRows(
      (data ?? []).map((g: { rooms: { room_number: string } | { room_number: string }[] | null; [k: string]: unknown }) => ({
        ...g,
        room_number: (Array.isArray(g.rooms) ? g.rooms[0]?.room_number : g.rooms?.room_number) ?? '—',
      })) as StayRow[]
    );
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading && rows.length === 0) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loading}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Ionicons name="bed-outline" size={24} color={adminTheme.colors.primary} />
        <Text style={styles.headerTitle}>Konaklama geçmişi</Text>
      </View>
      <Text style={styles.hint}>Kim hangi odada kaldı, ne zaman giriş/çıkış yaptı, kaç gece, tutar. Maliye raporu ile uyumludur.</Text>
      <FlatList
        data={rows}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
        renderItem={({ item }) => (
          <Link href={`/admin/guests/${item.id}`} asChild>
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.name}>{item.full_name}</Text>
                <View style={[styles.statusBadge, item.status === 'checked_in' ? styles.statusCheckedIn : styles.statusCheckedOut]}>
                  <Text style={styles.statusText}>{item.status === 'checked_in' ? 'Odada' : 'Çıkış yaptı'}</Text>
                </View>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="bed" size={14} color="#64748b" />
                <Text style={styles.metaText}>Oda {item.room_number}</Text>
              </View>
              <View style={styles.metaRow}>
                <Ionicons name="calendar-outline" size={14} color="#64748b" />
                <Text style={styles.metaText}>
                  Giriş: {item.check_in_at ? formatDateTime(item.check_in_at) : '—'}
                </Text>
              </View>
              {item.check_out_at && (
                <View style={styles.metaRow}>
                  <Ionicons name="exit-outline" size={14} color="#64748b" />
                  <Text style={styles.metaText}>Çıkış: {formatDateTime(item.check_out_at)}</Text>
                </View>
              )}
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>Süre: </Text>
                <Text style={styles.metaText}>{nightsDisplay(item.check_in_at, item.check_out_at, item.nights_count)}</Text>
              </View>
              {(item.total_amount_net != null || item.vat_amount != null) && (
                <View style={styles.metaRow}>
                  <Text style={styles.metaLabel}>Tutar: </Text>
                  <Text style={styles.amountText}>
                    {item.total_amount_net != null ? `${fmtMoney(Number(item.total_amount_net))} ₺ (net)` : ''}
                    {item.vat_amount != null ? ` · KDV ${fmtMoney(Number(item.vat_amount))} ₺` : ''}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loading: { fontSize: 14, color: '#718096' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 20, paddingBottom: 8 },
  headerTitle: { fontSize: 20, fontWeight: '700', color: '#1a202c' },
  hint: { fontSize: 12, color: '#64748b', paddingHorizontal: 20, paddingBottom: 16 },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  name: { fontSize: 17, fontWeight: '700', color: '#1a202c' },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8 },
  statusCheckedIn: { backgroundColor: '#c6f6d5' },
  statusCheckedOut: { backgroundColor: '#e2e8f0' },
  statusText: { fontSize: 12, fontWeight: '600', color: '#2d3748' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  metaLabel: { fontSize: 13, color: '#64748b' },
  metaText: { fontSize: 13, color: '#4a5568' },
  amountText: { fontSize: 13, fontWeight: '600', color: '#1a365d' },
});
