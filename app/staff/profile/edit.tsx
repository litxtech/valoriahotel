import { useState, useCallback } from 'react';
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
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';

type Row = {
  id: string;
  full_name: string | null;
  department: string | null;
  position: string | null;
  hire_date: string | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  office_location: string | null;
  bio: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  achievements: string[] | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
};

function FieldLabel({ children }: { children: string }) {
  return <Text style={styles.label}>{children}</Text>;
}

function SectionTitle({ icon, title }: { icon: keyof typeof Ionicons.glyphMap; title: string }) {
  return (
    <View style={styles.sectionHead}>
      <View style={styles.sectionIconWrap}>
        <Ionicons name={icon} size={18} color={theme.colors.primary} />
      </View>
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

export default function StaffProfileEditScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { staff, user, loadSession } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [row, setRow] = useState<Row | null>(null);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [officeLocation, setOfficeLocation] = useState('');
  const [bio, setBio] = useState('');
  const [specialties, setSpecialties] = useState('');
  const [languages, setLanguages] = useState('');
  const [achievements, setAchievements] = useState('');
  const [showPhone, setShowPhone] = useState(true);
  const [showEmail, setShowEmail] = useState(true);
  const [showWhatsapp, setShowWhatsapp] = useState(true);

  const hydrate = useCallback(
    (p: Row) => {
      setRow(p);
      setFullName(p.full_name?.trim() ?? '');
      setPhone(p.phone?.trim() ?? '');
      setEmail(p.email?.trim() ?? '');
      setWhatsapp(p.whatsapp?.trim() ?? '');
      setOfficeLocation(p.office_location?.trim() ?? '');
      setBio(p.bio?.trim() ?? '');
      setSpecialties(p.specialties?.join(', ') ?? '');
      setLanguages(p.languages?.join(', ') ?? '');
      setAchievements(p.achievements?.join(', ') ?? '');
      setShowPhone(p.show_phone_to_guest !== false);
      setShowEmail(p.show_email_to_guest !== false);
      setShowWhatsapp(p.show_whatsapp_to_guest !== false);
    },
    []
  );

  const load = useCallback(async () => {
    if (!staff?.id) return;
    setLoading(true);
    try {
      const res = await loadStaffProfileSelf(staff.id);
      if (res.data) hydrate(res.data as Row);
    } finally {
      setLoading(false);
    }
  }, [staff?.id, hydrate]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const splitList = (s: string) =>
    s
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);

  const handleSave = async () => {
    if (!staff?.id || !row) {
      Alert.alert(t('error'), t('recordError'));
      return;
    }
    const nameTrim = fullName.trim();
    if (!nameTrim) {
      Alert.alert(t('error'), t('editProfileNameRequired'));
      return;
    }

    const emailTrim = email.trim();
    const payload = {
      full_name: nameTrim,
      phone: phone.trim() || null,
      email: emailTrim || row.email || '',
      whatsapp: whatsapp.trim() || null,
      office_location: officeLocation.trim() || null,
      bio: bio.trim() || null,
      specialties: splitList(specialties),
      languages: splitList(languages),
      achievements: splitList(achievements),
      show_phone_to_guest: showPhone,
      show_email_to_guest: showEmail,
      show_whatsapp_to_guest: showWhatsapp,
      updated_at: new Date().toISOString(),
    };

    setSaving(true);
    try {
      const { error } = await supabase.from('staff').update(payload).eq('id', staff.id);
      if (error) throw error;

      if (user) {
        await supabase.auth.updateUser({ data: { full_name: nameTrim } });
        await loadSession();
      }

      Alert.alert(t('profileUpdatedToast'), '', [{ text: t('close'), onPress: () => router.back() }]);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : t('recordError');
      Alert.alert(t('error'), message);
    } finally {
      setSaving(false);
    }
  };

  if (!staff) {
    return (
      <>
        <Stack.Screen options={{ title: t('editProfileInfo'), headerBackTitle: t('back') }} />
        <View style={[styles.centered, { paddingTop: insets.top + 48 }]}>
          <Text style={styles.muted}>{t('loading')}</Text>
        </View>
      </>
    );
  }

  if (loading || !row) {
    return (
      <>
        <Stack.Screen options={{ title: t('editProfileInfo'), headerBackTitle: t('back') }} />
        <View style={[styles.centered, { paddingTop: insets.top + 80 }]}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </>
    );
  }

  const hireLabel = row.hire_date
    ? new Date(row.hire_date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })
    : t('unspecified');

  return (
    <>
      <Stack.Screen options={{ title: t('editProfileInfo'), headerBackTitle: t('back') }} />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 100 }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.intro}>{t('editProfileExtendedHint')}</Text>

          <View style={styles.card}>
            <SectionTitle icon="business-outline" title={t('profileOrgRecord')} />
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>{t('fieldDepartment')}</Text>
              <Text style={styles.readOnlyVal}>{row.department?.trim() || t('unspecified')}</Text>
            </View>
            <View style={styles.readOnlyRow}>
              <Text style={styles.readOnlyLabel}>{t('fieldPosition')}</Text>
              <Text style={styles.readOnlyVal}>{row.position?.trim() || t('unspecified')}</Text>
            </View>
            <View style={[styles.readOnlyRow, styles.readOnlyRowLast]}>
              <Text style={styles.readOnlyLabel}>{t('fieldHireDate')}</Text>
              <Text style={styles.readOnlyVal}>{hireLabel}</Text>
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle icon="person-outline" title={t('personalInfo')} />
            <FieldLabel>{t('fullName')}</FieldLabel>
            <TextInput
              style={styles.input}
              value={fullName}
              onChangeText={setFullName}
              placeholder={t('fullName')}
              placeholderTextColor={theme.colors.textMuted}
              autoCapitalize="words"
              editable={!saving}
            />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="call-outline" title={t('contactInfoSection')} />
            <FieldLabel>{t('phone')}</FieldLabel>
            <TextInput
              style={styles.input}
              value={phone}
              onChangeText={setPhone}
              placeholder="0555 123 45 67"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="phone-pad"
              editable={!saving}
            />
            <FieldLabel>{t('email')}</FieldLabel>
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
            <FieldLabel>WhatsApp</FieldLabel>
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

          <View style={styles.card}>
            <SectionTitle icon="eye-outline" title={t('visibilitySection')} />
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('showPhoneToGuest')}</Text>
              <Switch
                value={showPhone}
                onValueChange={setShowPhone}
                disabled={saving}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>
            <View style={styles.switchRow}>
              <Text style={styles.switchLabel}>{t('showEmailToGuest')}</Text>
              <Switch
                value={showEmail}
                onValueChange={setShowEmail}
                disabled={saving}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>
            <View style={[styles.switchRow, styles.switchRowLast]}>
              <Text style={styles.switchLabel}>{t('showWhatsAppToGuest')}</Text>
              <Switch
                value={showWhatsapp}
                onValueChange={setShowWhatsapp}
                disabled={saving}
                trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
              />
            </View>
          </View>

          <View style={styles.card}>
            <SectionTitle icon="location-outline" title={t('locationOffice')} />
            <TextInput
              style={styles.input}
              value={officeLocation}
              onChangeText={setOfficeLocation}
              placeholder={t('locationOffice')}
              placeholderTextColor={theme.colors.textMuted}
              editable={!saving}
            />
          </View>

          <View style={styles.card}>
            <SectionTitle icon="document-text-outline" title={t('myInfo')} />
            <FieldLabel>{t('bio')}</FieldLabel>
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              value={bio}
              onChangeText={setBio}
              placeholder={t('bio')}
              placeholderTextColor={theme.colors.textMuted}
              multiline
              textAlignVertical="top"
              editable={!saving}
            />
            <FieldLabel>
              {t('specialties')} {t('commaSeparated')}
            </FieldLabel>
            <TextInput
              style={styles.input}
              value={specialties}
              onChangeText={setSpecialties}
              placeholder={t('specialties')}
              placeholderTextColor={theme.colors.textMuted}
              editable={!saving}
            />
            <FieldLabel>{t('languagesSpoken')}</FieldLabel>
            <TextInput
              style={styles.input}
              value={languages}
              onChangeText={setLanguages}
              placeholder={t('languagesSpoken')}
              placeholderTextColor={theme.colors.textMuted}
              editable={!saving}
            />
            <FieldLabel>
              {t('achievements')} {t('commaSeparated')}
            </FieldLabel>
            <TextInput
              style={styles.input}
              value={achievements}
              onChangeText={setAchievements}
              placeholder={t('achievements')}
              placeholderTextColor={theme.colors.textMuted}
              editable={!saving}
            />
          </View>
        </ScrollView>

        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            onPress={handleSave}
            disabled={saving}
            activeOpacity={0.88}
          >
            {saving ? (
              <ActivityIndicator color={theme.colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.white} style={{ marginRight: 8 }} />
                <Text style={styles.saveBtnText}>{t('saveProfile')}</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  content: { padding: theme.spacing.lg, paddingTop: theme.spacing.md },
  intro: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  muted: { fontSize: 15, color: theme.colors.textMuted },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  sectionIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: theme.colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text },
  readOnlyRow: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  readOnlyRowLast: { borderBottomWidth: 0 },
  readOnlyLabel: { fontSize: 12, fontWeight: '700', color: theme.colors.textMuted, marginBottom: 4 },
  readOnlyVal: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    marginTop: 12,
  },
  input: {
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: theme.colors.text,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  inputMultiline: { minHeight: 100, paddingTop: 12 },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  switchRowLast: { borderBottomWidth: 0 },
  switchLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text, paddingRight: 12 },
  footer: {
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 10,
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderLight,
  },
  saveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    paddingVertical: 16,
    borderRadius: 14,
  },
  saveBtnDisabled: { opacity: 0.75 },
  saveBtnText: { fontSize: 17, fontWeight: '800', color: theme.colors.white },
});
