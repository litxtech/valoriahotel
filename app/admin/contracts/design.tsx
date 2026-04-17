import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';

const DESIGN_KEYS = {
  contract_font_size: 'contract_font_size',
  contract_theme: 'contract_theme',
  contract_compact: 'contract_compact',
} as const;

const FONT_OPTIONS = [
  { value: 'small', label: 'Küçük', desc: 'Daha fazla metin sığar' },
  { value: 'normal', label: 'Normal', desc: 'Önerilen' },
  { value: 'large', label: 'Büyük', desc: 'Okunabilirlik öncelikli' },
] as const;

const THEME_OPTIONS = [
  { value: 'light', label: 'Açık', desc: 'Beyaz arka plan' },
  { value: 'dark', label: 'Koyu', desc: 'Koyu arka plan' },
  { value: 'auto', label: 'Otomatik', desc: 'Cihaz ayarına göre' },
] as const;

export default function ContractDesignScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [fontSize, setFontSize] = useState<string>('normal');
  const [theme, setTheme] = useState<string>('light');
  const [compact, setCompact] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const keys = Object.values(DESIGN_KEYS);
      const { data } = await supabase.from('app_settings').select('key, value').in('key', keys);
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => {
        const v = r.value;
        map[r.key] = v != null && v !== '' ? String(v) : '';
      });
      setFontSize(map.contract_font_size || 'normal');
      setTheme(map.contract_theme || 'light');
      setCompact(map.contract_compact === '1');
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const ts = new Date().toISOString();
      await supabase.from('app_settings').upsert({ key: DESIGN_KEYS.contract_font_size, value: fontSize, updated_at: ts }, { onConflict: 'key' });
      await supabase.from('app_settings').upsert({ key: DESIGN_KEYS.contract_theme, value: theme, updated_at: ts }, { onConflict: 'key' });
      await supabase.from('app_settings').upsert({ key: DESIGN_KEYS.contract_compact, value: compact ? '1' : '0', updated_at: ts }, { onConflict: 'key' });
      await supabase.rpc('bump_contract_public_revision');
      Alert.alert('Kaydedildi', 'Sözleşme görünüm ayarları güncellendi. QR ile açılan sayfa bu ayarları kullanacak.');
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi.');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top }]}>
        <ActivityIndicator size="large" color="#1a365d" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const cardWidth = Math.min(width - 32, 360);
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 24 }]}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.intro}>
        QR ile açılan sözleşme sayfasının görünümünü aşağıdan seçin. Değişiklikler kaydettikten sonra yeni açılan sayfalarda uygulanır. PDF önizleme,
        yazdırma ve paylaşım da aynı yazı boyutu ve kompakt ayarını kullanır; kompakt açık ve küçük yazı daha az sayfa kullanır.
      </Text>

      <Text style={styles.sectionTitle}>Yazı boyutu</Text>
      <View style={styles.optionsRow}>
        {FONT_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionCard, { width: (cardWidth - 24) / 3 }, fontSize === opt.value && styles.optionCardActive]}
            onPress={() => setFontSize(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.optionLabel, fontSize === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
            <Text style={styles.optionDesc}>{opt.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Tema</Text>
      <View style={styles.optionsRow}>
        {THEME_OPTIONS.map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.optionCard, { width: (cardWidth - 24) / 3 }, theme === opt.value && styles.optionCardActive]}
            onPress={() => setTheme(opt.value)}
            activeOpacity={0.8}
          >
            <Text style={[styles.optionLabel, theme === opt.value && styles.optionLabelActive]}>{opt.label}</Text>
            <Text style={styles.optionDesc}>{opt.desc}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>Görünüm</Text>
      <TouchableOpacity
        style={[styles.toggleRow, compact && styles.toggleRowActive]}
        onPress={() => setCompact(!compact)}
        activeOpacity={0.8}
      >
        <Text style={styles.toggleLabel}>Kompakt mod</Text>
        <Text style={styles.toggleDesc}>Daha az boşluk, daha fazla metin görünür</Text>
        <View style={[styles.checkbox, compact && styles.checkboxActive]}>
          {compact && <Text style={styles.checkmark}>✓</Text>}
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
        {saving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.saveBtnText}>Ayarları kaydet</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  content: { paddingHorizontal: 16 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748b' },
  intro: {
    fontSize: 14,
    color: '#475569',
    lineHeight: 20,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 10,
    letterSpacing: 0.3,
  },
  optionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  optionCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 14,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  optionCardActive: {
    borderColor: '#1a365d',
    backgroundColor: '#f0f9ff',
  },
  optionLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e293b',
  },
  optionLabelActive: { color: '#1a365d' },
  optionDesc: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  toggleRowActive: {
    borderColor: '#1a365d',
    backgroundColor: '#f0f9ff',
  },
  toggleLabel: { fontSize: 16, fontWeight: '700', color: '#1e293b', flex: 1 },
  toggleDesc: { fontSize: 12, color: '#64748b', marginTop: 4, width: '100%' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: { borderColor: '#1a365d', backgroundColor: '#1a365d' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  saveBtn: {
    backgroundColor: '#1a365d',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
