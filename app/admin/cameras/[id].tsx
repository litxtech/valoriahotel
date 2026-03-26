import { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import { CameraStreamView } from '@/components/CameraStreamView';
import { getCamera, getCameraPermissionsByCamera, setCameraPermissions } from '@/lib/cameras';
import type { Camera, RecordMode } from '@/lib/cameras';

const RECORD_MODES: { value: RecordMode; label: string }[] = [
  { value: 'motion', label: 'Hareket algılandığında' },
  { value: 'continuous', label: '7/24 sürekli' },
  { value: 'scheduled', label: 'Belirli saatler' },
];

type StaffRow = { id: string; full_name: string | null };

export default function CameraDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [camera, setCamera] = useState<Camera | null>(null);
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [ip_address, setIpAddress] = useState('');
  const [netmask, setNetmask] = useState('');
  const [gateway, setGateway] = useState('');
  const [dns, setDns] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [record_mode, setRecordMode] = useState<RecordMode>('motion');
  const [retention_days, setRetentionDays] = useState('7');
  const [schedule_start, setScheduleStart] = useState('22:00');
  const [schedule_end, setScheduleEnd] = useState('06:00');
  const [is_active, setIsActive] = useState(true);
  const [selectedStaff, setSelectedStaff] = useState<Set<string>>(new Set());
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const cam = await getCamera(id);
      if (!cam) {
        Alert.alert('Hata', 'Kamera bulunamadı.');
        setFetching(false);
        return;
      }
      setCamera(cam);
      setName(cam.name);
      setLocation(cam.location ?? '');
      setIpAddress(cam.ip_address);
      setNetmask(cam.netmask ?? '');
      setGateway(cam.gateway ?? '');
      setDns(cam.dns ?? '');
      setUsername(cam.username);
      setPassword(cam.password);
      setRecordMode(cam.record_mode);
      setRetentionDays(String(cam.retention_days));
      setScheduleStart(cam.schedule_start?.slice(0, 5) ?? '22:00');
      setScheduleEnd(cam.schedule_end?.slice(0, 5) ?? '06:00');
      setIsActive(cam.is_active);

      const perms = await getCameraPermissionsByCamera(id);
      setSelectedStaff(new Set(perms));
      setFetching(false);
    })();
  }, [id]);

  useEffect(() => {
    supabase
      .from('staff')
      .select('id, full_name')
      .eq('is_active', true)
      .order('full_name')
      .then(({ data }) => setStaffList(data ?? []));
  }, []);

  const toggleStaff = (staffId: string) => {
    setSelectedStaff((prev) => {
      const next = new Set(prev);
      if (next.has(staffId)) next.delete(staffId);
      else next.add(staffId);
      return next;
    });
  };

  const submit = async () => {
    if (!id) return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Hata', 'Kamera adı girin.');
      return;
    }
    if (!ip_address.trim() || !username.trim() || !password.trim()) {
      Alert.alert('Hata', 'IP, kullanıcı ve şifre girin.');
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase
        .from('cameras')
        .update({
          name: trimmedName,
          location: location.trim() || null,
          ip_address: ip_address.trim(),
          netmask: netmask.trim() || null,
          gateway: gateway.trim() || null,
          dns: dns.trim() || null,
          username: username.trim(),
          password: password.trim(),
          record_mode,
          retention_days: parseInt(retention_days, 10) || 7,
          schedule_start: record_mode === 'scheduled' ? schedule_start : null,
          schedule_end: record_mode === 'scheduled' ? schedule_end : null,
          is_active,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);
      if (error) throw error;

      await setCameraPermissions(id, Array.from(selectedStaff));
      Alert.alert('Başarılı', 'Kamera güncellendi.');
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Güncellenemedi.');
    }
    setLoading(false);
  };

  if (fetching || !camera) {
    return (
      <View style={styles.centered}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <AdminCard>
          <Text style={styles.sectionTitle}>Canlı önizleme</Text>
          <View style={styles.previewWrap}>
            <CameraStreamView camera={camera} style={styles.preview} />
          </View>
          <TouchableOpacity
            style={styles.fullScreenBtn}
            onPress={() => router.push(`/staff/cameras/view/${id}`)}
          >
            <Ionicons name="expand-outline" size={20} color="#fff" />
            <Text style={styles.fullScreenBtnText}>Tam ekran izle</Text>
          </TouchableOpacity>
        </AdminCard>

        <AdminCard>
          <Text style={styles.sectionTitle}>Temel bilgiler</Text>
          <Text style={styles.label}>Kamera adı *</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder="Kamera adı"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <Text style={styles.label}>Konum</Text>
          <TextInput
            style={styles.input}
            value={location}
            onChangeText={setLocation}
            placeholder="Konum"
            placeholderTextColor={adminTheme.colors.textMuted}
          />
          <View style={styles.switchRow}>
            <Text style={styles.label}>Aktif</Text>
            <TouchableOpacity
              style={[styles.switch, is_active && styles.switchOn]}
              onPress={() => setIsActive(!is_active)}
            >
              <View style={[styles.switchThumb, is_active && styles.switchThumbOn]} />
            </TouchableOpacity>
          </View>
        </AdminCard>

        <AdminCard>
          <Text style={styles.sectionTitle}>Ağ ayarları</Text>
          <Text style={styles.label}>IP adresi *</Text>
          <TextInput
            style={styles.input}
            value={ip_address}
            onChangeText={setIpAddress}
            placeholder="192.168.1.240"
            placeholderTextColor={adminTheme.colors.textMuted}
            keyboardType="numeric"
            autoCapitalize="none"
          />
          <Text style={styles.label}>Maske</Text>
          <TextInput
            style={styles.input}
            value={netmask}
            onChangeText={setNetmask}
            placeholder="255.255.255.0"
            placeholderTextColor={adminTheme.colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Ağ geçidi</Text>
          <TextInput
            style={styles.input}
            value={gateway}
            onChangeText={setGateway}
            placeholder="192.168.1.1"
            placeholderTextColor={adminTheme.colors.textMuted}
            autoCapitalize="none"
          />
        </AdminCard>

        <AdminCard>
          <Text style={styles.sectionTitle}>Giriş bilgileri</Text>
          <Text style={styles.label}>Kullanıcı (Tapo Kamera Hesabı e-postası) *</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={setUsername}
            placeholder="ornek@gmail.com"
            keyboardType="email-address"
            placeholderTextColor={adminTheme.colors.textMuted}
            autoCapitalize="none"
          />
          <Text style={styles.label}>Şifre *</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            placeholderTextColor={adminTheme.colors.textMuted}
            secureTextEntry
            autoCapitalize="none"
          />
        </AdminCard>

        <AdminCard>
          <Text style={styles.sectionTitle}>Kayıt ayarları</Text>
          <View style={styles.recordModes}>
            {RECORD_MODES.map((m) => (
              <TouchableOpacity
                key={m.value}
                style={[styles.recordChip, record_mode === m.value && styles.recordChipActive]}
                onPress={() => setRecordMode(m.value)}
              >
                <Text style={[styles.recordChipText, record_mode === m.value && styles.recordChipTextActive]}>
                  {m.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          {record_mode === 'scheduled' && (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.label}>Başlangıç</Text>
                <TextInput
                  style={styles.input}
                  value={schedule_start}
                  onChangeText={setScheduleStart}
                  placeholder="22:00"
                  placeholderTextColor={adminTheme.colors.textMuted}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.label}>Bitiş</Text>
                <TextInput
                  style={styles.input}
                  value={schedule_end}
                  onChangeText={setScheduleEnd}
                  placeholder="06:00"
                  placeholderTextColor={adminTheme.colors.textMuted}
                />
              </View>
            </View>
          )}
          <Text style={styles.label}>Kayıt süresi (gün)</Text>
          <TextInput
            style={styles.input}
            value={retention_days}
            onChangeText={setRetentionDays}
            placeholder="7"
            placeholderTextColor={adminTheme.colors.textMuted}
            keyboardType="number-pad"
          />
        </AdminCard>

        <AdminCard>
          <Text style={styles.sectionTitle}>Yetkili personel</Text>
          <View style={styles.staffList}>
            {staffList.map((s) => (
              <TouchableOpacity
                key={s.id}
                style={styles.staffItem}
                onPress={() => toggleStaff(s.id)}
              >
                <Ionicons
                  name={selectedStaff.has(s.id) ? 'checkbox' : 'square-outline'}
                  size={24}
                  color={selectedStaff.has(s.id) ? adminTheme.colors.primary : adminTheme.colors.textMuted}
                />
                <Text style={styles.staffName}>{s.full_name ?? s.id.slice(0, 8)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </AdminCard>

        <AdminButton
          title={loading ? 'Kaydediliyor...' : 'Güncelle'}
          onPress={submit}
          disabled={loading}
          variant="accent"
          size="lg"
          fullWidth
          style={{ marginTop: 8, marginBottom: 32 }}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  content: { padding: 16, paddingBottom: 48 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: adminTheme.colors.textMuted },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginBottom: 16,
  },
  previewWrap: {
    borderRadius: adminTheme.radius.md,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  preview: { height: 180 },
  fullScreenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: adminTheme.colors.primary,
    paddingVertical: 12,
    borderRadius: adminTheme.radius.md,
    marginTop: 12,
  },
  fullScreenBtnText: { color: '#fff', fontWeight: '600', fontSize: 15 },
  label: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 8, marginTop: 12 },
  input: {
    backgroundColor: adminTheme.colors.surface,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    fontSize: 16,
    color: adminTheme.colors.text,
  },
  row: { flexDirection: 'row' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  switch: {
    width: 52,
    height: 28,
    borderRadius: 14,
    backgroundColor: adminTheme.colors.border,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  switchOn: { backgroundColor: adminTheme.colors.primary },
  switchThumb: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
  },
  switchThumbOn: { alignSelf: 'flex-end' },
  recordModes: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  recordChip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  recordChipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  recordChipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  recordChipTextActive: { color: '#fff' },
  staffList: { gap: 8 },
  staffItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  staffName: { fontSize: 15, fontWeight: '600', color: adminTheme.colors.text },
});
