import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { adminTheme } from '@/constants/adminTheme';

type CarbonInputRow = {
  month_start: string;
  electricity_kwh: number;
  water_m3: number;
  gas_m3: number;
  waste_kg: number;
  occupancy_nights_override: number | null;
  electricity_factor: number;
  water_factor: number;
  gas_factor: number;
  waste_factor: number;
  notes: string | null;
};

function toMonthStart(monthInput: string): string | null {
  const v = monthInput.trim();
  if (!/^\d{4}-\d{2}$/.test(v)) return null;
  return `${v}-01`;
}

function toNumberOrZero(value: string): number {
  const n = Number(value.replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

export default function AdminCarbonScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [electricity, setElectricity] = useState('');
  const [water, setWater] = useState('');
  const [gas, setGas] = useState('');
  const [waste, setWaste] = useState('');
  const [occupancyNights, setOccupancyNights] = useState('');
  const [electricityFactor, setElectricityFactor] = useState('0.42');
  const [waterFactor, setWaterFactor] = useState('0.30');
  const [gasFactor, setGasFactor] = useState('1.90');
  const [wasteFactor, setWasteFactor] = useState('0.50');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const monthStart = useMemo(() => toMonthStart(month), [month]);

  const fillFromRow = (row: CarbonInputRow | null) => {
    if (!row) {
      setElectricity('');
      setWater('');
      setGas('');
      setWaste('');
      setOccupancyNights('');
      setElectricityFactor('0.42');
      setWaterFactor('0.30');
      setGasFactor('1.90');
      setWasteFactor('0.50');
      setNotes('');
      return;
    }
    setElectricity(String(row.electricity_kwh ?? ''));
    setWater(String(row.water_m3 ?? ''));
    setGas(String(row.gas_m3 ?? ''));
    setWaste(String(row.waste_kg ?? ''));
    setOccupancyNights(row.occupancy_nights_override != null ? String(row.occupancy_nights_override) : '');
    setElectricityFactor(String(row.electricity_factor ?? 0.42));
    setWaterFactor(String(row.water_factor ?? 0.3));
    setGasFactor(String(row.gas_factor ?? 1.9));
    setWasteFactor(String(row.waste_factor ?? 0.5));
    setNotes(row.notes ?? '');
  };

  const load = useCallback(async () => {
    if (!monthStart) return;
    const { data, error } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .select('month_start, electricity_kwh, water_m3, gas_m3, waste_kg, occupancy_nights_override, electricity_factor, water_factor, gas_factor, waste_factor, notes')
      .eq('month_start', monthStart)
      .maybeSingle();
    if (error) {
      Alert.alert('Hata', error.message);
      fillFromRow(null);
      return;
    }
    fillFromRow((data as CarbonInputRow | null) ?? null);
  }, [monthStart]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  const save = async () => {
    if (!monthStart) {
      Alert.alert('Eksik bilgi', 'Ay formatı YYYY-MM olmalı (örn: 2026-03).');
      return;
    }
    setSaving(true);
    const payload = {
      month_start: monthStart,
      electricity_kwh: toNumberOrZero(electricity),
      water_m3: toNumberOrZero(water),
      gas_m3: toNumberOrZero(gas),
      waste_kg: toNumberOrZero(waste),
      occupancy_nights_override: occupancyNights.trim() ? toNumberOrZero(occupancyNights) : null,
      electricity_factor: toNumberOrZero(electricityFactor),
      water_factor: toNumberOrZero(waterFactor),
      gas_factor: toNumberOrZero(gasFactor),
      waste_factor: toNumberOrZero(wasteFactor),
      notes: notes.trim() || null,
      updated_by: staff?.id ?? null,
      created_by: staff?.id ?? null,
    };
    const { error } = await supabase
      .from('hotel_carbon_monthly_inputs')
      .upsert(payload, { onConflict: 'month_start' });
    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Aylık karbon girdileri güncellendi.');
    await load();
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[adminTheme.colors.primary]} />}
    >
      <View style={styles.headerCard}>
        <Ionicons name="leaf-outline" size={22} color={adminTheme.colors.primary} />
        <Text style={styles.headerTitle}>Karbon girdileri</Text>
        <TouchableOpacity style={styles.reportBtn} onPress={() => router.push('/admin/carbon/report')} activeOpacity={0.8}>
          <Ionicons name="stats-chart-outline" size={16} color={adminTheme.colors.primary} />
          <Text style={styles.reportBtnText}>Rapor</Text>
        </TouchableOpacity>
      </View>
      <Text style={styles.headerHint}>
        Admin aylık tüketimleri girer. Sistem misafir karbonunu konaklama gecesine göre otomatik hesaplar.
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color={adminTheme.colors.primary} style={{ marginTop: 24 }} />
      ) : (
        <View style={styles.form}>
          <Text style={styles.label}>Ay (YYYY-MM)</Text>
          <TextInput
            style={styles.input}
            value={month}
            onChangeText={setMonth}
            placeholder="2026-03"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.sectionTitle}>Aylık tüketim</Text>
          <Text style={styles.label}>Elektrik (kWh)</Text>
          <TextInput style={styles.input} value={electricity} onChangeText={setElectricity} keyboardType="decimal-pad" />

          <Text style={styles.label}>Su (m3)</Text>
          <TextInput style={styles.input} value={water} onChangeText={setWater} keyboardType="decimal-pad" />

          <Text style={styles.label}>Doğalgaz (m3)</Text>
          <TextInput style={styles.input} value={gas} onChangeText={setGas} keyboardType="decimal-pad" />

          <Text style={styles.label}>Atık (kg)</Text>
          <TextInput style={styles.input} value={waste} onChangeText={setWaste} keyboardType="decimal-pad" />

          <Text style={styles.sectionTitle}>Dağıtım</Text>
          <Text style={styles.label}>Toplam konaklama gecesi (opsiyonel)</Text>
          <TextInput
            style={styles.input}
            value={occupancyNights}
            onChangeText={setOccupancyNights}
            keyboardType="decimal-pad"
            placeholder="Boş bırakırsanız sistem guests verisinden hesaplar"
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <Text style={styles.sectionTitle}>Emisyon katsayıları (kg CO2 birim başı)</Text>
          <Text style={styles.label}>Elektrik faktörü</Text>
          <TextInput style={styles.input} value={electricityFactor} onChangeText={setElectricityFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Su faktörü</Text>
          <TextInput style={styles.input} value={waterFactor} onChangeText={setWaterFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Doğalgaz faktörü</Text>
          <TextInput style={styles.input} value={gasFactor} onChangeText={setGasFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Atık faktörü</Text>
          <TextInput style={styles.input} value={wasteFactor} onChangeText={setWasteFactor} keyboardType="decimal-pad" />

          <Text style={styles.label}>Not</Text>
          <TextInput
            style={[styles.input, styles.noteInput]}
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
            placeholder="Örn: Fatura gecikmeli geldi, tahmini değer girildi."
            placeholderTextColor={adminTheme.colors.textMuted}
          />

          <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Karbon girdisini kaydet</Text>}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 36 },
  headerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 12,
  },
  reportBtn: {
    marginLeft: 'auto',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  reportBtnText: { color: adminTheme.colors.primary, fontSize: 12, fontWeight: '700' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  headerHint: { marginTop: 10, color: adminTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  form: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    padding: 14,
  },
  sectionTitle: {
    marginTop: 10,
    marginBottom: 8,
    color: adminTheme.colors.text,
    fontWeight: '700',
    fontSize: 14,
  },
  label: { color: adminTheme.colors.textSecondary, fontSize: 13, marginBottom: 6, marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceSecondary,
    color: adminTheme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  noteInput: { minHeight: 84, textAlignVertical: 'top' },
  saveBtn: {
    marginTop: 14,
    backgroundColor: adminTheme.colors.primary,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
