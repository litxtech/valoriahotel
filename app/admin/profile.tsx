import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Switch,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { CachedImage } from '@/components/CachedImage';
import { SharedAppLinks } from '@/components/SharedAppLinks';

const ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  reception_chief: 'Resepsiyon Şefi',
  receptionist: 'Resepsiyonist',
  housekeeping: 'Housekeeping',
  technical: 'Teknik',
  security: 'Güvenlik',
};

/** Profilim sayfasında görev/rol olarak seçilebilecek hazır etiketler (position alanına yazılır). */
const PROFILE_ROLE_OPTIONS = [
  'Sahip',
  'Admin',
  'Genel Müdür',
  'Personel',
  'Resepsiyon Şefi',
  'Resepsiyonist',
  'Housekeeping',
  'Teknik',
  'Güvenlik',
];

type AdminProfile = {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  profile_image: string | null;
  role: string | null;
  department: string | null;
  position: string | null;
  show_gold_profile_border: boolean;
};

export default function AdminProfileScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [roleOther, setRoleOther] = useState(''); // "Diğer" seçiliyken serbest metin
  const profileRef = useRef<AdminProfile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!staff?.id || staff.role !== 'admin') {
      router.replace('/admin');
      return;
    }
    const load = async () => {
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, email, phone, profile_image, role, department, position, show_gold_profile_border')
        .eq('id', staff.id)
        .single();
      if (data) {
        const d = data as AdminProfile;
        setProfile({
          ...d,
          show_gold_profile_border: d.show_gold_profile_border ?? false,
        });
        const pos = (data as AdminProfile).position;
        if (pos && !PROFILE_ROLE_OPTIONS.includes(pos)) setRoleOther(pos);
      }
    };
    load();
  }, [staff?.id, staff?.role]);

  const pickImage = async () => {
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Profil fotografi secmek icin galeri erisimi istiyoruz.',
      settingsMessage: 'Galeri izni kapali. Profil fotografi icin ayarlardan izin verin.',
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.6,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploading(true);
      const arrayBuffer = await uriToArrayBuffer(result.assets[0].uri);
      const fileName = `staff/${profile.id}/${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName);
      await supabase.from('staff').update({ profile_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, profile_image: publicUrl } : null));
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Resim yüklenemedi.');
    } finally {
      setUploading(false);
    }
  };

  const saveField = useCallback(async (field: keyof AdminProfile, value: string | null) => {
    if (!profile?.id) return;
    const trimmed = value?.trim() ?? '';
    const payload = field === 'email' ? { [field]: trimmed || profile.email || '' } : { [field]: trimmed || null };
    setSaving(true);
    const { error } = await supabase.from('staff').update(payload).eq('id', profile.id);
    setSaving(false);
    if (error) {
      Alert.alert('Kayıt hatası', `${field} kaydedilemedi: ${error.message}`);
      return;
    }
    setProfile((p) => (p ? { ...p, ...payload } : null));
  }, [profile?.id, profile?.email]);

  const setPositionFromRole = useCallback(
    (value: string) => {
      if (!profile) return;
      const trimmed = value.trim();
      setRoleOther('');
      setProfile((p) => (p ? { ...p, position: trimmed || null } : null));
      setSaving(true);
      supabase
        .from('staff')
        .update({ position: trimmed || null })
        .eq('id', profile.id)
        .then(({ error }) => {
          setSaving(false);
          if (error) Alert.alert('Kayıt hatası', `Görev kaydedilemedi: ${error.message}`);
        });
    },
    [profile?.id]
  );

  // Sayfadan çıkarken bekleyen değişiklikleri kaydet
  useEffect(() => {
    return () => {
      const p = profileRef.current;
      if (!p?.id) return;
      const name = p.full_name?.trim() ?? '';
      const email = p.email?.trim() ?? '';
      const phone = p.phone?.trim() ?? null;
      supabase.from('staff').update({ full_name: name || null, email: email || p.email || '', phone }).eq('id', p.id);
    };
  }, []);

  if (!profile) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={adminTheme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  const avatarUri = profile.profile_image || undefined;

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <AdminCard>
          <View style={styles.avatarSection}>
            <TouchableOpacity
              onPress={pickImage}
              disabled={uploading}
              style={styles.avatarWrap}
              activeOpacity={0.8}
            >
              {avatarUri ? (
                <CachedImage uri={avatarUri} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={styles.avatarPlaceholder}>
                  <Ionicons name="person" size={48} color={adminTheme.colors.textMuted} />
                </View>
              )}
              {uploading && (
                <View style={styles.uploadOverlay}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              )}
              <View style={styles.avatarEditBadge}>
                <Ionicons name="camera" size={18} color="#fff" />
              </View>
            </TouchableOpacity>
            <Text style={styles.roleLabel}>
              {ROLE_LABELS[profile.role ?? ''] ?? profile.role ?? 'Admin'}
              {profile.department ? ` · ${profile.department}` : ''}
              {profile.position ? ` · ${profile.position}` : ''}
            </Text>
            <Text style={styles.avatarHint}>Profil fotoğrafı için dokunun</Text>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Profil kenar efekti</Text>
            <Text style={styles.fieldHint}>Profiliniz ziyaret edildiğinde sol, sağ ve üst kenarlarda altın rengi çerçeve gösterilir.</Text>
            <View style={styles.toggleRow}>
              <Text style={styles.toggleLabel}>Altın kenar göster</Text>
              <Switch
                value={profile.show_gold_profile_border ?? false}
                onValueChange={async (value) => {
                  if (!profile?.id) return;
                  setProfile((p) => (p ? { ...p, show_gold_profile_border: value } : null));
                  setSaving(true);
                  const { error } = await supabase.from('staff').update({ show_gold_profile_border: value }).eq('id', profile.id);
                  setSaving(false);
                  if (error) Alert.alert('Kayıt hatası', `Ayar kaydedilemedi: ${error.message}`);
                }}
                trackColor={{ false: adminTheme.colors.border, true: adminTheme.colors.primary }}
                thumbColor="#fff"
              />
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Rol / Görev</Text>
            <Text style={styles.fieldHint}>Sahip, personel vb. görünen unvanınızı seçin veya yazın.</Text>
            <View style={styles.chipWrap}>
              {PROFILE_ROLE_OPTIONS.map((opt) => {
                const isSelected = (profile.position ?? '') === opt;
                return (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chip, isSelected && styles.chipActive]}
                    onPress={() => setPositionFromRole(opt)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.chipText, isSelected && styles.chipTextActive]}>{opt}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <View style={styles.roleOtherRow}>
              <TextInput
                style={[styles.input, styles.roleOtherInput]}
                value={roleOther}
                onChangeText={setRoleOther}
                onBlur={() => { if (roleOther.trim()) setPositionFromRole(roleOther.trim()); }}
                placeholder="Diğer (serbest yazın: örn. Müdür Yardımcısı)"
                placeholderTextColor={adminTheme.colors.textMuted}
              />
              {roleOther.trim() ? (
                <TouchableOpacity style={styles.roleOtherBtn} onPress={() => setPositionFromRole(roleOther.trim())}>
                  <Ionicons name="checkmark" size={20} color={adminTheme.colors.surface} />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          <View style={styles.field}>
            <Text style={styles.label}>Ad Soyad</Text>
            <TextInput
              style={styles.input}
              value={profile.full_name ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, full_name: t || null } : null))}
              onBlur={() => saveField('full_name', profile.full_name ?? '')}
              placeholder="Adınız soyadınız"
              placeholderTextColor={adminTheme.colors.textMuted}
              autoCapitalize="words"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={profile.email ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, email: t || null } : null))}
              onBlur={() => saveField('email', profile.email ?? '')}
              placeholder="ornek@otel.com"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
            />
          </View>
          <View style={styles.field}>
            <Text style={styles.label}>Telefon</Text>
            <TextInput
              style={styles.input}
              value={profile.phone ?? ''}
              onChangeText={(t) => setProfile((p) => (p ? { ...p, phone: t || null } : null))}
              onBlur={() => saveField('phone', profile.phone ?? '')}
              placeholder="0555 123 45 67"
              placeholderTextColor={adminTheme.colors.textMuted}
              keyboardType="phone-pad"
            />
          </View>
          {saving && (
            <View style={styles.savingRow}>
              <ActivityIndicator size="small" color={adminTheme.colors.accent} />
              <Text style={styles.savingText}>Kaydediliyor...</Text>
            </View>
          )}
        </AdminCard>

        <SharedAppLinks showManageButton title="Uygulamalar & Web Siteleri" compact />

        <Text style={styles.footNote}>
          Değişiklikler otomatik kaydedilir. Admin hesabınız personel tablosunda tutulur; giriş bilgileriniz (e-posta/şifre) Supabase Auth üzerinden yönetilir.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: adminTheme.colors.surfaceSecondary,
  },
  content: {
    padding: adminTheme.spacing.lg,
    paddingBottom: 32,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 24,
  },
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: adminTheme.colors.surfaceTertiary,
  },
  avatarPlaceholder: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  uploadOverlay: {
    position: 'absolute',
    inset: 0,
    borderRadius: 50,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarEditBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  roleLabel: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.primary,
  },
  avatarHint: {
    marginTop: 8,
    fontSize: 13,
    color: adminTheme.colors.textMuted,
  },
  field: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
    marginBottom: 6,
  },
  fieldHint: {
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    marginBottom: 10,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  toggleLabel: {
    fontSize: 15,
    fontWeight: '500',
    color: adminTheme.colors.text,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 12,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: {
    fontSize: 14,
    fontWeight: '600',
    color: adminTheme.colors.text,
  },
  chipTextActive: {
    color: adminTheme.colors.surface,
  },
  roleOtherRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  roleOtherInput: {
    flex: 1,
  },
  roleOtherBtn: {
    width: 44,
    height: 44,
    borderRadius: adminTheme.radius.md,
    backgroundColor: adminTheme.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
    borderRadius: adminTheme.radius.md,
    padding: adminTheme.spacing.md,
    fontSize: 15,
    backgroundColor: adminTheme.colors.surface,
    color: adminTheme.colors.text,
  },
  savingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  savingText: {
    fontSize: 13,
    color: adminTheme.colors.textMuted,
  },
  footNote: {
    marginTop: 20,
    fontSize: 12,
    color: adminTheme.colors.textMuted,
    lineHeight: 18,
  },
});
