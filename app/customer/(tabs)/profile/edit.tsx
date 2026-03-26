import { useState, useEffect } from 'react';
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
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { CachedImage } from '@/components/CachedImage';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { theme } from '@/constants/theme';

function getInitialName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  return '';
}

function getInitialPhone(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const phone = user.user_metadata?.phone;
  if (phone && typeof phone === 'string') return phone.trim();
  return '';
}

function getInitialWhatsApp(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const whatsapp = user.user_metadata?.whatsapp;
  if (whatsapp && typeof whatsapp === 'string') return whatsapp.trim();
  return '';
}

export default function CustomerProfileEdit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, loadSession } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);
  const [coverUri, setCoverUri] = useState<string | null>(null);
  const [avatarUri, setAvatarUri] = useState<string | null>(null);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    setFullName(getInitialName());
    setPhone(getInitialPhone());
    setWhatsapp(getInitialWhatsApp());
    setCoverUri((user?.user_metadata?.cover_url as string) || null);
    setAvatarUri((user?.user_metadata?.avatar_url as string) || null);
  }, [user?.id]);

  const saveUserMetadata = async (updates: Record<string, unknown>) => {
    if (!user) return;
    const next = { ...(user.user_metadata || {}), ...updates };
    const { error } = await supabase.auth.updateUser({ data: next });
    if (error) throw error;
    await loadSession();
  };

  const pickCover = async () => {
    if (!user || uploadingCover) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Kapak fotografi secmek icin galeri izni gerekiyor.',
      settingsMessage: 'Galeri izni kapali. Ayarlardan izin verip tekrar deneyin.',
    });
    if (!granted) return;
    try {
      setUploadingCover(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const arrayBuffer = await uriToArrayBuffer(result.assets[0].uri);
      const path = `customer/${user.id}/cover_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profiles').upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from('profiles').getPublicUrl(path);
      await saveUserMetadata({ cover_url: publicUrl });
      setCoverUri(publicUrl);
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Kapak fotografi yuklenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setUploadingCover(false);
    }
  };

  const pickAvatar = async () => {
    if (!user || uploadingAvatar) return;
    const granted = await ensureMediaLibraryPermission({
      title: 'Galeri izni',
      message: 'Avatar secmek icin galeri izni gerekiyor.',
      settingsMessage: 'Galeri izni kapali. Ayarlardan izin verip tekrar deneyin.',
    });
    if (!granted) return;
    try {
      setUploadingAvatar(true);
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.65,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      const arrayBuffer = await uriToArrayBuffer(result.assets[0].uri);
      const path = `customer/${user.id}/avatar_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profiles').upload(path, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const {
        data: { publicUrl },
      } = supabase.storage.from('profiles').getPublicUrl(path);
      await saveUserMetadata({ avatar_url: publicUrl });
      setAvatarUri(publicUrl);
      const guest = await getOrCreateGuestForCurrentSession();
      if (guest?.guest_id) {
        await supabase.from('guests').update({ photo_url: publicUrl }).eq('id', guest.guest_id);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Avatar yuklenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleSave = async () => {
    if (!user) {
      Alert.alert('Hata', 'Giriş yapmanız gerekiyor.');
      return;
    }
    const nameTrim = fullName.trim();
    if (!nameTrim) {
      Alert.alert('Eksik bilgi', 'Ad soyad alanı zorunludur.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({
        data: {
          full_name: nameTrim,
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(whatsapp.trim() ? { whatsapp: whatsapp.trim() } : {}),
        },
      });
      if (error) throw error;
      await loadSession();
      Alert.alert('Kaydedildi', 'Profil bilgileriniz güncellendi.', [
        { text: 'Tamam', onPress: () => router.replace('/customer/profile') },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Profil güncellenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setSaving(false);
    }
  };

  if (!user) {
    return (
      <View style={[styles.placeholderContainer, { paddingTop: insets.top + 48 }]}>
        <View style={styles.placeholderIconWrap}>
          <Ionicons name="person-circle-outline" size={64} color={theme.colors.primary} />
        </View>
        <Text style={styles.placeholderTitle}>Profil düzenle</Text>
        <Text style={styles.placeholderText}>Bilgilerinizi güncellemek için giriş yapmanız gerekiyor.</Text>
        <TouchableOpacity style={[styles.primaryButton, { alignSelf: 'stretch' }]} onPress={() => router.replace('/auth')} activeOpacity={0.85}>
          <Ionicons name="log-in-outline" size={22} color={theme.colors.white} style={{ marginRight: 10 }} />
          <Text style={styles.primaryButtonText}>Giriş yap</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
    >
      <ScrollView
        style={styles.container}
        contentContainerStyle={[styles.content, { paddingTop: 16, paddingBottom: insets.bottom + 32 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.mediaSection}>
          <View style={styles.mediaSectionHeader}>
            <View style={styles.mediaSectionIconWrap}>
              <Ionicons name="images" size={22} color={theme.colors.primary} />
            </View>
            <View style={styles.mediaSectionText}>
              <Text style={styles.sectionTitle}>Profil görselleri</Text>
              <Text style={styles.sectionHint}>Kapak ve profil fotoğrafınızı buradan güncelleyebilirsiniz.</Text>
            </View>
          </View>
          <View style={styles.mediaGrid}>
            <TouchableOpacity style={styles.mediaCard} onPress={pickCover} activeOpacity={0.86} disabled={uploadingCover || saving}>
              <View style={styles.mediaPreview}>
                {coverUri ? (
                  <CachedImage uri={coverUri} style={styles.coverImage} contentFit="cover" />
                ) : (
                  <View style={styles.mediaPlaceholder}>
                    <Ionicons name="image-outline" size={36} color={theme.colors.textMuted} />
                    <Text style={styles.mediaPlaceholderText}>Kapak ekle</Text>
                  </View>
                )}
                <View style={styles.mediaEditBadge}>
                  <Ionicons name="camera" size={16} color={theme.colors.white} />
                </View>
                {(uploadingCover || saving) && (
                  <View style={styles.mediaOverlay}>
                    <ActivityIndicator color={theme.colors.white} size="small" />
                  </View>
                )}
              </View>
              <Text style={styles.mediaCardLabel}>Kapak fotoğrafı</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.mediaCard} onPress={pickAvatar} activeOpacity={0.86} disabled={uploadingAvatar || saving}>
              <View style={styles.avatarPreview}>
                {avatarUri ? (
                  <CachedImage uri={avatarUri} style={styles.avatarImage} contentFit="cover" />
                ) : (
                  <View style={styles.avatarPlaceholder}>
                    <Text style={styles.avatarInitial}>{fullName.trim().charAt(0).toUpperCase() || '?'}</Text>
                  </View>
                )}
                <View style={styles.mediaEditBadge}>
                  <Ionicons name="camera" size={14} color={theme.colors.white} />
                </View>
                {(uploadingAvatar || saving) && (
                  <View style={styles.mediaOverlay}>
                    <ActivityIndicator color={theme.colors.white} size="small" />
                  </View>
                )}
              </View>
              <Text style={styles.mediaCardLabel}>Profil fotoğrafı</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <View style={styles.sectionIconWrap}>
              <Ionicons name="person" size={20} color={theme.colors.primary} />
            </View>
            <Text style={styles.sectionTitle}>Kişisel bilgiler</Text>
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Ad soyad</Text>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder="Adınız ve soyadınız"
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Telefon <Text style={styles.optional}>(isteğe bağlı)</Text></Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="+90 5XX XXX XX XX"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>WhatsApp <Text style={styles.optional}>(isteğe bağlı)</Text></Text>
            <TextInput
              style={styles.input}
              value={whatsapp}
              onChangeText={setWhatsapp}
              placeholder="05551234567"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>
          <View style={styles.emailCard}>
            <Ionicons name="mail-outline" size={20} color={theme.colors.textMuted} />
            <View style={styles.emailCardText}>
              <Text style={styles.emailLabel}>E-posta</Text>
              <Text style={styles.emailValue}>{user.email ?? (user.user_metadata?.email as string) ?? '—'}</Text>
              <Text style={styles.hint}>Güvenlik nedeniyle değiştirilemez</Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.primaryButton, saving && styles.primaryButtonDisabled]}
          onPress={handleSave}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color={theme.colors.white} size="small" />
          ) : (
            <>
              <Ionicons name="checkmark-circle" size={24} color={theme.colors.white} style={{ marginRight: 10 }} />
              <Text style={styles.primaryButtonText}>Değişiklikleri kaydet</Text>
            </>
          )}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg },
  mediaSection: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  mediaSectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.lg,
  },
  mediaSectionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  mediaSectionText: { flex: 1 },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
  },
  sectionIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: theme.colors.text,
  },
  sectionHint: {
    fontSize: 13,
    color: theme.colors.textMuted,
    lineHeight: 20,
    marginTop: 4,
  },
  mediaGrid: {
    flexDirection: 'row',
    gap: 14,
  },
  mediaCard: {
    flex: 1,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  mediaPreview: {
    height: 100,
    backgroundColor: theme.colors.borderLight,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  avatarPreview: {
    height: 100,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.borderLight,
    position: 'relative',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  mediaPlaceholderText: {
    fontSize: 12,
    color: theme.colors.textMuted,
    marginTop: 6,
  },
  mediaEditBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarImage: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: theme.colors.surface,
  },
  avatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: theme.colors.surface,
  },
  avatarInitial: {
    fontSize: 28,
    fontWeight: '700',
    color: theme.colors.white,
  },
  mediaCardLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlign: 'center',
  },
  mediaOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputGroup: {
    marginBottom: theme.spacing.lg,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 8,
  },
  optional: {
    fontWeight: '400',
    color: theme.colors.textMuted,
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: theme.colors.text,
  },
  emailCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emailCardText: { flex: 1, marginLeft: 12 },
  emailLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: theme.colors.textMuted,
    marginBottom: 4,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.text,
  },
  hint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    marginTop: 4,
  },
  primaryButton: {
    flexDirection: 'row',
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
    shadowColor: theme.colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 4,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: theme.colors.white },
  placeholderContainer: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    paddingHorizontal: theme.spacing.xl,
    alignItems: 'center',
  },
  placeholderIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.lg,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  placeholderText: {
    fontSize: 15,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.xl,
    lineHeight: 22,
  },
});
