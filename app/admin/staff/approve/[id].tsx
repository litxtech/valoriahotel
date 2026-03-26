import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

type Application = {
  id: string;
  full_name: string;
  email: string;
  phone: string | null;
  applied_department: string;
  experience: string | null;
  profile_image_url: string | null;
};

const DEPARTMENTS = [
  { value: 'housekeeping', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
  { value: 'receptionist', label: 'Resepsiyon' },
  { value: 'security', label: 'Güvenlik' },
];

const ROLES = [
  { value: 'receptionist', label: 'Resepsiyonist' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'technical', label: 'Teknik' },
  { value: 'security', label: 'Güvenlik' },
];

const APP_PERMISSIONS = [
  { key: 'stok_giris', label: 'Stok girişi' },
  { key: 'mesajlasma', label: 'Mesajlaşma' },
  { key: 'video_paylasim', label: 'Video/resim paylaşım' },
  { key: 'ekip_sohbet', label: 'Ekip sohbeti' },
  { key: 'gorev_ata', label: 'Görev atama' },
  { key: 'personel_ekle', label: 'Personel ekle' },
  { key: 'raporlar', label: 'Raporlar' },
  { key: 'tum_sozlesmeler', label: 'Tüm sözleşmeler' },
];

export default function ApproveStaffScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [app, setApp] = useState<Application | null>(null);
  const [position, setPosition] = useState('');
  const [department, setDepartment] = useState('');
  const [role, setRole] = useState('receptionist');
  const [personnel_no, setPersonnelNo] = useState('');
  const [hire_date, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [password, setPassword] = useState('');
  const [app_permissions, setAppPermissions] = useState<Record<string, boolean>>({
    stok_giris: true,
    mesajlasma: true,
    video_paylasim: true,
    ekip_sohbet: true,
    gorev_ata: false,
    personel_ekle: false,
    raporlar: false,
    tum_sozlesmeler: false,
  });

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('staff_applications')
        .select('id, full_name, email, phone, applied_department, experience, profile_image_url')
        .eq('id', id)
        .eq('status', 'pending')
        .single();
      if (error || !data) {
        Alert.alert('Hata', 'Başvuru bulunamadı.');
        router.back();
        return;
      }
      setApp(data as Application);
      setDepartment((data as Application).applied_department || 'receptionist');
      setRole((data as Application).applied_department === 'reception_chief' ? 'reception_chief' : (data as Application).applied_department || 'receptionist');
    })().finally(() => setLoading(false));
  }, [id]);

  const togglePermission = (key: string) => {
    setAppPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async () => {
    if (!app) return;
    setSaving(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
        setSaving(false);
        return;
      }
      if (!supabaseUrl) {
        Alert.alert('Hata', 'Supabase URL yapılandırılmamış.');
        setSaving(false);
        return;
      }
      const url = `${supabaseUrl}/functions/v1/approve-staff-application`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          application_id: app.id,
          access_token: session.access_token,
          password: password.trim() || undefined,
          position: position.trim() || undefined,
          department: department || undefined,
          role: role || undefined,
          personnel_no: personnel_no.trim() || undefined,
          hire_date: hire_date || undefined,
          app_permissions,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as { error?: string })?.error ?? `HTTP ${res.status}`);
      const err = (data as { error?: string })?.error;
      if (err) throw new Error(err);
      const payload = data as { temporary_password?: string; email?: string };
      const msg = payload.temporary_password
        ? `Hesap oluşturuldu. Geçici şifre: ${payload.temporary_password} (çalışana iletin veya şifre sıfırlama kullanın)`
        : 'Hesap oluşturuldu.';
      Alert.alert('Başarılı', msg, [
        { text: 'Tamam', onPress: () => router.replace('/admin/staff/pending') },
      ]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Onaylama başarısız.');
    }
    setSaving(false);
  };

  if (loading || !app) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.title}>✏️ Çalışan bilgilerini düzenle — {app.full_name}</Text>

      <Text style={styles.label}>Ad Soyad</Text>
      <TextInput style={styles.input} value={app.full_name} editable={false} />
      <Text style={styles.label}>E-posta</Text>
      <TextInput style={styles.input} value={app.email} editable={false} />
      <Text style={styles.label}>Telefon</Text>
      <TextInput style={styles.input} value={app.phone ?? ''} editable={false} />

      <Text style={styles.sectionTitle}>Atanacak bilgiler</Text>
      <Text style={styles.label}>Departman</Text>
      <View style={styles.chips}>
        {DEPARTMENTS.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.chip, department === d.value && styles.chipActive]}
            onPress={() => setDepartment(d.value)}
          >
            <Text style={[styles.chipText, department === d.value && styles.chipTextActive]}>
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Rol</Text>
      <View style={styles.chips}>
        {ROLES.map((r) => (
          <TouchableOpacity
            key={r.value}
            style={[styles.chip, role === r.value && styles.chipActive]}
            onPress={() => setRole(r.value)}
          >
            <Text style={[styles.chipText, role === r.value && styles.chipTextActive]}>{r.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Pozisyon</Text>
      <TextInput
        style={styles.input}
        value={position}
        onChangeText={setPosition}
        placeholder="İklimlendirme Uzmanı"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>İşe başlama</Text>
      <TextInput
        style={styles.input}
        value={hire_date}
        onChangeText={setHireDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Personel no</Text>
      <TextInput
        style={styles.input}
        value={personnel_no}
        onChangeText={setPersonnelNo}
        placeholder="TEK-2025-001"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Şifre (boş bırakırsanız otomatik atanır)</Text>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="Çalışanın belirleyeceği veya otomatik"
        secureTextEntry
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.sectionTitle}>Uygulama yetkileri</Text>
      {APP_PERMISSIONS.map((p) => (
        <TouchableOpacity key={p.key} style={styles.checkRow} onPress={() => togglePermission(p.key)}>
          <Text style={styles.checkbox}>{app_permissions[p.key] ? '☑' : '☐'}</Text>
          <Text style={styles.checkLabel}>{p.label}</Text>
        </TouchableOpacity>
      ))}

      {saving ? (
        <ActivityIndicator size="large" color="#ed8936" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={saving}>
            <Text style={styles.primaryButtonText}>💾 Onayla ve kaydet</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
            <Text style={styles.secondaryButtonText}>Vazgeç</Text>
          </TouchableOpacity>
        </>
      )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 18, fontWeight: '700', color: '#1a202c', marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1a202c', marginTop: 20, marginBottom: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 15, color: '#374151' },
  primaryButton: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 24,
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#718096', fontSize: 16 },
});
