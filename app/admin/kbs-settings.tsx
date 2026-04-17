import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert, ActivityIndicator, ScrollView } from 'react-native';
import { useForm, Controller } from 'react-hook-form';
import { theme } from '@/constants/theme';
import { apiPost } from '@/lib/kbsApi';

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

  const { control, handleSubmit, reset } = useForm<FormValues>({
    defaultValues: { facilityCode: '', username: '', password: '', apiKey: '', providerType: 'default', isActive: true },
  });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const res = await apiPost<any>('/admin/kbs-settings', {});
      setLoading(false);
      if (!res.ok) return;
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
      Alert.alert('Kayıt hatası', res.error.message);
      return;
    }
    Alert.alert('Kaydedildi', 'KBS ayarları güncellendi.');
    reset({ ...values, password: '', apiKey: '' });
  });

  const onTest = async () => {
    setTesting(true);
    const res = await apiPost<any>('/admin/kbs-settings/test-connection', {});
    setTesting(false);
    if (!res.ok) {
      Alert.alert('Bağlantı testi', res.error.message);
      return;
    }
    Alert.alert('Bağlantı testi', res.data?.message ?? 'OK');
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>KBS Ayarları (Admin)</Text>
      <Text style={styles.sub}>
        Şifre alanı write-only’dir. Mevcut şifre geri okunmaz; yeni şifre girilirse overwrite edilir.
      </Text>

      {loading ? <ActivityIndicator /> : null}

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
});

