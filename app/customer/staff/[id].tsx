import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Linking,
  ActivityIndicator,
  Dimensions,
  Modal,
  Pressable,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCaller, getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestGetOrCreateConversationWithStaff } from '@/lib/messagingApi';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { AvatarWithBadge, StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { blockUserForGuest, getHiddenUsersForGuest } from '@/lib/userBlocks';
import type { HubReview } from '@/components/StaffEvaluationHub';
import { StaffEvaluationHub, StaffReviewsFullModal } from '@/components/StaffEvaluationHub';
import { resolveStaffEvaluation } from '@/lib/staffEvaluation';
import { STAFF_SOCIAL_KEYS, staffSocialOpenUrl, type StaffSocialKey } from '@/lib/staffSocialLinks';

const COVER_HEIGHT = 260;
const AVATAR_SIZE = 116;
const HEADER_AVATAR_SIZE = 64;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type StaffDetail = {
  id: string;
  full_name: string | null;
  department: string | null;
  position: string | null;
  profile_image: string | null;
  cover_image: string | null;
  bio: string | null;
  is_online: boolean | null;
  hire_date: string | null;
  average_rating: number | null;
  total_reviews: number | null;
  specialties: string[] | null;
  languages: string[] | null;
  office_location: string | null;
  achievements: string[] | null;
  show_phone_to_guest: boolean | null;
  show_email_to_guest: boolean | null;
  show_whatsapp_to_guest: boolean | null;
  phone: string | null;
  email: string | null;
  whatsapp: string | null;
  shift?: { start_time: string; end_time: string } | null;
  role?: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  evaluation_score?: number | null;
  evaluation_discipline?: number | null;
  evaluation_communication?: number | null;
  evaluation_speed?: number | null;
  evaluation_responsibility?: number | null;
  evaluation_insight?: string | null;
  social_links?: Record<string, string> | null;
};

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  stay_room_label?: string | null;
  stay_nights_label?: string | null;
  guest?: { full_name: string | null; room_number?: string | null; photo_url?: string | null } | null;
};

const CUSTOMER_REVIEW_LIMIT = 50;

export default function StaffProfileScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = typeof params.id === 'string' ? params.id : Array.isArray(params.id) ? params.id[0] : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const { appToken, setAppToken } = useGuestMessagingStore();
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [startingChat, setStartingChat] = useState(false);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [rateModalVisible, setRateModalVisible] = useState(false);
  const [reviewsModalVisible, setReviewsModalVisible] = useState(false);
  const [rateStars, setRateStars] = useState(0);
  const [rateComment, setRateComment] = useState('');
  const [rateStayRoom, setRateStayRoom] = useState('');
  const [rateStayNights, setRateStayNights] = useState('');
  const [submittingReview, setSubmittingReview] = useState(false);
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  const loadStaff = useCallback(async () => {
    if (!id) return;
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (guestRow?.guest_id) {
        const hidden = await getHiddenUsersForGuest(guestRow.guest_id);
        if (hidden.hiddenStaffIds.has(id)) {
          setStaff(null);
          setLoading(false);
          return;
        }
      }
      // RPC kullan: profil ziyaretlerinde telefon/e-posta kesin gelsin (migration 042)
      const { data: rows, error: e } = await supabase.rpc('get_staff_public_profile', {
        p_staff_id: id,
      });
      const s = Array.isArray(rows) ? rows[0] : rows;
      if (e || !s) {
        setStaff(null);
        setLoading(false);
        return;
      }
      const raw = s as StaffDetail & {
        profile_contact?: {
          phone?: string | null;
          email?: string | null;
          whatsapp?: string | null;
          show_phone_to_guest?: boolean | null;
          show_email_to_guest?: boolean | null;
          show_whatsapp_to_guest?: boolean | null;
        };
      };
      const c = raw.profile_contact;
      const rawSocial = (raw as { social_links?: Record<string, string> | null }).social_links;
      const staffData: StaffDetail = {
        ...raw,
        shift: undefined,
        phone: c?.phone ?? raw.phone,
        email: c?.email ?? raw.email,
        whatsapp: c?.whatsapp ?? raw.whatsapp,
        show_phone_to_guest: c?.show_phone_to_guest ?? raw.show_phone_to_guest,
        show_email_to_guest: c?.show_email_to_guest ?? raw.show_email_to_guest,
        show_whatsapp_to_guest: c?.show_whatsapp_to_guest ?? raw.show_whatsapp_to_guest,
        social_links: rawSocial && typeof rawSocial === 'object' ? rawSocial : null,
      };
      setStaff(staffData);
      if (s.shift_id) {
        const { data: shift } = await supabase
          .from('shifts')
          .select('start_time, end_time')
          .eq('id', s.shift_id)
          .single();
        setStaff((prev) => (prev ? { ...prev, shift: shift ?? null } : null));
      }
      const { data: r } = await supabase
        .from('staff_reviews')
        .select('id, rating, comment, created_at, guest_id, stay_room_label, stay_nights_label')
        .eq('staff_id', id)
        .order('created_at', { ascending: false })
        .limit(CUSTOMER_REVIEW_LIMIT);
      const reviewRows = (r ?? []) as (Review & { guest_id?: string })[];
      if (reviewRows.some((x) => x.guest_id)) {
        const guestIds = [...new Set(reviewRows.map((x) => x.guest_id).filter(Boolean))] as string[];
        const { data: guests } = await supabase
          .from('guests')
          .select('id, full_name, room_id, photo_url')
          .in('id', guestIds);
        const guestList = (guests ?? []) as { id: string; full_name: string | null; room_id: string | null; photo_url: string | null }[];
        const roomIds = [...new Set(guestList.map((g) => g.room_id).filter(Boolean))] as string[];
        let roomMap = new Map<string, string>();
        if (roomIds.length > 0) {
          const { data: rooms } = await supabase
            .from('rooms')
            .select('id, room_number')
            .in('id', roomIds);
          roomMap = new Map((rooms ?? []).map((ro: { id: string; room_number: string }) => [ro.id, ro.room_number]));
        }
        const guestMap = new Map(
          guestList.map((g) => [
            g.id,
            {
              full_name: g.full_name,
              room_number: g.room_id ? roomMap.get(g.room_id) ?? null : null,
              photo_url: g.photo_url,
            },
          ])
        );
        setReviews(
          reviewRows.map((x) => ({
            id: x.id,
            rating: x.rating,
            comment: x.comment,
            created_at: x.created_at,
            stay_room_label: x.stay_room_label,
            stay_nights_label: x.stay_nights_label,
            guest: x.guest_id ? guestMap.get(x.guest_id) ?? null : null,
          }))
        );
      } else {
        setReviews(
          reviewRows.map(({ guest_id: _, ...rest }) => ({
            ...rest,
            stay_room_label: rest.stay_room_label,
            stay_nights_label: rest.stay_nights_label,
          }))
        );
      }
      // Oturum misafir kaydı (Apple/Google e-postası guests’ta farklı olabilir — RPC tek kaynak)
      const { data: sessionData } = await supabase.auth.getSession();
      const guestFromAuth = await getOrCreateGuestForCaller(sessionData?.session?.user ?? null);
      let viewerGuestId: string | null = guestFromAuth?.guest_id ?? null;
      if (!viewerGuestId) {
        const email = (user?.email ?? user?.user_metadata?.email ?? '').toString().trim();
        if (email) {
          const { data: guest } = await supabase.from('guests').select('id').eq('email', email).limit(1).maybeSingle();
          viewerGuestId = guest?.id ?? null;
        }
      }
      if (viewerGuestId) {
        const { data: existing } = await supabase
          .from('staff_reviews')
          .select('id, rating, comment, created_at, stay_room_label, stay_nights_label')
          .eq('staff_id', id)
          .eq('guest_id', viewerGuestId)
          .limit(1)
          .maybeSingle();
        if (existing) {
          setMyReview({
            id: existing.id,
            rating: existing.rating,
            comment: existing.comment,
            created_at: existing.created_at,
            stay_room_label: existing.stay_room_label,
            stay_nights_label: existing.stay_nights_label,
            guest: null,
          });
        } else {
          setMyReview(null);
        }
      } else {
        setMyReview(null);
      }
      setLoading(false);
  }, [id, user?.id, user?.email, user?.user_metadata?.email]);

  useEffect(() => {
    loadStaff();
  }, [loadStaff]);

  const onMessage = async () => {
    if (!id) return;
    let token = appToken;
    if (!token) {
      await supabase.auth.refreshSession();
      const { data: { session } } = await supabase.auth.getSession();
      const row = await getOrCreateGuestForCaller(session?.user);
      if (row?.app_token) {
        await setAppToken(row.app_token);
        token = row.app_token;
      }
    }
    if (!token) {
      router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
      return;
    }
    setStartingChat(true);
    try {
      const convId = await guestGetOrCreateConversationWithStaff(token, id);
      if (convId) router.push({ pathname: '/customer/chat/[id]', params: { id: convId } });
      else router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
    } catch {
      router.push({ pathname: '/customer/new-chat', params: { staffId: id } });
    }
    setStartingChat(false);
  };

  const openRateModal = () => {
    if (myReview) return;
    setRateStars(0);
    setRateComment('');
    setRateStayRoom('');
    setRateStayNights('');
    setRateModalVisible(true);
  };

  const submitReview = async () => {
    if (!id || rateStars < 1 || rateStars > 5) return;
    setSubmittingReview(true);
    try {
      await supabase.auth.refreshSession();
      const guestRow = await getOrCreateGuestForCurrentSession();
      if (!guestRow?.guest_id) {
        Alert.alert(
          t('error'),
          t('reviewLoginRequired')
        );
        setSubmittingReview(false);
        return;
      }
      const guestId = guestRow.guest_id;
      const roomTrim = rateStayRoom.trim();
      const nightsTrim = rateStayNights.trim();
      const basePayload = {
        staff_id: id,
        guest_id: guestId,
        rating: rateStars,
        comment: rateComment.trim() || null,
      };
      const fullPayload = {
        ...basePayload,
        stay_room_label: roomTrim || null,
        stay_nights_label: nightsTrim || null,
      };
      let { error } = await supabase.from('staff_reviews').insert(fullPayload);
      const msg = String(error?.message ?? '');
      if (
        error &&
        (msg.includes('stay_room_label') ||
          msg.includes('stay_nights_label') ||
          msg.includes('schema cache') ||
          error.code === 'PGRST204')
      ) {
        ({ error } = await supabase.from('staff_reviews').insert(basePayload));
      }
      if (error) {
        if (error.code === '23505') {
          setRateModalVisible(false);
          await loadStaff();
          Alert.alert(t('error'), t('reviewAlreadySubmitted'));
          setSubmittingReview(false);
          return;
        }
        throw error;
      }
      setRateModalVisible(false);
      await loadStaff();
    } catch (e) {
      const msg = e && typeof e === 'object' && 'message' in e ? String((e as Error).message) : String(e);
      Alert.alert(t('error'), msg || t('reviewSubmitFailed'));
    }
    setSubmittingReview(false);
  };

  const onCall = () => {
    const phone = staff?.phone?.trim();
    if (phone) Linking.openURL(`tel:${phone}`);
  };

  const handleBlockFromProfile = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || !id) {
      Alert.alert('Giriş gerekli', 'Kullanıcı engellemek için giriş yapın.');
      return;
    }
    Alert.alert('Kullanıcıyı engelle', 'Bu personel artık sizi göremez ve siz de onu göremezsiniz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForGuest({
            blockerGuestId: guestRow.guest_id,
            blockedType: 'staff',
            blockedId: id,
          });
          if (error && error.code !== '23505') {
            Alert.alert('Hata', error.message || 'Kullanıcı engellenemedi.');
            return;
          }
          setProfileMenuVisible(false);
          router.back();
        },
      },
    ]);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }
  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>Personel bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const hasPhone = !!staff.phone?.trim();
  const hasEmail = !!staff.email?.trim();
  const hasWhatsApp = !!staff.whatsapp?.trim();
  const showPhone = (staff.show_phone_to_guest !== false) && hasPhone;
  const showEmail = (staff.show_email_to_guest !== false) && hasEmail;
  const showWhatsApp = (staff.show_whatsapp_to_guest !== false) && hasWhatsApp;

  return (
    <View style={styles.container}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
      <Modal
        visible={profileMenuVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setProfileMenuVisible(false)}
      >
        <Pressable style={styles.imageModalOverlay} onPress={() => setProfileMenuVisible(false)}>
          <View style={styles.profileMenuBox}>
            <TouchableOpacity style={styles.profileMenuItem} onPress={handleBlockFromProfile} activeOpacity={0.7}>
              <Ionicons name="ban-outline" size={20} color={theme.colors.error} />
              <Text style={styles.profileMenuItemText}>Engelle</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <View style={styles.coverBlock}>
        <TouchableOpacity
          style={[styles.coverActionBtn, styles.coverBackBtn, { top: insets.top + 8 }]}
          onPress={() => router.back()}
          activeOpacity={0.7}
        >
          <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.coverActionBtn, styles.coverMenuBtn, { top: insets.top + 8 }]}
          onPress={() => setProfileMenuVisible(true)}
          activeOpacity={0.7}
        >
          <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.white} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.coverImageClip}
          activeOpacity={1}
          onPress={() => staff.cover_image && setCoverModalVisible(true)}
        >
          {staff.cover_image ? (
            <CachedImage uri={staff.cover_image} style={StyleSheet.absoluteFill} contentFit="cover" />
          ) : (
            <View style={styles.coverPlaceholder} />
          )}
        </TouchableOpacity>
      </View>
      <View style={styles.profileHeaderRow}>
        <TouchableOpacity activeOpacity={1} onPress={() => staff.profile_image && setAvatarModalVisible(true)}>
          <AvatarWithBadge badge={staff.verification_badge ?? null} avatarSize={HEADER_AVATAR_SIZE} badgeSize={18} showBadge={false}>
            {staff.profile_image ? (
              <CachedImage uri={staff.profile_image} style={[styles.avatar, styles.avatarSmall]} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, styles.avatarSmall]}>
                <Text style={styles.avatarLetterSmall}>{(staff.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </AvatarWithBadge>
        </TouchableOpacity>
        <View style={styles.header}>
          <StaffNameWithBadge name={staff.full_name || 'Personel'} badge={staff.verification_badge ?? null} badgeSize={18} textStyle={styles.name} center />
          <Text style={styles.dept}>{staff.position || staff.department || '—'}</Text>
          <View style={styles.onlineRow}>
            <View style={[styles.dot, staff.is_online ? styles.dotOn : styles.dotOff]} />
            <Text style={styles.onlineText}>{staff.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}</Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>📋 Temel bilgiler</Text>
        <View style={styles.card}>
          {staff.hire_date && (
            <Row
              label="İşe başlama"
              value={new Date(staff.hire_date).toLocaleDateString('tr-TR')}
            />
          )}
          {staff.shift && (
            <Row
              label="Çalışma saatleri"
              value={`${staff.shift.start_time} - ${staff.shift.end_time}`}
            />
          )}
          {staff.office_location && (
            <Row label="Konum" value={staff.office_location} />
          )}
          {staff.is_online != null && (
            <Row
              label="Durum"
              value={staff.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
            />
          )}
        </View>
      </View>

      <View style={styles.section}>
        <StaffEvaluationHub
          resolved={resolveStaffEvaluation({
            id: staff.id,
            evaluation_score: staff.evaluation_score,
            evaluation_discipline: staff.evaluation_discipline,
            evaluation_communication: staff.evaluation_communication,
            evaluation_speed: staff.evaluation_speed,
            evaluation_responsibility: staff.evaluation_responsibility,
            evaluation_insight: staff.evaluation_insight,
            average_rating: staff.average_rating,
          })}
          averageRating={staff.average_rating}
          totalReviews={staff.total_reviews}
          reviews={reviews as HubReview[]}
          previewLimit={3}
          onOpenAllReviews={() => setReviewsModalVisible(true)}
          formatReviewDate={formatReviewDate}
          headerActions={
            myReview ? (
              <View style={styles.evaluateDoneBanner}>
                <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                <Text style={styles.evaluateDoneText}>{t('evaluateStaffDone')}</Text>
              </View>
            ) : (
              <TouchableOpacity style={styles.evaluatePrimaryBtn} onPress={openRateModal} activeOpacity={0.88}>
                <Ionicons name="star" size={22} color={theme.colors.white} />
                <Text style={styles.evaluatePrimaryBtnText}>{t('evaluateStaffButton')}</Text>
              </TouchableOpacity>
            )
          }
        />
      </View>

      {staff.specialties?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🔧 Uzmanlıklar</Text>
          <View style={styles.card}>
            {staff.specialties.map((s, i) => (
              <Text key={i} style={styles.bullet}>• {s}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {staff.languages?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🗣️ Konuşulan diller</Text>
          <View style={styles.card}>
            {staff.languages.map((l, i) => (
              <Text key={i} style={styles.bullet}>• {l}</Text>
            ))}
          </View>
        </View>
      ) : null}

      {staff.bio ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📝 Hakkımda</Text>
          <View style={styles.card}>
            <Text style={styles.bio}>{staff.bio}</Text>
          </View>
        </View>
      ) : null}

      {staff.achievements?.length ? (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>🏆 Başarılar</Text>
          <View style={styles.card}>
            {staff.achievements.map((a, i) => (
              <Text key={i} style={styles.bullet}>• {a}</Text>
            ))}
          </View>
        </View>
      ) : null}

      <View style={styles.avatarActionsRow}>
        {showPhone && (
          <TouchableOpacity
            onPress={onCall}
            style={[styles.avatarActionCircle, styles.avatarActionPhone]}
            activeOpacity={0.8}
          >
            <Ionicons name="call" size={20} color={theme.colors.white} />
          </TouchableOpacity>
        )}
        {showWhatsApp && (
          <TouchableOpacity
            onPress={() =>
              Linking.openURL(`https://wa.me/${staff.whatsapp!.trim().replace(/\D/g, '')}`)
            }
            style={[styles.avatarActionCircle, styles.avatarActionWhatsApp]}
            activeOpacity={0.8}
          >
            <Ionicons name="logo-whatsapp" size={20} color={theme.colors.white} />
          </TouchableOpacity>
        )}
        {showEmail && (
          <TouchableOpacity
            onPress={() => Linking.openURL(`mailto:${staff.email!.trim()}`)}
            style={[styles.avatarActionCircle, styles.avatarActionMail]}
            activeOpacity={0.8}
          >
            <Ionicons name="mail" size={20} color={theme.colors.white} />
          </TouchableOpacity>
        )}
        {STAFF_SOCIAL_KEYS.map((key) => {
          const raw = staff.social_links?.[key]?.trim();
          if (!raw) return null;
          const href = staffSocialOpenUrl(key as StaffSocialKey, raw);
          if (!href) return null;
          const icon =
            key === 'instagram'
              ? ('logo-instagram' as const)
              : key === 'facebook'
                ? ('logo-facebook' as const)
                : key === 'linkedin'
                  ? ('logo-linkedin' as const)
                  : ('logo-twitter' as const);
          const circleStyle =
            key === 'instagram'
              ? styles.avatarActionInstagram
              : key === 'facebook'
                ? styles.avatarActionFacebook
                : key === 'linkedin'
                  ? styles.avatarActionLinkedin
                  : styles.avatarActionX;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => Linking.openURL(href)}
              style={[styles.avatarActionCircle, circleStyle]}
              activeOpacity={0.8}
            >
              <Ionicons name={icon} size={20} color={theme.colors.white} />
            </TouchableOpacity>
          );
        })}
        <TouchableOpacity
          onPress={onMessage}
          style={[styles.avatarActionCircle, styles.avatarActionMessage]}
          disabled={startingChat}
          activeOpacity={0.8}
        >
          <Ionicons name="chatbubble-outline" size={20} color={theme.colors.white} />
        </TouchableOpacity>
      </View>
      <View style={styles.bottomPad} />

      <ImagePreviewModal
        visible={coverModalVisible}
        uri={staff.cover_image ?? null}
        onClose={() => setCoverModalVisible(false)}
      />
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={staff.profile_image ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />

      <StaffReviewsFullModal
        visible={reviewsModalVisible}
        onClose={() => setReviewsModalVisible(false)}
        staffName={staff?.full_name || 'Personel'}
        reviews={reviews as HubReview[]}
        formatReviewDate={formatReviewDate}
        footerExtra={
          <View style={styles.reviewsModalActions}>
            {myReview ? (
              <View style={[styles.reviewsModalCloseBtn, styles.reviewsModalRateDone, { flex: 1 }]}>
                <Ionicons name="star" size={18} color={theme.colors.primary} />
                <Text style={styles.reviewsModalRateDoneText}>Puan verdiniz</Text>
              </View>
            ) : (
              <TouchableOpacity
                style={[styles.reviewsModalCloseBtn, styles.reviewsModalRateBtn, { flex: 1 }]}
                onPress={() => {
                  setReviewsModalVisible(false);
                  openRateModal();
                }}
              >
                <Ionicons name="star-outline" size={18} color={theme.colors.white} />
                <Text style={styles.reviewsModalRateText}>Puan ver</Text>
              </TouchableOpacity>
            )}
          </View>
        }
      />

      <Modal
        visible={rateModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !submittingReview && setRateModalVisible(false)}
      >
        <KeyboardAvoidingView
          style={styles.rateModalKbRoot}
          behavior="padding"
          keyboardVerticalOffset={Platform.OS === 'ios' ? insets.top + 8 : 0}
        >
          <View style={styles.rateModalOuter}>
            <Pressable
              style={styles.rateModalBackdrop}
              onPress={() => !submittingReview && setRateModalVisible(false)}
            />
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="on-drag"
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.rateModalScrollContent}
              bounces={false}
              nestedScrollEnabled
            >
              <Pressable onPress={() => {}}>
                <View style={styles.rateModalBox}>
                  <Text style={styles.rateModalTitle}>{t('reviewFormTitle')}</Text>
                  <Text style={styles.rateModalSubtitle}>{staff?.full_name || 'Personel'}</Text>
                  <View style={styles.starRow}>
                    {[1, 2, 3, 4, 5].map((n) => (
                      <TouchableOpacity
                        key={n}
                        onPress={() => setRateStars(n)}
                        style={styles.starBtn}
                        activeOpacity={0.8}
                      >
                        <Ionicons
                          name={rateStars >= n ? 'star' : 'star-outline'}
                          size={36}
                          color={theme.colors.primary}
                        />
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TextInput
                    style={styles.rateMetaInput}
                    placeholder={t('reviewStayRoomPlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateStayRoom}
                    onChangeText={setRateStayRoom}
                    editable={!submittingReview}
                  />
                  <TextInput
                    style={styles.rateMetaInput}
                    placeholder={t('reviewStayNightsPlaceholder')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateStayNights}
                    onChangeText={setRateStayNights}
                    editable={!submittingReview}
                  />
                  <TextInput
                    style={styles.rateCommentInput}
                    placeholder={t('reviewCommentOptional')}
                    placeholderTextColor={theme.colors.textMuted}
                    value={rateComment}
                    onChangeText={setRateComment}
                    multiline
                    scrollEnabled
                    textAlignVertical="top"
                    editable={!submittingReview}
                  />
                  <View style={styles.rateModalActions}>
                    <TouchableOpacity
                      style={[styles.rateModalBtn, styles.rateModalBtnCancel]}
                      onPress={() => !submittingReview && setRateModalVisible(false)}
                      disabled={submittingReview}
                    >
                      <Text style={styles.rateModalBtnCancelText}>İptal</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.rateModalBtn, styles.rateModalBtnSubmit]}
                      onPress={submitReview}
                      disabled={submittingReview || rateStars < 1}
                      activeOpacity={0.8}
                    >
                      {submittingReview ? (
                        <ActivityIndicator size="small" color={theme.colors.white} />
                      ) : (
                        <Text style={styles.rateModalBtnSubmitText}>Gönder</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </Pressable>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      </ScrollView>
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

function formatReviewDate(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000));
  if (diff === 0) return 'Bugün';
  if (diff === 1) return 'Dün';
  if (diff < 7) return `${diff} gün önce`;
  if (diff < 30) return `${Math.floor(diff / 7)} hafta önce`;
  return d.toLocaleDateString('tr-TR');
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 8, fontSize: 15, color: theme.colors.textMuted },
  errorText: { fontSize: 16, color: theme.colors.text },
  backBtn: { marginTop: 16, paddingVertical: 12, paddingHorizontal: 24, backgroundColor: theme.colors.primary, borderRadius: 12 },
  backBtnText: { color: theme.colors.white, fontWeight: '600' },
  coverBlock: {
    width: SCREEN_WIDTH,
    height: COVER_HEIGHT,
    position: 'relative',
    overflow: 'visible',
    backgroundColor: theme.colors.borderLight,
  },
  coverActionBtn: {
    position: 'absolute',
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  coverBackBtn: { left: 16 },
  coverMenuBtn: { right: 16 },
  coverImageClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: COVER_HEIGHT,
    overflow: 'hidden',
  },
  coverPlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.borderLight,
  },
  profileHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 20,
    paddingHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  avatar: {
    width: AVATAR_SIZE,
    height: AVATAR_SIZE,
    borderRadius: AVATAR_SIZE / 2,
    borderWidth: 4,
    borderColor: theme.colors.surface,
    backgroundColor: theme.colors.borderLight,
    shadowOpacity: 0.2,
    elevation: 6,
  },
  avatarSmall: { width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE, borderRadius: HEADER_AVATAR_SIZE / 2, borderWidth: 2 },
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarLetterSmall: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  header: { alignItems: 'center', paddingHorizontal: 20, paddingTop: 0 },
  name: { ...theme.typography.title, fontSize: 24, color: theme.colors.text, textAlign: 'center' },
  dept: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, marginTop: 4 },
  onlineRow: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  dot: { width: 10, height: 10, borderRadius: 5, marginRight: 6 },
  dotOn: { backgroundColor: theme.colors.success },
  dotOff: { backgroundColor: theme.colors.textMuted },
  onlineText: { fontSize: 13, color: theme.colors.textMuted },
  section: { paddingHorizontal: theme.spacing.lg, marginTop: theme.spacing.lg },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  evaluatePrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 14,
    ...theme.shadows.sm,
  },
  evaluatePrimaryBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '800' },
  evaluateDoneBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.success + '22',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.success + '55',
  },
  evaluateDoneText: { flex: 1, fontSize: 14, fontWeight: '600', color: theme.colors.text },
  rateMetaInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    marginBottom: 10,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 20,
    padding: theme.spacing.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  rowLabel: { fontSize: 14, color: theme.colors.textMuted },
  rowValue: { fontSize: 14, fontWeight: '500', color: theme.colors.text },
  bullet: { fontSize: 14, color: theme.colors.text, marginBottom: 4 },
  bio: { fontSize: 14, color: theme.colors.text, lineHeight: 22 },
  rating: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  reviewCard: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewMeta: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 13, color: theme.colors.text, fontStyle: 'italic' },
  reviewsTapHint: { fontSize: 12, color: theme.colors.primary, marginTop: 4 },
  reviewsMore: { fontSize: 12, color: theme.colors.textMuted, marginTop: 8, textAlign: 'center' },
  avatarActionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.lg,
    marginTop: 8,
  },
  avatarActionCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarActionPhone: { backgroundColor: theme.colors.primary },
  avatarActionWhatsApp: { backgroundColor: '#25D366' },
  avatarActionMail: { backgroundColor: theme.colors.accent },
  avatarActionInstagram: { backgroundColor: '#E4405F' },
  avatarActionFacebook: { backgroundColor: '#1877F2' },
  avatarActionLinkedin: { backgroundColor: '#0A66C2' },
  avatarActionX: { backgroundColor: '#0f1419' },
  avatarActionMessage: { backgroundColor: theme.colors.primary },
  bottomPad: { height: 32 },
  reviewsModalRateDone: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6, backgroundColor: theme.colors.borderLight },
  reviewsModalRateDoneText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  reviewsModalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    ...theme.shadows.lg,
  },
  reviewsModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  reviewsModalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginBottom: theme.spacing.md },
  reviewsModalList: { maxHeight: 320, marginBottom: theme.spacing.md },
  reviewsModalEmpty: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  reviewsModalItem: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  reviewsModalItemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  reviewsModalItemStars: { fontSize: 16, color: theme.colors.primary },
  reviewsModalItemDate: { fontSize: 12, color: theme.colors.textMuted },
  reviewsModalItemMeta: { fontSize: 12, color: theme.colors.textMuted, marginBottom: 4 },
  reviewsModalItemComment: { fontSize: 14, color: theme.colors.text, fontStyle: 'italic' },
  reviewsModalItemNoComment: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  reviewsModalActions: { flexDirection: 'row', gap: 12 },
  reviewsModalCloseBtn: { flex: 1, paddingVertical: 12, borderRadius: theme.radius.md, alignItems: 'center', backgroundColor: theme.colors.borderLight },
  reviewsModalCloseText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  reviewsModalRateBtn: { backgroundColor: theme.colors.primary },
  reviewsModalRateText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageModalContent: { maxWidth: '100%', maxHeight: '90%', justifyContent: 'center', alignItems: 'center' },
  imageModalImage: { width: SCREEN_WIDTH, height: 280, maxWidth: '100%' },
  profileMenuBox: {
    marginTop: 80,
    marginLeft: 'auto',
    marginRight: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    minWidth: 160,
    paddingVertical: 8,
  },
  profileMenuItem: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12 },
  profileMenuItemText: { color: theme.colors.error, fontSize: 15, fontWeight: '600' },
  rateModalKbRoot: { flex: 1 },
  rateModalOuter: { flex: 1, justifyContent: 'flex-end' },
  rateModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  rateModalScrollContent: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 32,
    flexGrow: 1,
    justifyContent: 'flex-end',
  },
  rateModalBox: {
    width: '100%',
    maxWidth: 360,
    alignSelf: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: theme.spacing.xl,
    marginBottom: 8,
    ...theme.shadows.lg,
  },
  rateModalTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  rateModalSubtitle: { fontSize: 14, color: theme.colors.textMuted, marginBottom: theme.spacing.lg },
  starRow: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginBottom: theme.spacing.lg },
  starBtn: { padding: 4 },
  rateCommentInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: theme.radius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 100,
    maxHeight: 160,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.lg,
  },
  rateModalActions: { flexDirection: 'row', gap: 12 },
  rateModalBtn: { flex: 1, paddingVertical: 14, borderRadius: theme.radius.md, alignItems: 'center', justifyContent: 'center' },
  rateModalBtnCancel: { backgroundColor: theme.colors.borderLight },
  rateModalBtnCancelText: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  rateModalBtnSubmit: { backgroundColor: theme.colors.primary },
  rateModalBtnSubmitText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
});
