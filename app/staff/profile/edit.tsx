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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

export default function StaffProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff, user, loadSession } = useAuthStore();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (staff) {
      setFullName(staff.full_name?.trim() ?? '');
      setPhone(staff.phone?.trim() ?? '');
      setEmail(staff.email?.trim() ?? '');
      setWhatsapp(staff.whatsapp?.trim() ?? '');
    }
  }, [staff?.id]);

  const handleSave = async () => {
    if (!staff?.id) {
      Alert.alert('Hata', 'Oturum gerekli.');
      return;
    }
    const nameTrim = fullName.trim();
    if (!nameTrim) {
      Alert.alert('Eksik bilgi', 'Ad soyad alanı zorunludur.');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('staff')
        .update({
          full_name: nameTrim,
          phone: phone.trim() || null,
          email: email.trim() || null,
          whatsapp: whatsapp.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', staff.id);
      if (error) throw error;

      if (user) {
        await supabase.auth.updateUser({
          data: { full_name: nameTrim },
        });
        await loadSession();
      }

      Alert.alert('Kaydedildi', 'Profil bilgileriniz güncellendi.', [
        { text: 'Tamam', onPress: () => router.back() },
      ]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Profil güncellenemedi.';
      Alert.alert('Hata', message);
    } finally {
      setSaving(false);
    }
  };

  if (!staff) {
    return (
      <View style={[styles.centered, { paddingTop: insets.top + 48 }]}>
        <Text style={styles.loadingText}>Yükleniyor...</Text>
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
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Profil bilgileri</Text>
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
            <Text style={styles.label}>Telefon</Text>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0555 123 45 67"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>E-posta</Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="ornek@valoria.com"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              editable={!saving}
            />
          </View>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>WhatsApp</Text>
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
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: theme.colors.textMuted },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.xl,
    marginBottom: theme.spacing.xl,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginBottom: 16,
  },
  inputGroup: { marginBottom: 16 },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.text,
    marginBottom: 6,
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { fontSize: 17, fontWeight: '700', color: theme.colors.white },
});
