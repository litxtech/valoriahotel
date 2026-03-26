import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, RefreshControl, ActivityIndicator } from 'react-native';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';

type CarbonMonthRow = {
  month_start: string;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  electricity_factor: number;
  water_factor: number;
  gas_factor: number;
  waste_factor: number;
};

function fmt(n: number, max = 2): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: max }).format(n);
}

function monthLabel(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
}

function totalCo2(row: CarbonMonthRow): number {
  return (
    Number(row.electricity_kwh || 0) * Number(row.electricity_factor || 0) +
    Number(row.water_m3 || 0) * Number(row.water_factor || 0) +
    Number(row.gas_m3 || 0) * Number(row.gas_factor || 0) +
    Number(row.waste_kg || 0) * Number(row.waste_factor || 0)
  );
}

export default function AdminCarbonReportScreen() {
  const [rows, setRows] = useState<CarbonMonthRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .select('month_start, electricity_kwh, water_m3, gas_m3, waste_kg, electricity_factor, water_factor, gas_factor, waste_factor')
      .order('month_start', { ascending: false })
      .limit(12);
    setRows((data as CarbonMonthRow[]) ?? []);
  }, []);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const summary = useMemo(() => {
    const thisMonth = rows[0] ? totalCo2(rows[0]) : 0;
    const prevMonth = rows[1] ? totalCo2(rows[1]) : 0;
    const changePct = prevMonth > 0 ? ((thisMonth - prevMonth) / prevMonth) * 100 : 0;
    const annual = rows.reduce((s, r) => s + totalCo2(r), 0);
    return { thisMonth, prevMonth, changePct, annual };
  }, [rows]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
    >
      <View style={styles.summaryCard}>
        <Text style={styles.summaryTitle}>Karbon Özeti</Text>
        <Text style={styles.summaryLine}>Bu ay toplam: {fmt(summary.thisMonth, 1)} kg CO2</Text>
        <Text style={styles.summaryLine}>Geçen aya göre: {summary.changePct >= 0 ? '+' : ''}{fmt(summary.changePct, 0)}%</Text>
        <Text style={styles.summaryLine}>Son 12 ay toplam: {fmt(summary.annual, 1)} kg CO2</Text>
      </View>

      <Text style={styles.sectionTitle}>Aylık detay (son 12 ay)</Text>
      {rows.length === 0 ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyText}>Henüz karbon girdisi yok.</Text>
        </View>
      ) : (
        rows.map((r) => (
          <View key={r.month_start} style={styles.rowCard}>
            <Text style={styles.rowMonth}>{monthLabel(r.month_start)}</Text>
            <Text style={styles.rowTotal}>{fmt(totalCo2(r), 1)} kg CO2</Text>
            <Text style={styles.rowDetail}>
              E:{fmt(r.electricity_kwh)} kWh · S:{fmt(r.water_m3)} m3 · G:{fmt(r.gas_m3)} m3 · A:{fmt(r.waste_kg)} kg
            </Text>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 28 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: adminTheme.colors.surfaceSecondary },
  summaryCard: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 14,
  },
  summaryTitle: { color: adminTheme.colors.text, fontSize: 16, fontWeight: '800', marginBottom: 8 },
  summaryLine: { color: adminTheme.colors.textSecondary, fontSize: 14, marginBottom: 5 },
  sectionTitle: { marginTop: 14, marginBottom: 8, color: adminTheme.colors.text, fontSize: 15, fontWeight: '700' },
  emptyCard: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 14,
  },
  emptyText: { color: adminTheme.colors.textSecondary, fontSize: 14 },
  rowCard: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
  },
  rowMonth: { color: adminTheme.colors.text, fontSize: 15, fontWeight: '700' },
  rowTotal: { marginTop: 4, color: adminTheme.colors.primary, fontSize: 18, fontWeight: '800' },
  rowDetail: { marginTop: 4, color: adminTheme.colors.textMuted, fontSize: 12 },
});
