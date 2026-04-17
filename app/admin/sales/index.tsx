import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, RefreshControl, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { useAuthStore } from '@/stores/authStore';
import { canAccessReservationSales } from '@/lib/staffPermissions';

type SummaryRow = {
  sales_count: number;
  total_net_amount: number;
  total_commission_amount: number;
  pending_commission_amount: number;
  paid_commission_amount: number;
};

type SaleRow = {
  id: string;
  created_at: string;
  customer_full_name: string;
  customer_phone: string;
  check_in_date: string | null;
  check_out_date: string | null;
  reservation_status: string;
  net_amount: number;
  commission_amount: number;
  commission_status: string;
};

function fmtMoneyTry(n: number): string {
  try {
    return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(n) + ' ₺';
  } catch {
    return `${Math.round(n)} ₺`;
  }
}

export default function AdminSalesListScreen() {
  const router = useRouter();
  const staff = useAuthStore((s) => s.staff);
  const canUse = canAccessReservationSales(staff);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summary, setSummary] = useState<SummaryRow | null>(null);
  const [sales, setSales] = useState<SaleRow[]>([]);

  const load = useCallback(async () => {
    if (!staff?.id || !canUse) return;
    const [{ data: sumData }, { data: listData }] = await Promise.all([
      supabase.rpc('my_sales_commission_summary', { p_from: null, p_to: null }),
      supabase
        .from('reservation_sales')
        .select(
          'id, created_at, customer_full_name, customer_phone, check_in_date, check_out_date, reservation_status, net_amount, commission_amount, commission_status'
        )
        .order('created_at', { ascending: false })
        .limit(80),
    ]);
    const sumRow = (Array.isArray(sumData) ? sumData[0] : sumData) as unknown as SummaryRow | null;
    setSummary(sumRow ?? null);
    setSales(((listData ?? []) as unknown as SaleRow[]) ?? []);
  }, [staff?.id, canUse]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (!canUse) {
    return (
      <View style={styles.center}>
        <Ionicons name="lock-closed-outline" size={28} color={adminTheme.colors.textMuted} />
        <Text style={styles.deniedTitle}>Erişim yok</Text>
        <Text style={styles.deniedDesc}>Bu modül için admin veya resepsiyon şefi / satış yetkisi gerekir.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.primary} />}
    >
      <View style={styles.headerRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.h1}>Satış & Komisyon</Text>
          <Text style={styles.h2}>İşletme rezervasyon satışları ve komisyon durumu.</Text>
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/admin/sales/new')} activeOpacity={0.85}>
          <Ionicons name="add" size={18} color="#fff" />
          <Text style={styles.addBtnText}>Yeni</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Satış</Text>
          <Text style={styles.statVal}>{summary?.sales_count ?? 0}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Net</Text>
          <Text style={styles.statVal}>{fmtMoneyTry(summary?.total_net_amount ?? 0)}</Text>
        </View>
        <View style={styles.stat}>
          <Text style={styles.statLabel}>Komisyon</Text>
          <Text style={styles.statVal}>{fmtMoneyTry(summary?.total_commission_amount ?? 0)}</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>Kayıtlar</Text>
      {sales.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>Henüz satış kaydı yok.</Text>
        </View>
      ) : (
        sales.map((s) => (
          <TouchableOpacity
            key={s.id}
            style={styles.card}
            onPress={() => router.push(`/admin/sales/${s.id}`)}
            activeOpacity={0.88}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {s.customer_full_name}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {s.customer_phone} • {s.check_in_date ?? '-'} → {s.check_out_date ?? '-'}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.money}>{fmtMoneyTry(s.net_amount ?? 0)}</Text>
              <Text style={styles.comm}>
                {fmtMoneyTry(s.commission_amount ?? 0)} • {s.commission_status}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 40 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 14 },
  h1: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.text },
  h2: { marginTop: 4, fontSize: 13, color: adminTheme.colors.textMuted, lineHeight: 18 },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: adminTheme.colors.primary,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
  },
  addBtnText: { color: '#fff', fontWeight: '800' },
  statsRow: { flexDirection: 'row', gap: 10, marginBottom: 16 },
  stat: {
    flex: 1,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  statLabel: { fontSize: 11, fontWeight: '700', color: adminTheme.colors.textMuted },
  statVal: { marginTop: 4, fontSize: 14, fontWeight: '900', color: adminTheme.colors.text },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: adminTheme.colors.text, marginBottom: 8 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  name: { fontSize: 15, fontWeight: '800', color: adminTheme.colors.text },
  meta: { marginTop: 4, fontSize: 12, color: adminTheme.colors.textMuted },
  money: { fontSize: 14, fontWeight: '900', color: adminTheme.colors.text },
  comm: { marginTop: 4, fontSize: 11, color: adminTheme.colors.textMuted },
  empty: { padding: 20, alignItems: 'center' },
  emptyText: { color: adminTheme.colors.textMuted },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  deniedTitle: { marginTop: 10, fontSize: 16, fontWeight: '800', color: adminTheme.colors.text },
  deniedDesc: { marginTop: 6, fontSize: 13, color: adminTheme.colors.textMuted, textAlign: 'center' },
});
