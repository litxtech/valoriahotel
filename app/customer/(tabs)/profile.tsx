import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';

function getDisplayName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return 'Misafir';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') return name.trim();
  const email = user.email ?? '';
  const part = email.split('@')[0];
  if (part) return part.charAt(0).toUpperCase() + part.slice(1);
  return 'Misafir';
}

export default function CustomerProfile() {
  const router = useRouter();
  const { t } = useTranslation();
  const { user, signOut } = useAuthStore();
  const isLoggedIn = !!user;

  const handleSignOut = () => {
    Alert.alert(
      'Çıkış yap',
      'Hesabınızdan çıkmak istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Çıkış yap',
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.header}>
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.avatarText}>{getDisplayName().charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.name}>{getDisplayName()}</Text>
        {user?.email ? (
          <Text style={styles.email}>{user.email}</Text>
        ) : (
          <Text style={styles.subtitle}>Giriş yaparak rezervasyon ve mesajlarınıza erişin.</Text>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Hesap</Text>
        {isLoggedIn ? (
          <TouchableOpacity style={styles.linkRow} onPress={handleSignOut} activeOpacity={0.7}>
            <Text style={[styles.linkText, styles.signOutText]}>Çıkış yap</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/auth')} activeOpacity={0.7}>
            <Text style={styles.linkText}>Giriş yap / Kayıt ol</Text>
            <Text style={styles.linkArrow}>→</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push('/customer/key')}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>🔑 Dijital Anahtar</Text>
          <Text style={styles.linkArrow}>→</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{t('legalAndContact')}</Text>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'privacy' } })}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>📄 {t('privacyPolicy')}</Text>
          <Text style={styles.linkArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'terms' } })}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>📋 {t('termsOfService')}</Text>
          <Text style={styles.linkArrow}>→</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.linkRow}
          onPress={() => router.push({ pathname: '/legal/[type]', params: { type: 'cookies' } })}
          activeOpacity={0.7}
        >
          <Text style={styles.linkText}>🍪 {t('cookiePolicy')}</Text>
          <Text style={styles.linkArrow}>→</Text>
        </TouchableOpacity>
        <Text style={styles.contactLabel}>{t('contact')}: support@valoriahotel.com</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + 24 },
  header: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
    marginBottom: theme.spacing.md,
  },
  avatarPlaceholder: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: { fontSize: 32, fontWeight: '700', color: theme.colors.white },
  name: { ...theme.typography.title, color: theme.colors.text, marginBottom: 4 },
  email: { ...theme.typography.bodySmall, color: theme.colors.textSecondary },
  subtitle: { ...theme.typography.bodySmall, color: theme.colors.textSecondary },
  section: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.lg,
    marginBottom: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  sectionTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: 4,
    paddingTop: 14,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  linkText: { fontSize: 15, color: theme.colors.text },
  signOutText: { color: theme.colors.error, fontWeight: '500' },
  linkArrow: { fontSize: 16, color: theme.colors.textMuted },
  contactLabel: { ...theme.typography.bodySmall, color: theme.colors.textSecondary, marginTop: 16, marginBottom: 16 },
});
