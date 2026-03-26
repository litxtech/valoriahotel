import { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, RefreshControl } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

type CarbonRow = {
  month_start: string;
  stay_nights: number;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  electricity_kg_co2: number;
  water_kg_co2: number;
  gas_kg_co2: number;
  waste_kg_co2: number;
  total_kg_co2: number;
};

function fmtNum(n: number, max = 2): string {
  return new Intl.NumberFormat('tr-TR', { maximumFractionDigits: max }).format(n);
}

export default function CustomerCarbonScreen() {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [row, setRow] = useState<CarbonRow | null>(null);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('get_my_latest_stay_carbon');
    if (error || !data?.length) {
      setRow(null);
      return;
    }
    setRow((data[0] as CarbonRow) ?? null);
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

  const treeCount = useMemo(() => {
    if (!row?.total_kg_co2) return 0;
    return Math.max(1, Math.round(row.total_kg_co2 / 25));
  }, [row?.total_kg_co2]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[theme.colors.primary]} />}
    >
      <View style={styles.header}>
        <Ionicons name="leaf-outline" size={24} color={theme.colors.primary} />
        <Text style={styles.title}>Karbon Ayak İziniz</Text>
      </View>

      {!row ? (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyTitle}>Henüz hesaplanmış veri yok</Text>
          <Text style={styles.emptyText}>
            Bu ekran için adminin ilgili ay karbon girdilerini kaydetmesi gerekir. Kaydedildiğinde konaklamanıza göre otomatik hesaplanır.
          </Text>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.subtitle}>Bu konaklamada</Text>
          <Text style={styles.total}>{fmtNum(row.total_kg_co2, 1)} kg CO2</Text>
          <Text style={styles.meta}>{fmtNum(row.stay_nights, 0)} gece · {row.month_start.slice(0, 7)}</Text>

          <View style={styles.divider} />

          <Row label={`Elektrik (${fmtNum(row.electricity_kwh)} kWh)`} value={`${fmtNum(row.electricity_kg_co2)} kg CO2`} />
          <Row label={`Su (${fmtNum(row.water_m3)} m3)`} value={`${fmtNum(row.water_kg_co2)} kg CO2`} />
          <Row label={`Isınma (${fmtNum(row.gas_m3)} m3)`} value={`${fmtNum(row.gas_kg_co2)} kg CO2`} />
          <Row label={`Atık (${fmtNum(row.waste_kg)} kg)`} value={`${fmtNum(row.waste_kg_co2)} kg CO2`} />

          <View style={styles.offsetBox}>
            <Text style={styles.offsetText}>Yaklaşık telafi: {treeCount} ağaç</Text>
            <TouchableOpacity style={styles.offsetBtn} activeOpacity={0.8}>
              <Text style={styles.offsetBtnText}>Karbon telafi et</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, paddingBottom: 28 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
  },
  subtitle: { color: theme.colors.textSecondary, fontSize: 13 },
  total: { marginTop: 4, color: theme.colors.text, fontSize: 30, fontWeight: '800' },
  meta: { marginTop: 4, color: theme.colors.textMuted, fontSize: 13 },
  divider: { height: 1, backgroundColor: theme.colors.borderLight, marginVertical: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8, gap: 10 },
  rowLabel: { flex: 1, color: theme.colors.textSecondary, fontSize: 14 },
  rowValue: { color: theme.colors.text, fontWeight: '700', fontSize: 14 },
  offsetBox: {
    marginTop: 8,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
    paddingTop: 12,
  },
  offsetText: { color: theme.colors.textSecondary, fontSize: 13, marginBottom: 10 },
  offsetBtn: {
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
  },
  offsetBtnText: { color: '#fff', fontWeight: '700' },
  emptyCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
  },
  emptyTitle: { color: theme.colors.text, fontSize: 16, fontWeight: '700', marginBottom: 8 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, lineHeight: 20 },
});
