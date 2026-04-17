import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { theme } from '@/constants/theme';
import { apiGet, apiPost, getLastApiDebug, railwayApiBaseUrl } from '@/lib/kbsApi';
import * as Clipboard from 'expo-clipboard';

type FormValues = {
  facilityCode: string;
  username: string;
  password?: string;
  apiKey?: string;
  providerType: string;
  isActive: boolean;
};

export default function AdminKbsSettingsScreen() {
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [healthInfo, setHealthInfo] = useState<string>('');
  const [lastApiInfo, setLastApiInfo] = useState<string>('');

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { facilityCode: '', username: '', password: '', apiKey: '', providerType: 'default', isActive: true },
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await apiGet<any>('/admin/kbs-settings');
      setLoading(false);
      if (!res.ok) {
        const details = res.error.details ? `\n\n${JSON.stringify(res.error.details, null, 2)}` : '';
        Alert.alert('Yükleme hatası', `${res.error.message}${details}`);
        return;
      }
      const d = res.data;
      if (!d) return;
      reset({
        facilityCode: d.facility_code ?? '',
        username: d.username ?? '',
        password: '',
        apiKey: '',
        providerType: d.provider_type ?? 'default',
        isActive: !!d.is_active,
      });
    };
    load();
  }, [reset]);

  const copyDebugToClipboard = async () => {
    const payload = {
      baseUrl: railwayApiBaseUrl,
      healthInfo: healthInfo || null,
      lastApiDebug: getLastApiDebug(),
    };
    const text = JSON.stringify(payload, null, 2);
    await Clipboard.setStringAsync(text);
    Alert.alert('Kopyalandı', 'Debug log panoya kopyalandı. Buraya yapıştırabilirsin.');
  };

  const refreshLastApiInfo = () => {
    const d = getLastApiDebug();
    setLastApiInfo(d ? JSON.stringify(d, null, 2) : '');
  };

  const onSave = handleSubmit(async (values) => {
    setLoading(true);
    const payload: any = {
      facilityCode: values.facilityCode,
      username: values.username,
      providerType: values.providerType || 'default',
      isActive: values.isActive,
    };
    if (values.password && values.password.trim()) payload.password = values.password.trim();
    if (values.apiKey && values.apiKey.trim()) payload.apiKey = values.apiKey.trim();

    const res = await apiPost('/admin/kbs-settings', payload);
    setLoading(false);
    if (!res.ok) {
      refreshLastApiInfo();
      const details = res.error.details ? `\n\n${JSON.stringify(res.error.details, null, 2)}` : '';
      Alert.alert('Kayıt hatası', `${res.error.message}${details}`);
      return;
    }
    Alert.alert('Kaydedildi', 'KBS ayarları güncellendi.');
    reset({ ...values, password: '', apiKey: '' });

    // Re-fetch to prove persistence
    const verify = await apiGet<any>('/admin/kbs-settings');
    refreshLastApiInfo();
    if (verify.ok && verify.data) {
      Alert.alert('Doğrulandı', 'Kaydedildi ve geri okundu.');
    }
  });

  const onTest = async () => {
    setTesting(true);
    const res = await apiPost<any>('/admin/kbs-settings/test-connection', {});
    setTesting(false);
    if (!res.ok) {
      refreshLastApiInfo();
      const details = res.error.details ? `\n\n${JSON.stringify(res.error.details, null, 2)}` : '';
      Alert.alert('Bağlantı testi', `${res.error.message}${details}`);
      return;
    }
    Alert.alert('Bağlantı testi', res.data?.message ?? 'OK');
  };

  const debugHealth = async () => {
    try {
      const res = await fetch(`${railwayApiBaseUrl}/health`);
      const contentType = res.headers.get('content-type') ?? '';
      const text = await res.text();
      setHealthInfo(
        JSON.stringify(
          {
            baseUrl: railwayApiBaseUrl,
            status: res.status,
            contentType,
            bodyPreview: text.slice(0, 500),
          },
          null,
          2
        )
      );
      refreshLastApiInfo();
    } catch (e) {
      setHealthInfo(JSON.stringify({ baseUrl: railwayApiBaseUrl, error: e instanceof Error ? e.message : String(e) }, null, 2));
      refreshLastApiInfo();
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>KBS Ayarları (Admin)</Text>
      <Text style={styles.sub}>
        Şifre alanı write-only’dir. Mevcut şifre geri okunmaz; yeni şifre girilirse overwrite edilir.
      </Text>

      {loading ? <ActivityIndicator /> : null}

      <View style={styles.debugBox}>
        <Text style={styles.debugTitle}>API Debug</Text>
        <Text style={styles.debugText}>Base URL: {railwayApiBaseUrl || '(missing)'}</Text>
        <View style={styles.row}>
          <TouchableOpacity style={styles.btnGhost} onPress={debugHealth}>
            <Text style={styles.btnGhostText}>/health test</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnGhost} onPress={copyDebugToClipboard}>
            <Text style={styles.btnGhostText}>Terminale aktar</Text>
          </TouchableOpacity>
        </View>
        {healthInfo ? <Text style={styles.debugMono}>{healthInfo}</Text> : null}
        {lastApiInfo ? <Text style={styles.debugMono}>{lastApiInfo}</Text> : null}
      </View>

      <Text style={styles.label}>Tesis kodu</Text>
      <Controller
        control={control}
        name="facilityCode"
        rules={{ required: true }}
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="TESIS123" />
        )}
      />

      <Text style={styles.label}>Kullanıcı adı</Text>
      <Controller
        control={control}
        name="username"
        rules={{ required: true }}
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="kbs-user" autoCapitalize="none" />
        )}
      />

      <Text style={styles.label}>Şifre (maskeli)</Text>
      <Controller
        control={control}
        name="password"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="••••••••" secureTextEntry />
        )}
      />

      <Text style={styles.label}>API key (opsiyonel)</Text>
      <Controller
        control={control}
        name="apiKey"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="(opsiyonel)" secureTextEntry />
        )}
      />

      <Text style={styles.label}>Provider tipi</Text>
      <Controller
        control={control}
        name="providerType"
        render={({ field: { value, onChange } }) => (
          <TextInput value={value} onChangeText={onChange} style={styles.input} placeholder="default" />
        )}
      />

      <View style={styles.row}>
        <Controller
          control={control}
          name="isActive"
          render={({ field: { value, onChange } }) => (
            <TouchableOpacity style={[styles.pill, value ? styles.pillOn : styles.pillOff]} onPress={() => onChange(!value)}>
              <Text style={styles.pillText}>{value ? 'Aktif' : 'Pasif'}</Text>
            </TouchableOpacity>
          )}
        />
        <TouchableOpacity style={styles.btnGhost} onPress={onTest} disabled={testing}>
          <Text style={styles.btnGhostText}>{testing ? 'Test…' : 'Bağlantı testi'}</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.btnPrimary} onPress={onSave} disabled={loading}>
        <Text style={styles.btnPrimaryText}>{loading ? 'Kaydediliyor…' : 'Kaydet'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  sub: { color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 6 },
  label: { color: theme.colors.text, fontWeight: '800', marginTop: 6 },
  input: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: theme.colors.text,
  },
  row: { flexDirection: 'row', gap: 10, alignItems: 'center', marginTop: 6 },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999 },
  pillOn: { backgroundColor: '#e6f7ee' },
  pillOff: { backgroundColor: '#f6f6f6' },
  pillText: { fontWeight: '900', color: theme.colors.text },
  btnGhost: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight },
  btnGhostText: { fontWeight: '900', color: theme.colors.text },
  btnPrimary: { marginTop: 6, backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  btnPrimaryText: { color: '#fff', fontWeight: '900', fontSize: 16 },
  debugBox: { marginTop: 6, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: theme.colors.borderLight, backgroundColor: theme.colors.surface },
  debugTitle: { fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
  debugText: { color: theme.colors.textSecondary, marginBottom: 8 },
  debugMono: { marginTop: 8, fontFamily: 'Courier', fontSize: 11, color: theme.colors.text },
});

