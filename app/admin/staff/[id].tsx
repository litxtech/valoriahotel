import { useState, useEffect } from 'react';
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
  Switch,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase, supabaseUrl, supabaseAnonKey } from '@/lib/supabase';

const DEPARTMENTS = [
  { value: 'housekeeping', label: 'Temizlik' },
  { value: 'technical', label: 'Teknik' },
  { value: 'receptionist', label: 'Resepsiyon' },
  { value: 'security', label: 'Güvenlik' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
];

const ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'reception_chief', label: 'Resepsiyon Şefi' },
  { value: 'receptionist', label: 'Resepsiyonist' },
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

const DEFAULT_PERMISSIONS: Record<string, boolean> = {
  stok_giris: true,
  mesajlasma: true,
  video_paylasim: true,
  ekip_sohbet: true,
  gorev_ata: true,
  personel_ekle: false,
  raporlar: false,
  tum_sozlesmeler: false,
};

type StaffDetail = {
  id: string;
  full_name: string | null;
  email: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  phone: string | null;
  birth_date: string | null;
  id_number: string | null;
  address: string | null;
  hire_date: string | null;
  personnel_no: string | null;
  salary: number | null;
  sgk_no: string | null;
  app_permissions: Record<string, boolean> | null;
  work_days: number[] | null;
  shift_type: string | null;
  notes: string | null;
  is_active: boolean | null;
  office_location: string | null;
  achievements: string[] | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  whatsapp: string | null;
  verification_badge: 'blue' | 'yellow' | null;
};

export default function EditStaffScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [password, setPassword] = useState('');
  const [full_name, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [phone, setPhone] = useState('');
  const [birth_date, setBirthDate] = useState('');
  const [id_number, setIdNumber] = useState('');
  const [address, setAddress] = useState('');
  const [hire_date, setHireDate] = useState('');
  const [personnel_no, setPersonnelNo] = useState('');
  const [salary, setSalary] = useState('');
  const [sgk_no, setSgkNo] = useState('');
  const [shift_type, setShiftType] = useState('');
  const [work_days, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [app_permissions, setAppPermissions] = useState<Record<string, boolean>>(DEFAULT_PERMISSIONS);
  const [notes, setNotes] = useState('');
  const [is_active, setIsActive] = useState(true);
  const [office_location, setOfficeLocation] = useState('');
  const [achievements, setAchievements] = useState('');
  const [emergency_contact_name, setEmergencyContactName] = useState('');
  const [emergency_contact_phone, setEmergencyContactPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [verification_badge, setVerificationBadge] = useState<'blue' | 'yellow' | ''>('');

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from('staff')
        .select(
          'id, full_name, email, role, department, position, phone, birth_date, id_number, address, hire_date, personnel_no, salary, sgk_no, app_permissions, work_days, shift_type, notes, is_active, office_location, achievements, emergency_contact_name, emergency_contact_phone, whatsapp, verification_badge'
        )
        .eq('id', id)
        .single();
      if (error || !data) {
        Alert.alert('Hata', 'Çalışan bulunamadı.');
        router.back();
        return;
      }
      const s = data as StaffDetail;
      setStaff(s);
      setFullName(s.full_name ?? '');
      setEmail(s.email ?? '');
      setRole(s.role ?? 'receptionist');
      setDepartment(s.department ?? '');
      setPosition(s.position ?? '');
      setPhone(s.phone ?? '');
      setBirthDate(s.birth_date ?? '');
      setIdNumber(s.id_number ?? '');
      setAddress(s.address ?? '');
      setHireDate(s.hire_date ?? '');
      setPersonnelNo(s.personnel_no ?? '');
      setSalary(s.salary != null ? String(s.salary) : '');
      setSgkNo(s.sgk_no ?? '');
      setShiftType(s.shift_type ?? '');
      setWorkDays(Array.isArray(s.work_days) && s.work_days.length ? s.work_days : [1, 2, 3, 4, 5]);
      setAppPermissions(typeof s.app_permissions === 'object' && s.app_permissions ? { ...DEFAULT_PERMISSIONS, ...s.app_permissions } : DEFAULT_PERMISSIONS);
      setNotes(s.notes ?? '');
      setIsActive(s.is_active ?? true);
      setOfficeLocation(s.office_location ?? '');
      setAchievements(Array.isArray(s.achievements) ? s.achievements.join(', ') : '');
      setEmergencyContactName(s.emergency_contact_name ?? '');
      setEmergencyContactPhone(s.emergency_contact_phone ?? '');
      setWhatsapp(s.whatsapp ?? '');
      setVerificationBadge(s.verification_badge === 'blue' || s.verification_badge === 'yellow' ? s.verification_badge : '');
    })().finally(() => setLoading(false));
  }, [id]);

  const toggleDay = (d: number) => {
    setWorkDays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const togglePermission = (key: string) => {
    setAppPermissions((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const submit = async () => {
    if (!id || !staff) return;
    setSaving(true);
    try {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token || !supabaseUrl) {
        Alert.alert('Hata', 'Oturum bulunamadı.');
        setSaving(false);
        return;
      }
      const url = `${supabaseUrl}/functions/v1/update-staff`;
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
          ...(supabaseAnonKey ? { apikey: supabaseAnonKey } : {}),
        },
        body: JSON.stringify({
          staff_id: id,
          access_token: session.access_token,
          password: password.trim() || undefined,
          full_name: full_name.trim() || null,
          email: email.trim() || null,
          role: role || null,
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
          app_permissions: app_permissions,
          work_days: work_days,
          shift_type: shift_type || null,
          notes: notes.trim() || null,
          is_active,
          whatsapp: whatsapp.trim() || null,
          office_location: office_location.trim() || null,
          achievements: achievements ? achievements.split(',').map((s) => s.trim()).filter(Boolean) : [],
          emergency_contact_name: emergency_contact_name.trim() || null,
          emergency_contact_phone: emergency_contact_phone.trim() || null,
          verification_badge: verification_badge === 'blue' || verification_badge === 'yellow' ? verification_badge : null,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data?.error ?? `HTTP ${res.status}`);
      if (data?.error) throw new Error(data.error);
      const { error: updateErr } = await supabase
        .from('staff')
        .update({
          notes: notes.trim() || null,
          office_location: office_location.trim() || null,
          achievements: achievements ? achievements.split(',').map((s) => s.trim()).filter(Boolean) : [],
          emergency_contact_name: emergency_contact_name.trim() || null,
          emergency_contact_phone: emergency_contact_phone.trim() || null,
          whatsapp: whatsapp.trim() || null,
          verification_badge: verification_badge === 'blue' || verification_badge === 'yellow' ? verification_badge : null,
        })
        .eq('id', id);
      if (updateErr) throw new Error(updateErr.message);
      Alert.alert('Başarılı', 'Çalışan bilgileri güncellendi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Güncellenemedi.');
    }
    setSaving(false);
  };

  if (loading || !staff) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={90}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.sectionTitle}>👤 Çalışan düzenle</Text>

        <Text style={styles.label}>Yeni şifre (boş bırakırsanız değişmez)</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          placeholder="••••••••"
          secureTextEntry
          placeholderTextColor="#9ca3af"
        />

        <Text style={styles.label}>Ad Soyad</Text>
        <TextInput style={styles.input} value={full_name} onChangeText={setFullName} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>E-posta</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          placeholder="E-posta"
          keyboardType="email-address"
          autoCapitalize="none"
          placeholderTextColor="#9ca3af"
        />
        <Text style={styles.label}>Telefon</Text>
        <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="Telefon" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>WhatsApp</Text>
        <TextInput style={styles.input} value={whatsapp} onChangeText={setWhatsapp} placeholder="05551234567" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Doğum tarihi</Text>
        <TextInput style={styles.input} value={birth_date} onChangeText={setBirthDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>T.C. Kimlik</Text>
        <TextInput style={styles.input} value={id_number} onChangeText={setIdNumber} placeholder="T.C. Kimlik" keyboardType="number-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Adres</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="Adres" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Acil durum kişisi</Text>
        <TextInput style={styles.input} value={emergency_contact_name} onChangeText={setEmergencyContactName} placeholder="Ad Soyad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Acil durum telefonu</Text>
        <TextInput style={styles.input} value={emergency_contact_phone} onChangeText={setEmergencyContactPhone} placeholder="0532 111 22 33" keyboardType="phone-pad" placeholderTextColor="#9ca3af" />

        <Text style={styles.sectionTitle}>🏢 Çalışan bilgileri</Text>
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
        <Text style={styles.label}>Departman</Text>
        <View style={styles.chips}>
          {DEPARTMENTS.map((d) => (
            <TouchableOpacity
              key={d.value}
              style={[styles.chip, department === d.value && styles.chipActive]}
              onPress={() => setDepartment(d.value)}
            >
              <Text style={[styles.chipText, department === d.value && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Pozisyon</Text>
        <TextInput style={styles.input} value={position} onChangeText={setPosition} placeholder="Pozisyon" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>İşe başlama tarihi</Text>
        <TextInput style={styles.input} value={hire_date} onChangeText={setHireDate} placeholder="YYYY-MM-DD" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Personel no</Text>
        <TextInput style={styles.input} value={personnel_no} onChangeText={setPersonnelNo} placeholder="Personel no" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Ofis / Konum</Text>
        <TextInput style={styles.input} value={office_location} onChangeText={setOfficeLocation} placeholder="Örn: 2. Kat Ofisi" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>Başarılar (virgülle)</Text>
        <TextInput style={styles.input} value={achievements} onChangeText={setAchievements} placeholder="Örn: Ayın Personeli 2024, En İyi Müşteri Yorumu" placeholderTextColor="#9ca3af" />
        <Text style={styles.sectionTitle}>💰 Maaş bilgileri</Text>
        <Text style={styles.label}>Maaş (TL)</Text>
        <TextInput style={styles.input} value={salary} onChangeText={setSalary} placeholder="Maaş" keyboardType="decimal-pad" placeholderTextColor="#9ca3af" />
        <Text style={styles.label}>SGK no</Text>
        <TextInput style={styles.input} value={sgk_no} onChangeText={setSgkNo} placeholder="SGK no" placeholderTextColor="#9ca3af" />

        <Text style={styles.sectionTitle}>⏰ Çalışma</Text>
        <Text style={styles.label}>Vardiya</Text>
        <View style={styles.chips}>
          {SHIFT_TYPES.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.chip, shift_type === s.value && styles.chipActive]}
              onPress={() => setShiftType(s.value)}
            >
              <Text style={[styles.chipText, shift_type === s.value && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Çalışma günleri</Text>
        <View style={styles.chips}>
          {DAYS.map((d) => (
            <TouchableOpacity key={d.value} style={[styles.chip, work_days.includes(d.value) && styles.chipActive]} onPress={() => toggleDay(d.value)}>
              <Text style={[styles.chipText, work_days.includes(d.value) && styles.chipTextActive]}>{d.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={styles.sectionTitle}>📱 Uygulama yetkileri</Text>
        {APP_PERMISSIONS.map((p) => (
          <TouchableOpacity key={p.key} style={styles.checkRow} onPress={() => togglePermission(p.key)}>
            <Text style={styles.checkbox}>{app_permissions[p.key] ? '☑' : '☐'}</Text>
            <Text style={styles.checkLabel}>{p.label}</Text>
          </TouchableOpacity>
        ))}

        <View style={styles.rowSwitch}>
          <Text style={styles.label}>Aktif</Text>
          <Switch value={is_active} onValueChange={setIsActive} trackColor={{ false: '#cbd5e0', true: '#1a365d' }} thumbColor="#fff" />
        </View>

        <Text style={styles.sectionTitle}>✓ Doğrulama rozeti (mavi / sarı tik)</Text>
        <Text style={styles.label}>Tik verilen kullanıcı her yerde rozet ile görünür. Kaldırmak için "Yok" seçin.</Text>
        <View style={styles.chips}>
          <TouchableOpacity
            style={[styles.chip, verification_badge === '' && styles.chipActive]}
            onPress={() => setVerificationBadge('')}
          >
            <Text style={[styles.chipText, verification_badge === '' && styles.chipTextActive]}>Yok (kaldır)</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, verification_badge === 'blue' && styles.chipActive]}
            onPress={() => setVerificationBadge('blue')}
          >
            <Text style={[styles.chipText, verification_badge === 'blue' && styles.chipTextActive]}>🔵 Mavi tik</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.chip, verification_badge === 'yellow' && styles.chipActive]}
            onPress={() => setVerificationBadge('yellow')}
          >
            <Text style={[styles.chipText, verification_badge === 'yellow' && styles.chipTextActive]}>🟡 Sarı tik</Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.sectionTitle}>📝 Admin notları</Text>
        <Text style={styles.label}>Not (sadece admin görür)</Text>
        <TextInput style={[styles.input, styles.textArea]} value={notes} onChangeText={setNotes} placeholder="Çalışkan, terfi düşünülebilir..." placeholderTextColor="#9ca3af" multiline />

        {saving ? (
          <ActivityIndicator size="large" color="#1a365d" style={{ marginTop: 24 }} />
        ) : (
          <>
            <TouchableOpacity style={styles.primaryButton} onPress={submit} disabled={saving}>
              <Text style={styles.primaryButtonText}>💾 Kaydet</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryButton} onPress={() => router.back()} disabled={saving}>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  rowSwitch: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  checkRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  checkbox: { fontSize: 18, marginRight: 10 },
  checkLabel: { fontSize: 15, color: '#374151' },
  primaryButton: { backgroundColor: '#1a365d', paddingVertical: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  primaryButtonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  secondaryButton: { paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#718096', fontSize: 16 },
});
