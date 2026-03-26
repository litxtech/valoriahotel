import { useState } from 'react';
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
import { useRouter } from 'expo-router';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const DEPARTMENTS = [
  { value: 'housekeeping', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
  { value: 'receptionist', label: 'Resepsiyon' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
];

const ROLES = [
  { value: 'receptionist', label: 'Resepsiyonist' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'housekeeping', label: 'Housekeeping' },
  { value: 'technical', label: 'Teknik' },
  { value: 'security', label: 'Güvenlik' },
];

const SHIFT_TYPES = [
  { value: 'morning', label: 'Sabah (08:00-17:00)' },
  { value: 'evening', label: 'Akşam (14:00-23:00)' },
  { value: 'night', label: 'Gece (23:00-08:00)' },
  { value: 'flexible', label: 'Esnek' },
];

const APP_PERMISSIONS = [
  { key: 'stok_giris', label: 'Stok girişi yapabilir' },
  { key: 'mesajlasma', label: 'Müşterilerle mesajlaşabilir' },
  { key: 'video_paylasim', label: 'Video/resim paylaşabilir' },
  { key: 'ekip_sohbet', label: 'Ekip sohbetini görebilir' },
  { key: 'gorev_ata', label: 'Görev atayabilir' },
  { key: 'personel_ekle', label: 'Personel ekleyebilir (sadece yönetici)' },
  { key: 'raporlar', label: 'Raporları görebilir' },
  { key: 'tum_sozlesmeler', label: 'Tüm sözleşmeleri görüntüleyebilir' },
];

const DAYS = [
  { value: 1, label: 'Pzt' },
  { value: 2, label: 'Sal' },
  { value: 3, label: 'Çar' },
  { value: 4, label: 'Per' },
  { value: 5, label: 'Cum' },
  { value: 6, label: 'Cmt' },
  { value: 7, label: 'Paz' },
];

function randomPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';
  let s = '';
  for (let i = 0; i < 12; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export default function AddStaffScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [id_number, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [hire_date, setHireDate] = useState(new Date().toISOString().slice(0, 10));
  const [personnel_no, setPersonnelNo] = useState('');
  const [salary, setSalary] = useState('');
  const [sgk_no, setSgkNo] = useState('');
  const [shift_type, setShiftType] = useState('');
  const [work_days, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [app_permissions, setAppPermissions] = useState<Record<string, boolean>>({
    stok_giris: true,
    mesajlasma: true,
    video_paylasim: true,
    ekip_sohbet: true,
    gorev_ata: true,
    personel_ekle: false,
    raporlar: false,
    tum_sozlesmeler: false,
  });
  const [notes, setNotes] = useState('');

  const toggleDay = (d: number) => {
    setWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const togglePermission = (key: string) => {
    setAppPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async (active: boolean) => {
    if (!full_name.trim() || !email.trim() || !password) {
      Alert.alert('Hata', 'Ad Soyad, E-posta ve Şifre zorunludur.');
      return;
    }
    if (password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }
    const role = department || 'receptionist';
    if (!ROLES.some((r) => r.value === role)) {
      Alert.alert('Hata', 'Geçerli bir departman seçin.');
      return;
    }
    setLoading(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) {
        Alert.alert('Hata', 'Oturum bulunamadı. Lütfen tekrar giriş yapın.');
        setLoading(false);
        return;
      }
      if (!supabaseUrl) {
        Alert.alert('Hata', 'Supabase URL yapılandırılmamış.');
        setLoading(false);
        return;
      }
      const url = `${supabaseUrl}/functions/v1/create-staff`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          password,
          full_name: full_name.trim(),
          role,
          access_token: session.access_token,
          department: department || null,
          position: position.trim() || null,
          phone: phone.trim() || null,
          birth_date: birth_date || null,
          id_number: id_number.trim() || null,
          address: address.trim() || null,
          hire_date: hire_date || null,
          personnel_no: personnel_no.trim() || null,
          salary: salary ? parseFloat(salary.replace(',', '.')) : null,
          sgk_no: sgk_no.trim() || null,
          app_permissions,
          work_days,
          shift_type: shift_type || null,
          notes: notes.trim() || null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; email?: string };
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);
      Alert.alert('Başarılı', 'Çalışan hesabı oluşturuldu. ' + (data?.email ?? ''), [
        { text: 'Tamam', onPress: () => router.replace('/admin/staff') },
      ]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Çalışan eklenemedi.');
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <Text style={styles.sectionTitle}>👤 Yeni çalışan ekle (admin)</Text>

      <Text style={styles.label}>Ad Soyad *</Text>
      <TextInput
        style={styles.input}
        value={full_name}
        onChangeText={setFullName}
        placeholder="Ahmet Yılmaz"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>E-posta *</Text>
      <TextInput
        style={styles.input}
        value={email}
        onChangeText={setEmail}
        placeholder="ahmet@valoria.com"
        keyboardType="email-address"
        autoCapitalize="none"
        placeholderTextColor="#9ca3af"
      />
      <View style={styles.row}>
        <Text style={[styles.label, { flex: 1 }]}>Şifre *</Text>
        <TouchableOpacity
          style={styles.smallBtn}
          onPress={() => setPassword(randomPassword())}
        >
          <Text style={styles.smallBtnText}>Otomatik oluştur</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={styles.input}
        value={password}
        onChangeText={setPassword}
        placeholder="••••••••"
        secureTextEntry
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Telefon</Text>
      <TextInput
        style={styles.input}
        value={phone}
        onChangeText={setPhone}
        placeholder="+90 555 123 45 67"
        keyboardType="phone-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Doğum tarihi</Text>
      <TextInput
        style={styles.input}
        value={birth_date}
        onChangeText={setBirthDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>T.C. Kimlik</Text>
      <TextInput
        style={styles.input}
        value={id_number}
        onChangeText={setIdNumber}
        placeholder="12345678901"
        keyboardType="number-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Adres</Text>
      <TextInput
        style={styles.input}
        value={address}
        onChangeText={setAddress}
        placeholder="Adres"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.sectionTitle}>🏢 Çalışan bilgileri</Text>
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
      <Text style={styles.label}>Pozisyon</Text>
      <TextInput
        style={styles.input}
        value={position}
        onChangeText={setPosition}
        placeholder="Kat Hizmetleri Sorumlusu"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>İşe başlama tarihi</Text>
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
        placeholder="P-2025-001"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Maaş (TL)</Text>
      <TextInput
        style={styles.input}
        value={salary}
        onChangeText={setSalary}
        placeholder="22500"
        keyboardType="decimal-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>SGK no</Text>
      <TextInput
        style={styles.input}
        value={sgk_no}
        onChangeText={setSgkNo}
        placeholder="1234567890"
        placeholderTextColor="#9ca3af"
      />

      <Text style={styles.sectionTitle}>⏰ Çalışma</Text>
      <Text style={styles.label}>Vardiya</Text>
      <View style={styles.chips}>
        {SHIFT_TYPES.map((s) => (
          <TouchableOpacity
            key={s.value}
            style={[styles.chip, shift_type === s.value && styles.chipActive]}
            onPress={() => setShiftType(s.value)}
          >
            <Text style={[styles.chipText, shift_type === s.value && styles.chipTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <Text style={styles.label}>Çalışma günleri</Text>
      <View style={styles.chips}>
        {DAYS.map((d) => (
          <TouchableOpacity
            key={d.value}
            style={[styles.chip, work_days.includes(d.value) && styles.chipActive]}
            onPress={() => toggleDay(d.value)}
          >
            <Text
              style={[styles.chipText, work_days.includes(d.value) && styles.chipTextActive]}
            >
              {d.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Text style={styles.sectionTitle}>📱 Uygulama yetkileri</Text>
      {APP_PERMISSIONS.map((p) => (
        <TouchableOpacity
          key={p.key}
          style={styles.checkRow}
          onPress={() => togglePermission(p.key)}
        >
          <Text style={styles.checkbox}>{app_permissions[p.key] ? '☑' : '☐'}</Text>
          <Text style={styles.checkLabel}>{p.label}</Text>
        </TouchableOpacity>
      ))}

      <Text style={styles.label}>Açıklama / Not</Text>
      <TextInput
        style={[styles.input, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        placeholder="Deneme süresi 3 ay..."
        placeholderTextColor="#9ca3af"
        multiline
      />

      <Text style={styles.hint}>
        Kapı yetkileri (geçiş kontrolü) için: Panel → Geçiş Kontrolü → Personel Yetkileri
      </Text>

      {loading ? (
        <ActivityIndicator size="large" color="#ed8936" style={{ marginTop: 24 }} />
      ) : (
        <>
          <TouchableOpacity
            style={styles.primaryButton}
            onPress={() => submit(true)}
            disabled={loading}
          >
            <Text style={styles.primaryButtonText}>💾 Kaydet ve aktif et</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={() => router.back()}
            disabled={loading}
          >
            <Text style={styles.secondaryButtonText}>İptal</Text>
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
  textArea: { minHeight: 80 },
  row: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  smallBtn: { paddingVertical: 6, paddingHorizontal: 12, backgroundColor: '#e2e8f0', borderRadius: 8 },
  smallBtnText: { fontSize: 13, fontWeight: '600', color: '#4a5568' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 15, color: '#374151' },
  hint: { fontSize: 12, color: '#718096', marginBottom: 16 },
  primaryButton: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#718096', fontSize: 16 },
});
