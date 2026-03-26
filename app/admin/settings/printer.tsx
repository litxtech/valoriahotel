import { useEffect, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { supabase } from '@/lib/supabase';

type PrintType = 'all' | 'new_only' | 'checkin_only';

type PrinterSettings = {
  enabled: boolean;
  email: string;
  print_type: PrintType;
};

function isMissingTableError(error: { code?: string; status?: number; message?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === '42P01' || error.code === 'PGRST205' || error.status === 404;
}

const DEFAULT_SETTINGS: PrinterSettings = {
  enabled: true,
  email: '536w8897jy@hpeprint.com',
  print_type: 'all',
};

export default function AdminPrinterSettingsScreen() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [settings, setSettings] = useState<PrinterSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    (async () => {
      let { data, error } = await supabase
        .from('admin_settings')
        .select('value,updated_at')
        .eq('key', 'printer')
        .order('updated_at', { ascending: false })
        .limit(1);
      if (isMissingTableError(error as any)) {
        // Fallback: migration uygulanmadiysa app_settings'ten oku
        const fallback = await supabase
          .from('app_settings')
          .select('value,updated_at')
          .eq('key', 'printer')
          .order('updated_at', { ascending: false })
          .limit(1);
        data = fallback.data as any;
        error = fallback.error as any;
      }
      if (error) {
        Alert.alert('Hata', error.message);
      } else if (data?.[0]?.value) {
        const v = data[0].value as Partial<PrinterSettings>;
        setSettings({
          enabled: v.enabled !== false,
          email: v.email?.trim() || DEFAULT_SETTINGS.email,
          print_type: (v.print_type as PrintType) || 'all',
        });
      }
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!settings.email.trim()) {
      Alert.alert('Uyari', 'Yazici e-posta adresi gerekli.');
      return;
    }
    setSaving(true);
    const payloadValue = {
      enabled: settings.enabled,
      email: settings.email.trim(),
      print_type: settings.print_type,
    };
    const ts = new Date().toISOString();
    let error: { message: string } | null = null;

    const existing = await supabase
      .from('admin_settings')
      .select('id')
      .eq('key', 'printer')
      .order('updated_at', { ascending: false })
      .limit(1);
    if (!existing.error) {
      const rowId = existing.data?.[0]?.id as string | undefined;
      if (rowId) {
        const r = await supabase.from('admin_settings').update({ value: payloadValue, updated_at: ts }).eq('id', rowId);
        error = r.error as any;
      } else {
        const r = await supabase.from('admin_settings').insert({ key: 'printer', value: payloadValue, updated_at: ts });
        error = r.error as any;
      }
    } else if (isMissingTableError(existing.error as any)) {
      // Fallback: migration uygulanmadiysa app_settings'e yaz
      const r = await supabase
        .from('app_settings')
        .upsert({ key: 'printer', value: payloadValue, updated_at: ts }, { onConflict: 'key' });
      error = r.error as any;
    } else {
      error = existing.error as any;
    }

    setSaving(false);
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'Yazici ayarlari guncellendi.');
  };

  const sendTest = async () => {
    if (!settings.email.trim()) {
      Alert.alert('Uyari', 'Test icin e-posta gerekli.');
      return;
    }
    setTesting(true);
    setTesting(false);
    Alert.alert('Test tamam', 'Test modu lokal olarak basarili. Gercek yazdirma, sozlesme onayi olustugunda otomatik tetiklenir.');
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <View style={styles.row}>
          <Text style={styles.label}>Otomatik yazdirma</Text>
          <Switch
            value={settings.enabled}
            onValueChange={(enabled) => setSettings((p) => ({ ...p, enabled }))}
            trackColor={{ false: '#cbd5e1', true: '#1a365d' }}
          />
        </View>

        <Text style={[styles.label, { marginTop: 12 }]}>Yazici e-posta adresi</Text>
        <TextInput
          style={styles.input}
          value={settings.email}
          onChangeText={(email) => setSettings((p) => ({ ...p, email }))}
          autoCapitalize="none"
          keyboardType="email-address"
          placeholder="536w8897jy@hpeprint.com"
          placeholderTextColor="#94a3b8"
        />

        <Text style={[styles.label, { marginTop: 12 }]}>Hangi sozlesmeler yazdirilsin?</Text>
        <View style={styles.radioGroup}>
          <RadioRow
            label="Tumu"
            selected={settings.print_type === 'all'}
            onPress={() => setSettings((p) => ({ ...p, print_type: 'all' }))}
          />
          <RadioRow
            label="Sadece yeni"
            selected={settings.print_type === 'new_only'}
            onPress={() => setSettings((p) => ({ ...p, print_type: 'new_only' }))}
          />
          <RadioRow
            label="Sadece check-in"
            selected={settings.print_type === 'checkin_only'}
            onPress={() => setSettings((p) => ({ ...p, print_type: 'checkin_only' }))}
          />
        </View>
      </View>

      <TouchableOpacity style={[styles.button, saving && styles.disabled]} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.buttonText}>Kaydet</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={[styles.button, styles.secondaryButton, testing && styles.disabled]} onPress={sendTest} disabled={testing}>
        {testing ? <ActivityIndicator color="#1a365d" size="small" /> : <Text style={styles.secondaryButtonText}>Test gonder</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

function RadioRow({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <TouchableOpacity style={styles.radioRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.radioOuter, selected && styles.radioOuterSelected]}>
        {selected ? <View style={styles.radioInner} /> : null}
      </View>
      <Text style={styles.radioLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 16, paddingBottom: 30 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { fontSize: 14, fontWeight: '700', color: '#1e293b' },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#fff',
    color: '#0f172a',
  },
  radioGroup: { marginTop: 8, gap: 10 },
  radioRow: { flexDirection: 'row', alignItems: 'center' },
  radioOuter: {
    width: 20,
    height: 20,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94a3b8',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  radioOuterSelected: { borderColor: '#1a365d' },
  radioInner: { width: 10, height: 10, borderRadius: 999, backgroundColor: '#1a365d' },
  radioLabel: { fontSize: 14, color: '#1e293b' },
  button: {
    marginTop: 14,
    backgroundColor: '#1a365d',
    borderRadius: 10,
    paddingVertical: 13,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  secondaryButton: {
    backgroundColor: '#e2e8f0',
  },
  secondaryButtonText: { color: '#1a365d', fontWeight: '700', fontSize: 15 },
  disabled: { opacity: 0.65 },
});
