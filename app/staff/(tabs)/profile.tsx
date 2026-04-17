import { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Switch,
  Alert,
  Modal,
  Pressable,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '@/stores/authStore';
import { useTranslation } from 'react-i18next';
import { LANGUAGES, LANG_STORAGE_KEY, type LangCode } from '@/i18n';
import { applyRTLAndReloadIfNeeded } from '@/lib/reloadForRTL';
import { supabase } from '@/lib/supabase';
import { uriToArrayBuffer } from '@/lib/uploadMedia';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { formatDateShort } from '@/lib/date';
import { notifyAdmins } from '@/lib/notificationService';
import { ensureMediaLibraryPermission } from '@/lib/mediaLibraryPermission';
import { listBlockedUsersForStaff } from '@/lib/userBlocks';
import { SharedAppLinks } from '@/components/SharedAppLinks';
import { StaffEvaluationProfileTeaser } from '@/components/StaffEvaluationHub';
import { resolveStaffEvaluation } from '@/lib/staffEvaluation';
import { loadStaffProfileSelf } from '@/lib/loadStaffProfileForViewer';
import { canAccessReservationSales } from '@/lib/staffPermissions';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STAFF_COVER_BLOCK_HEIGHT = 228;

type StaffProfile = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  specialties: string[] | null;
  languages: string[] | null;
  is_online: boolean | null;
  total_reviews: number | null;
  average_rating: number | null;
  position: string | null;
  hire_date: string | null;
  office_location: string | null;
  achievements: string[] | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
  verification_badge?: 'blue' | 'yellow' | null;
  shift?: { start_time: string; end_time: string } | null;
  app_permissions?: Record<string, boolean> | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
};

type SalaryPaymentRow = {
  id: string;
  period_month: number;
  period_year: number;
  amount: number;
  payment_date: string;
  status: string;
  staff_approved_at: string | null;
  staff_rejected_at: string | null;
  rejection_reason: string | null;
};

const MONTH_NAMES = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
function fmtMoney(n: number): string {
  return new Intl.NumberFormat('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n) + ' ₺';
}

const LANGUAGE_FLAGS: Record<string, string> = {
  tr: '🇹🇷',
  en: '🇬🇧',
  ar: '🇸🇦',
  de: '🇩🇪',
  fr: '🇫🇷',
  ru: '🇷🇺',
  es: '🇪🇸',
};

type ActionBtn = { key: string; label: string; icon: keyof typeof Ionicons.glyphMap; route: string };

const actionButtons = (t: (k: string) => string, authStaff: { role?: string; app_permissions?: Record<string, boolean> | null } | null): ActionBtn[] => {
  const base: ActionBtn[] = [
    { key: 'gorevlerim', label: t('tasks'), icon: 'checkbox', route: '/staff/tasks' },
    { key: 'stok', label: t('stockTab'), icon: 'cube', route: '/staff/stock' },
    { key: 'stoklarim', label: t('myStocks'), icon: 'list', route: '/staff/stock/my-movements' },
    { key: 'harcamalar', label: t('expenses'), icon: 'wallet-outline', route: '/staff/expenses' },
  ];
  if (canAccessReservationSales(authStaff)) {
    base.splice(1, 0, {
      key: 'satis_komisyon',
      label: 'Satış & Komisyon',
      icon: 'cash-outline',
      route: '/staff/sales',
    });
  }
  if (authStaff?.app_permissions?.gorev_ata && authStaff.role !== 'admin') {
    base.splice(1, 0, {
      key: 'gorev_ata_panel',
      label: t('taskAssignmentPanel'),
      icon: 'clipboard',
      route: '/admin/tasks',
    });
  }
  return base;
};

export default function StaffProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { staff: authStaff, signOut } = useAuthStore();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [imageViewVisible, setImageViewVisible] = useState(false);
  const [coverImageViewVisible, setCoverImageViewVisible] = useState(false);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPaymentRow[]>([]);
  const [salaryActingId, setSalaryActingId] = useState<string | null>(null);
  const [salaryHistoryOpen, setSalaryHistoryOpen] = useState(false);
  const [blockedCount, setBlockedCount] = useState(0);
  const [languageModalVisible, setLanguageModalVisible] = useState(false);
  const [openTaskCount, setOpenTaskCount] = useState(0);
  const profileRef = useRef<StaffProfile | null>(null);

  const handleLanguageSelect = async (code: LangCode) => {
    i18n.changeLanguage(code);
    AsyncStorage.setItem(LANG_STORAGE_KEY, code);
    setLanguageModalVisible(false);
    await applyRTLAndReloadIfNeeded(code);
  };

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  useEffect(() => {
    if (!authStaff?.id) return;
    const load = async () => {
      const res = await loadStaffProfileSelf(authStaff.id);
      if (res.data) {
        const data = res.data;
        setProfile({ ...data, shift: null } as StaffProfile);
        if (data.shift_id) {
          const { data: shift } = await supabase.from('shifts').select('start_time, end_time').eq('id', data.shift_id).single();
          setProfile((p) => (p ? { ...p, shift } : null));
        }
      }
      const { data: sal } = await supabase
        .from('salary_payments')
        .select('id, period_month, period_year, amount, payment_date, status, staff_approved_at, staff_rejected_at, rejection_reason')
        .eq('staff_id', authStaff.id)
        .order('period_year', { ascending: false })
        .order('period_month', { ascending: false });
      setSalaryPayments((sal ?? []) as SalaryPaymentRow[]);
    };
    load();
  }, [authStaff?.id]);

  const pickImage = async () => {
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('galleryPermissionMessage'),
      settingsMessage: t('settingsPermissionMessage'),
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
      Alert.alert(t('error'), (e as Error)?.message ?? t('avatarUploadError'));
    } finally {
      setUploading(false);
    }
  };

  const onAvatarPress = () => {
    const uri = profile?.profile_image || undefined;
    if (uri) {
      setImageViewVisible(true);
    } else {
      pickImage();
    }
  };

  const pickCoverImage = async () => {
    if (!profile) return;
    const granted = await ensureMediaLibraryPermission({
      title: t('galleryPermission'),
      message: t('coverPermissionMessage'),
      settingsMessage: t('settingsPermissionMessage'),
    });
    if (!granted) {
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [3, 2],
        quality: 0.7,
      });
      if (result.canceled || !result.assets[0]?.uri) return;
      setUploadingCover(true);
      const arrayBuffer = await uriToArrayBuffer(result.assets[0].uri);
      const fileName = `staff/${profile.id}/cover_${Date.now()}.jpg`;
      const { error } = await supabase.storage.from('profiles').upload(fileName, arrayBuffer, {
        contentType: 'image/jpeg',
        upsert: true,
      });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('profiles').getPublicUrl(fileName);
      await supabase.from('staff').update({ cover_image: publicUrl }).eq('id', profile.id);
      setProfile((p) => (p ? { ...p, cover_image: publicUrl } : null));
    } catch (e) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('coverUploadError'));
    } finally {
      setUploadingCover(false);
    }
  };

  const updateOnline = async (value: boolean) => {
    if (!profile) return;
    const { error } = await supabase
      .from('staff')
      .update({ is_online: value, last_active: new Date().toISOString() })
      .eq('id', profile.id);
    if (error) {
      Alert.alert(t('error'), 'Durum güncellenemedi. Lütfen tekrar deneyin.');
      return;
    }
    setProfile((p) => (p ? { ...p, is_online: value } : null));
  };

  const approveSalary = async (paymentId: string) => {
    setSalaryActingId(paymentId);
    const { error } = await supabase
      .from('salary_payments')
      .update({ status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null })
      .eq('id', paymentId)
      .eq('staff_id', profile?.id);
    setSalaryActingId(null);
    if (error) {
      Alert.alert(t('error'), error.message);
      return;
    }
    setSalaryPayments((prev) =>
      prev.map((p) => (p.id === paymentId ? { ...p, status: 'approved', staff_approved_at: new Date().toISOString(), staff_rejected_at: null, rejection_reason: null } : p))
    );
    const paid = salaryPayments.find((x) => x.id === paymentId);
    if (paid) {
      notifyAdmins({
        title: 'Maaş onayı',
        body: `${profile?.full_name ?? 'Personel'} maaşını onayladı. Dönem: ${MONTH_NAMES[paid.period_month - 1]} ${paid.period_year} – ${fmtMoney(Number(paid.amount))}`,
        data: { screen: '/admin/salary' },
      }).catch(() => {});
    }
  };

  const rejectSalary = (paymentId: string) => {
    Alert.alert(
      'Reddet (İtiraz)',
      'Maaş ödemesini reddedeceksiniz. Admin bilgilendirilecek.',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Reddet',
          style: 'destructive',
          onPress: async () => {
            setSalaryActingId(paymentId);
            const { error } = await supabase
              .from('salary_payments')
              .update({ status: 'rejected', staff_rejected_at: new Date().toISOString(), staff_approved_at: null, rejection_reason: null })
              .eq('id', paymentId)
              .eq('staff_id', profile?.id);
            setSalaryActingId(null);
            if (error) {
              Alert.alert(t('error'), error.message);
              return;
            }
            setSalaryPayments((prev) =>
              prev.map((p) => (p.id === paymentId ? { ...p, status: 'rejected', staff_rejected_at: new Date().toISOString(), staff_approved_at: null, rejection_reason: null } : p))
            );
            const paid = salaryPayments.find((x) => x.id === paymentId);
            if (paid) {
              notifyAdmins({
                title: 'Maaş reddedildi',
                body: `${profile?.full_name ?? 'Personel'} maaşını reddetti. Dönem: ${MONTH_NAMES[paid.period_month - 1]} ${paid.period_year} – ${fmtMoney(Number(paid.amount))}`,
                data: { screen: '/admin/salary' },
              }).catch(() => {});
            }
          },
        },
      ]
    );
  };

  const handleSignOut = () => {
    Alert.alert(
      t('signOut'),
      t('signOutConfirm'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('signOut'),
          style: 'destructive',
          onPress: async () => {
            await signOut();
            router.replace('/');
          },
        },
      ]
    );
  };

  const reloadProfile = useCallback(async () => {
    if (!authStaff?.id) return;
    const res = await loadStaffProfileSelf(authStaff.id);
    if (res.data) {
      const data = res.data;
      setProfile({ ...data, shift: null } as StaffProfile);
      if (data.shift_id) {
        const { data: shift } = await supabase.from('shifts').select('start_time, end_time').eq('id', data.shift_id).single();
        setProfile((p) => (p ? { ...p, shift } : null));
      }
    }
  }, [authStaff?.id]);

  const refreshOpenTaskCount = useCallback(async () => {
    if (!authStaff?.id) {
      setOpenTaskCount(0);
      return;
    }
    try {
      const { count, error } = await supabase
        .from('staff_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('assigned_staff_id', authStaff.id)
        .in('status', ['pending', 'in_progress']);
      if (!error) setOpenTaskCount(count ?? 0);
    } catch {
      setOpenTaskCount(0);
    }
  }, [authStaff?.id]);

  useFocusEffect(
    useCallback(() => {
      reloadProfile();
      refreshOpenTaskCount();
      if (authStaff?.id) {
        listBlockedUsersForStaff(authStaff.id).then((rows) => setBlockedCount(rows.length));
      }
    }, [reloadProfile, refreshOpenTaskCount, authStaff?.id])
  );

  if (!profile) {
    return (
      <View style={styles.centered}><Text>{t('loading')}</Text></View>
    );
  }

  const avatarUri = profile.profile_image || 'https://via.placeholder.com/120';

  return (
    <View style={styles.container}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
      >
        <View style={[styles.coverBlock, styles.coverBlockFixed]}>
          <View style={styles.coverImageClip}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              onPress={() => {
                if (uploadingCover) return;
                if (profile.cover_image) setCoverImageViewVisible(true);
                else pickCoverImage();
              }}
              activeOpacity={1}
            >
              {profile.cover_image ? (
                <CachedImage uri={profile.cover_image} style={StyleSheet.absoluteFill} contentFit="cover" />
              ) : (
                <View style={styles.coverPlaceholder}>
                  <Ionicons name="image-outline" size={40} color={theme.colors.textMuted} />
                  <Text style={styles.coverPlaceholderText}>{t('uploadCoverPhoto')}</Text>
                </View>
              )}
            </TouchableOpacity>
            {uploadingCover && (
              <View style={styles.coverUploadOverlay}>
                <Text style={styles.uploadText}>{t('loading')}</Text>
              </View>
            )}
          </View>
          {!uploadingCover && (
            <TouchableOpacity
              style={styles.coverEditBtn}
              onPress={pickCoverImage}
              activeOpacity={0.9}
            >
              <Ionicons name="camera" size={20} color={theme.colors.white} />
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.heroOverlap}>
          <View style={styles.heroCard}>
            <TouchableOpacity onPress={onAvatarPress} disabled={uploading} activeOpacity={0.92} style={styles.heroAvatarWrap}>
              <AvatarWithBadge badge={profile.verification_badge ?? null} avatarSize={88} badgeSize={18} showBadge={false}>
                <CachedImage uri={avatarUri} style={styles.heroAvatarImg} contentFit="cover" />
              </AvatarWithBadge>
              {uploading ? (
                <View style={styles.heroAvatarOverlay}>
                  <ActivityIndicator color={theme.colors.white} size="small" />
                </View>
              ) : null}
              <TouchableOpacity style={styles.heroAvatarCam} onPress={(e) => { e.stopPropagation(); pickImage(); }} disabled={uploading}>
                <Ionicons name="camera" size={16} color={theme.colors.white} />
              </TouchableOpacity>
            </TouchableOpacity>
            <StaffNameWithBadge name={profile.full_name || '—'} badge={profile.verification_badge ?? null} badgeSize={20} textStyle={styles.heroName} center />
            {authStaff?.organization?.name ? (
              <Text style={styles.heroOrgTag} numberOfLines={1}>
                {authStaff.organization.name}
              </Text>
            ) : null}
            <Text style={styles.heroSubtitle} numberOfLines={2}>
              {[profile.position?.trim(), profile.department?.trim()].filter(Boolean).join(' · ') || t('unspecified')}
            </Text>
            <TouchableOpacity style={styles.heroEditCta} onPress={() => router.push('/staff/profile/edit')} activeOpacity={0.88}>
              <Ionicons name="create-outline" size={20} color={theme.colors.white} />
              <Text style={styles.heroEditCtaText}>{t('editProfileInfo')}</Text>
            </TouchableOpacity>
            <Text style={styles.heroEditHint}>{t('editProfileHint')}</Text>
          </View>
        </View>

        <View style={styles.body}>
          <Text style={styles.pageSectionLabel}>{t('quickAccess')}</Text>
          <View style={styles.menuCard}>
            {actionButtons(t, authStaff).map((btn, i, arr) => (
              <TouchableOpacity
                key={btn.key}
                style={[styles.menuRow, i === arr.length - 1 && styles.menuRowLast]}
                onPress={() => router.push(btn.route as never)}
                activeOpacity={0.75}
              >
                <View style={styles.menuIconCircle}>
                  <Ionicons name={btn.icon} size={22} color={theme.colors.primary} />
                </View>
                <Text style={styles.menuRowTitle}>{btn.label}</Text>
                {btn.key === 'gorevlerim' && openTaskCount > 0 ? (
                  <View style={styles.menuBadge}>
                    <Text style={styles.menuBadgeText}>{openTaskCount > 9 ? '9+' : openTaskCount}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
              </TouchableOpacity>
            ))}
          </View>

          {authStaff?.role === 'admin' ? (
            <>
              <Text style={styles.pageSectionLabel}>{t('adminShortcuts')}</Text>
              <View style={styles.menuCard}>
                {(
                  [
                    { route: '/admin/expenses/all', icon: 'list-outline' as const, label: 'Tüm Harcamalar' },
                    { route: '/admin/salary/all', icon: 'cash-outline' as const, label: 'Tüm Ödemeler' },
                    { route: '/admin/contracts/all', icon: 'document-text-outline' as const, label: 'Tüm Sözleşmeler' },
                    { route: '/admin/stock/all', icon: 'layers-outline' as const, label: 'Tüm Stoklar' },
                  ] as const
                ).map((item, i, arr) => (
                  <TouchableOpacity
                    key={item.route}
                    style={[styles.menuRow, i === arr.length - 1 && styles.menuRowLast]}
                    onPress={() => router.push(item.route as never)}
                    activeOpacity={0.75}
                  >
                    <View style={styles.menuIconCircle}>
                      <Ionicons name={item.icon} size={22} color={theme.colors.primary} />
                    </View>
                    <Text style={styles.menuRowTitle}>{item.label}</Text>
                    <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : null}

          {profile?.app_permissions?.tum_sozlesmeler && authStaff?.role !== 'admin' ? (
            <>
              <Text style={styles.pageSectionLabel}>{t('contractsShortcut')}</Text>
              <View style={styles.menuCard}>
                <TouchableOpacity style={[styles.menuRow, styles.menuRowLast]} onPress={() => router.push('/staff/contracts/all')} activeOpacity={0.75}>
                  <View style={styles.menuIconCircle}>
                    <Ionicons name="document-text-outline" size={22} color={theme.colors.primary} />
                  </View>
                  <Text style={styles.menuRowTitle}>{t('contractsShortcut')}</Text>
                  <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                </TouchableOpacity>
              </View>
            </>
          ) : null}

          <Text style={styles.pageSectionLabel}>{t('jobInfo')}</Text>
          <View style={styles.jobInfoCard}>
            <View style={styles.jobInfoRow}>
              <Text style={styles.jobInfoItem}>📌 {profile.department?.trim() || t('unspecified')}</Text>
              <Text style={styles.jobInfoItem}>📅 {profile.hire_date ? new Date(profile.hire_date).toLocaleDateString('tr-TR') : t('unspecified')}</Text>
            </View>
            <View style={[styles.jobInfoRow, styles.jobInfoRowLast]}>
              <Text style={styles.jobInfoItem}>📍 {profile.office_location?.trim() || t('unspecified')}</Text>
              <View style={styles.jobInfoStatus}>
                <View style={[styles.onlineDot, profile.is_online && styles.onlineDotOn]} />
                <Text style={styles.onlineLabel}>{profile.is_online ? t('online') : t('offlineStatus')}</Text>
                <Switch
                  value={profile.is_online ?? false}
                  onValueChange={updateOnline}
                  trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
                  thumbColor={theme.colors.surface}
                />
              </View>
            </View>
          </View>

          <View style={styles.evaluationTeaserWrap}>
            <StaffEvaluationProfileTeaser
              resolved={resolveStaffEvaluation({
                id: profile.id,
                evaluation_score: profile.evaluation_score,
                evaluation_discipline: profile.evaluation_discipline,
                evaluation_communication: profile.evaluation_communication,
                evaluation_speed: profile.evaluation_speed,
                evaluation_responsibility: profile.evaluation_responsibility,
                evaluation_insight: profile.evaluation_insight,
                average_rating: profile.average_rating,
              })}
              averageRating={profile.average_rating}
              totalReviews={profile.total_reviews}
              onPress={() => router.push('/staff/evaluation')}
            />
          </View>

          <Text style={styles.pageSectionLabel}>{t('salaryInfo')}</Text>
          <View style={styles.card}>
            {salaryPayments.length === 0 ? (
              <Text style={styles.salaryMuted}>{t('noSalaryRecords')}</Text>
            ) : (
              <>
                <View style={styles.salaryRow}>
                  <Text style={styles.label}>{t('lastPaidSalary')}</Text>
                  <Text style={styles.salaryAmount}>{fmtMoney(Number(salaryPayments[0].amount))}</Text>
                </View>
                <Text style={styles.salaryDetail}>{t('paymentDate')}: {formatDateShort(salaryPayments[0].payment_date)}</Text>
                <Text style={styles.salaryDetail}>
                  {t('status')}: {salaryPayments[0].status === 'approved' ? `✅ ${t('approved')} (${salaryPayments[0].staff_approved_at ? formatDateShort(salaryPayments[0].staff_approved_at) : '—'})` : salaryPayments[0].status === 'rejected' ? `❌ ${t('rejected')}` : `⏳ ${t('pendingApproval')}`}
                </Text>
                <TouchableOpacity style={styles.salaryHistoryToggle} onPress={() => setSalaryHistoryOpen((v) => !v)}>
                  <Text style={styles.salaryHistoryToggleText}>📜 {t('salaryHistory')}</Text>
                  <Ionicons name={salaryHistoryOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.primary} />
                </TouchableOpacity>
                {salaryHistoryOpen && (
                  <View style={styles.salaryHistoryList}>
                    {salaryPayments.slice(0, 12).map((p) => (
                      <View key={p.id} style={styles.salaryHistoryItem}>
                        <Text style={styles.salaryHistoryText}>{MONTH_NAMES[p.period_month - 1]} {p.period_year}: {fmtMoney(Number(p.amount))} – {formatDateShort(p.payment_date)} {p.status === 'approved' ? '✅' : p.status === 'rejected' ? '❌' : '⏳'}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
          {salaryPayments.some((p) => p.status === 'pending_approval') && (
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>⏳ {t('pendingSalaryNotice')}</Text>
              {salaryPayments
                .filter((p) => p.status === 'pending_approval')
                .map((p) => (
                  <View key={p.id} style={styles.pendingSalaryBlock}>
                    <Text style={styles.pendingSalaryText}>🔔 {t('salaryDeposited')}: {fmtMoney(Number(p.amount))} ({formatDateShort(p.payment_date)})</Text>
                    <Text style={styles.pendingSalaryHint}>{t('pleaseReview')}</Text>
                    <View style={styles.pendingSalaryActions}>
                      <TouchableOpacity
                        style={[styles.pendingSalaryBtn, styles.pendingSalaryBtnApprove]}
                        onPress={() => approveSalary(p.id)}
                        disabled={salaryActingId === p.id}
                      >
                        {salaryActingId === p.id ? (
                          <ActivityIndicator size="small" color="#fff" />
                        ) : (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Ionicons name="checkmark" size={18} color="#fff" />
                            <Text style={styles.pendingSalaryBtnText}>{t('approve')}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.pendingSalaryBtn, styles.pendingSalaryBtnReject]}
                        onPress={() => rejectSalary(p.id)}
                        disabled={salaryActingId === p.id}
                      >
                        <Ionicons name="close" size={18} color="#fff" />
                        <Text style={styles.pendingSalaryBtnText}>{t('rejectAppeal')}</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
            </View>
          )}

          <Text style={styles.pageSectionLabel}>{t('account')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => setLanguageModalVisible(true)}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="language-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('language')}</Text>
                <Text style={styles.menuDetailSub}>
                  {LANGUAGES.find((l) => l.code === (i18n.language || '').split('-')[0])?.label ?? t('selectLanguage')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.menuRow}
              onPress={() => router.push('/staff/profile/notifications')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="notifications-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('notificationPrefsShort')}</Text>
                <Text style={styles.menuDetailSub}>{t('notificationsSection')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/staff/profile/blocked-users')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="ban-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('blockedUsersTitle')}</Text>
                <Text style={styles.menuDetailSub}>
                  {blockedCount > 0 ? t('blockedUsersBadge', { count: blockedCount }) : t('openBlockedList')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <SharedAppLinks compact />

          {profile.shift && (
            <View style={styles.shiftBox}>
              <Text style={styles.label}>{t('workHours')}</Text>
              <Text style={styles.shiftText}>{profile.shift.start_time} – {profile.shift.end_time}</Text>
            </View>
          )}

          <Text style={styles.pageSectionLabel}>{t('permissionsLegal')}</Text>
          <View style={styles.menuCard}>
            <TouchableOpacity
              style={[styles.menuRow, styles.menuRowLast]}
              onPress={() => router.push('/permissions')}
              activeOpacity={0.75}
            >
              <View style={styles.menuIconCircle}>
                <Ionicons name="shield-checkmark-outline" size={22} color={theme.colors.primary} />
              </View>
              <View style={styles.menuRowTextCol}>
                <Text style={styles.menuDetailTitle}>{t('permissionsLegal')}</Text>
                <Text style={styles.menuDetailSub} numberOfLines={2}>
                  {t('appPermissionsHint')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={styles.pageSectionLabel}>{t('accountManagement')}</Text>
          <TouchableOpacity
            style={[styles.card, styles.signOutButton]}
            onPress={handleSignOut}
            activeOpacity={0.8}
          >
            <Text style={styles.signOutButtonText}>{t('signOut')}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.card, styles.deleteAccountRow]}
            onPress={() => router.push('/staff/delete-account')}
            activeOpacity={0.8}
          >
            <Text style={styles.deleteAccountText}>{t('deleteMyAccount')}</Text>
            <Text style={styles.mutedRow}>→</Text>
          </TouchableOpacity>

        </View>
      </ScrollView>

      {/* Tam ekran profil resmi – boşluğa tıklayınca kapanır */}
      <Modal
        visible={imageViewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setImageViewVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setImageViewVisible(false)}>
          <Pressable style={styles.imageModalContent} onPress={() => {}}>
            <CachedImage uri={avatarUri} style={styles.imageModalImage} contentFit="contain" />
          </Pressable>
        </Pressable>
      </Modal>

      {/* Tam ekran kapak resmi */}
      <Modal
        visible={coverImageViewVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setCoverImageViewVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setCoverImageViewVisible(false)}>
          <Pressable style={styles.imageModalContent} onPress={() => {}}>
            {profile.cover_image ? (
              <CachedImage uri={profile.cover_image} style={styles.imageModalImage} contentFit="contain" />
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Dil seçimi */}
      <Modal visible={languageModalVisible} transparent animationType="fade" onRequestClose={() => setLanguageModalVisible(false)}>
        <Pressable style={styles.langModalOverlay} onPress={() => setLanguageModalVisible(false)}>
          <Pressable
            style={[
              styles.langModalContent,
              {
                paddingTop: insets.top + 24,
                paddingBottom: insets.bottom + 24,
                maxHeight: SCREEN_HEIGHT * 0.82,
              },
            ]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={styles.langModalHeader}>
              <View style={styles.langModalIconWrap}>
                <Ionicons name="globe-outline" size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.langModalTitle}>{t('selectLanguage')}</Text>
              <Text style={styles.langModalSubtitle}>{t('selectAppLanguage')}</Text>
            </View>
            <ScrollView
              style={styles.langScrollView}
              contentContainerStyle={styles.langScrollContent}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {LANGUAGES.map(({ code, label }) => {
                const isActive = (i18n.language || '').split('-')[0] === code;
                const flag = LANGUAGE_FLAGS[code] ?? '🌐';
                return (
                  <TouchableOpacity
                    key={code}
                    style={[styles.langOptionCard, isActive && styles.langOptionCardActive]}
                    onPress={() => handleLanguageSelect(code)}
                    activeOpacity={0.85}
                  >
                    <View style={[styles.langOptionLeft, isActive && styles.langOptionLeftActive]}>
                      <Text style={styles.langOptionFlag}>{flag}</Text>
                      <Text style={[styles.langOptionLabel, isActive && styles.langOptionLabelActive]}>{label}</Text>
                    </View>
                    {isActive ? (
                      <View style={styles.langOptionCheckWrap}>
                        <Ionicons name="checkmark-circle" size={26} color={theme.colors.white} />
                      </View>
                    ) : (
                      <View style={styles.langOptionChevron}>
                        <Ionicons name="chevron-forward" size={20} color={theme.colors.textMuted} />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.langCloseBtn} onPress={() => setLanguageModalVisible(false)} activeOpacity={0.85}>
              <Text style={styles.langCloseText}>{t('close')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  coverBlock: {
    width: SCREEN_WIDTH,
    position: 'relative',
    overflow: 'visible',
    alignSelf: 'stretch',
  },
  coverBlockFixed: {
    height: STAFF_COVER_BLOCK_HEIGHT,
  },
  coverImageClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: STAFF_COVER_BLOCK_HEIGHT,
    overflow: 'hidden',
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  coverPlaceholderText: { color: theme.colors.textMuted, fontSize: 14 },
  coverUploadOverlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverEditBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 20,
  },
  heroOverlap: {
    marginTop: -18,
    marginBottom: 6,
    paddingHorizontal: theme.spacing.lg,
    zIndex: 5,
  },
  heroCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingTop: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.md,
  },
  heroAvatarWrap: { position: 'relative', marginTop: -32, marginBottom: 12 },
  heroAvatarImg: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.borderLight,
  },
  heroAvatarOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 44,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  heroAvatarCam: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  heroName: { ...theme.typography.titleSmall, color: theme.colors.text, textAlign: 'center' },
  heroOrgTag: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.primary,
    textAlign: 'center',
    marginTop: 6,
  },
  heroSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 20,
    paddingHorizontal: 8,
  },
  heroEditCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
  },
  heroEditCtaText: { fontSize: 16, fontWeight: '800', color: theme.colors.white },
  heroEditHint: {
    fontSize: 12,
    color: theme.colors.textMuted,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 16,
    paddingHorizontal: 8,
  },
  pageSectionLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: theme.colors.textMuted,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: theme.spacing.xl,
    marginBottom: 10,
  },
  menuCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  menuRowLast: { borderBottomWidth: 0 },
  menuIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '16',
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuRowTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, flex: 1 },
  menuRowTextCol: { flex: 1, minWidth: 0 },
  menuDetailTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  menuDetailSub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  menuBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 6,
    backgroundColor: theme.colors.error,
    justifyContent: 'center',
    alignItems: 'center',
  },
  menuBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  body: { padding: theme.spacing.lg, paddingTop: theme.spacing.sm },
  name: { ...theme.typography.title, color: theme.colors.text, textAlign: 'center' },
  dept: { fontSize: 15, color: theme.colors.textSecondary, marginTop: 4, textAlign: 'center' },
  position: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2, textAlign: 'center' },
  onlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    paddingVertical: 14,
    paddingHorizontal: theme.spacing.lg,
    marginTop: theme.spacing.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  onlineLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  onlineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: theme.colors.textMuted },
  onlineDotOn: { backgroundColor: theme.colors.success },
  onlineLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  jobInfoCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  evaluationTeaserWrap: {
    marginTop: theme.spacing.lg,
  },
  jobInfoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
  },
  jobInfoRowLast: { marginBottom: 0 },
  jobInfoItem: { fontSize: 14, color: theme.colors.text, flex: 1, minWidth: 0 },
  jobInfoStatus: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sectionTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    marginTop: theme.spacing.lg,
  },
  actionsSection: { marginTop: theme.spacing.sm },
  actionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  actionCard: {
    width: (SCREEN_WIDTH - theme.spacing.lg * 2 - 12) / 2,
    position: 'relative',
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    paddingVertical: 20,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
    shadowOpacity: 0.06,
    elevation: 2,
  },
  actionTaskBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: theme.colors.error,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    zIndex: 2,
  },
  actionTaskBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  actionIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  actionLabel: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  infoSection: { marginTop: 4 },
  label: { fontSize: 14, fontWeight: '600', color: theme.colors.text, marginTop: 12, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: 14,
    backgroundColor: theme.colors.surface,
    color: theme.colors.text,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  switchRowLast: { marginBottom: 0 },
  sectionTitleWrap: { marginTop: theme.spacing.lg },
  editProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  editProfileIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: theme.colors.primary + '18',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  editProfileTextWrap: { flex: 1, marginRight: 8 },
  editProfileLabel: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  editProfileHint: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  editProfileChevron: {},
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    marginTop: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  linkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  linkRowText: { fontSize: 15, color: theme.colors.text, flex: 1 },
  signOutButton: {
    marginBottom: 12,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    borderColor: theme.colors.error,
    backgroundColor: 'transparent',
    alignItems: 'center',
  },
  signOutButtonText: { fontSize: 16, fontWeight: '600', color: theme.colors.error },
  deleteAccountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  deleteAccountText: { fontSize: 15, color: theme.colors.error, fontWeight: '600' },
  mutedRow: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 8 },
  switchLabel: { fontSize: 14, color: theme.colors.text, flex: 1 },
  shiftBox: {
    marginTop: theme.spacing.md,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  shiftText: { fontSize: 14, color: theme.colors.text },
  reviewsSection: { marginTop: theme.spacing.xl },
  reviewCard: { paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 14, color: theme.colors.text },
  stats: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.spacing.xl,
    padding: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    ...theme.shadows.sm,
  },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  statLabel: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  langModalContent: {
    width: Math.min(SCREEN_WIDTH - 32, 400),
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 24,
    paddingHorizontal: 24,
    marginHorizontal: 16,
    ...theme.shadows.md,
    shadowRadius: 16,
    elevation: 8,
  },
  langModalHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  langModalIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.primaryLight + '28',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  langModalTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: theme.colors.text,
    marginBottom: 6,
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  langModalSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  langScrollView: { maxHeight: 340 },
  langScrollContent: { paddingBottom: 8 },
  langOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 18,
    paddingHorizontal: 20,
    borderRadius: 16,
    marginBottom: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderWidth: 2,
    borderColor: 'transparent',
    ...theme.shadows.sm,
  },
  langOptionCardActive: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primaryDark,
    ...theme.shadows.md,
  },
  langOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  langOptionLeftActive: {},
  langOptionFlag: {
    fontSize: 28,
  },
  langOptionLabel: {
    fontSize: 17,
    fontWeight: '600',
    color: theme.colors.text,
  },
  langOptionLabelActive: {
    color: theme.colors.white,
    fontWeight: '700',
  },
  langOptionCheckWrap: {},
  langOptionChevron: { opacity: 0.7 },
  langCloseBtn: {
    marginTop: 20,
    paddingVertical: 16,
    borderRadius: 14,
    backgroundColor: theme.colors.backgroundSecondary,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  langCloseText: {
    fontSize: 16,
    color: theme.colors.primary,
    fontWeight: '700',
  },
  imageModalContent: {
    width: SCREEN_WIDTH,
    maxHeight: '80%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_WIDTH,
    borderRadius: 0,
  },
  salaryMuted: { fontSize: 14, color: theme.colors.textMuted },
  salaryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  salaryAmount: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  salaryDetail: { fontSize: 13, color: theme.colors.textSecondary, marginBottom: 4 },
  salaryHistoryToggle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  salaryHistoryToggleText: { fontSize: 14, fontWeight: '600', color: theme.colors.primary },
  salaryHistoryList: { marginTop: 8, gap: 6 },
  salaryHistoryItem: { paddingVertical: 4 },
  salaryHistoryText: { fontSize: 13, color: theme.colors.textSecondary },
  pendingSalaryBlock: { marginTop: 8, padding: 12, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md },
  pendingSalaryText: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  pendingSalaryHint: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  pendingSalaryActions: { flexDirection: 'row', gap: 12, marginTop: 12 },
  pendingSalaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderRadius: theme.radius.md },
  pendingSalaryBtnApprove: { backgroundColor: theme.colors.success },
  pendingSalaryBtnReject: { backgroundColor: theme.colors.error },
  pendingSalaryBtnText: { fontSize: 14, fontWeight: '600', color: theme.colors.white },
  blockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  blockedRowText: { flex: 1, minWidth: 0, paddingRight: 12 },
  blockedName: { fontSize: 14, fontWeight: '600', color: theme.colors.text },
  blockedSub: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  unblockBtn: {
    backgroundColor: theme.colors.error + '18',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  unblockBtnText: { color: theme.colors.error, fontWeight: '700', fontSize: 13 },
});
