import { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  Modal,
  Pressable,
  Linking,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { staffGetOrCreateDirectConversation } from '@/lib/messagingApi';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';
import { blockUserForStaff, getHiddenUsersForStaff } from '@/lib/userBlocks';

const OTHER_STAFF_REVIEW_LIMIT = 5;
const COVER_HEIGHT = 260;
const AVATAR_SIZE = 116;
const HEADER_AVATAR_SIZE = 64;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type StaffProfile = {
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
  verification_badge?: 'blue' | 'yellow' | null;
  shift?: { start_time: string; end_time: string } | null;
  role?: string | null;
  show_gold_profile_border?: boolean | null;
  phone?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  show_phone_to_guest?: boolean | null;
  show_email_to_guest?: boolean | null;
  show_whatsapp_to_guest?: boolean | null;
};

type ReviewRow = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
};

export default function StaffProfileViewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { staff: me } = useAuthStore();
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [reviews, setReviews] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [coverModalVisible, setCoverModalVisible] = useState(false);
  const [avatarModalVisible, setAvatarModalVisible] = useState(false);
  const [profileMenuVisible, setProfileMenuVisible] = useState(false);

  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    const load = async () => {
      if (me?.id && me.id !== id) {
        const hidden = await getHiddenUsersForStaff(me.id);
        if (hidden.hiddenStaffIds.has(id)) {
          setProfile(null);
          setLoading(false);
          return;
        }
      }
      const { data, error } = await supabase
        .from('staff')
        .select(
          'id, full_name, department, position, profile_image, cover_image, bio, is_online, hire_date, average_rating, total_reviews, specialties, languages, office_location, achievements, verification_badge, shift_id, role, show_gold_profile_border, phone, email, whatsapp, show_phone_to_guest, show_email_to_guest, show_whatsapp_to_guest'
        )
        .eq('id', id)
        .eq('is_active', true)
        .is('deleted_at', null)
        .maybeSingle();
      if (error || !data) {
        setProfile(null);
        setLoading(false);
        return;
      }
      const s = { ...data, shift: null } as StaffProfile;
      if (data.shift_id) {
        const { data: shift } = await supabase
          .from('shifts')
          .select('start_time, end_time')
          .eq('id', data.shift_id)
          .single();
        s.shift = shift ?? null;
      }
      setProfile(s);
      const { data: r } = await supabase
        .from('staff_reviews')
        .select('id, rating, comment, created_at')
        .eq('staff_id', id)
        .order('created_at', { ascending: false })
        .limit(OTHER_STAFF_REVIEW_LIMIT);
      setReviews((r ?? []) as ReviewRow[]);
      setLoading(false);
    };
    load();
  }, [id, me?.id]);

  const [openingChat, setOpeningChat] = useState(false);
  const openChat = async () => {
    if (!id || !me?.id) return;
    setOpeningChat(true);
    try {
      const convId = await staffGetOrCreateDirectConversation(me.id, id, 'staff');
      if (convId) router.push({ pathname: '/staff/chat/[id]', params: { id: convId } });
      else Alert.alert('Hata', 'Sohbet açılamadı.');
    } catch {
      Alert.alert('Hata', 'Sohbet açılamadı.');
    }
    setOpeningChat(false);
  };

  const handleBlockFromProfile = () => {
    if (!id || !me?.id || me.id === id) return;
    Alert.alert('Kullanıcıyı engelle', 'Bu kullanıcı artık sizi göremez ve siz de onu göremezsiniz.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForStaff({
            blockerStaffId: me.id,
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
  if (!profile) {
    return (
      <View style={styles.centered}>
        <Ionicons name="person-outline" size={64} color={theme.colors.textMuted} />
        <Text style={styles.errorText}>Profil bulunamadı</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.8}>
          <Text style={styles.backBtnText}>Geri</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const avatarUri = profile.profile_image || undefined;
  const isMe = me?.id === profile.id;
  const showGoldBorder =
    !isMe &&
    profile.role === 'admin' &&
    (profile.show_gold_profile_border ?? false);

  return (
    <View style={[styles.container, showGoldBorder && styles.containerGoldBorder]}>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.coverBlock}>
          <TouchableOpacity
            style={[styles.coverActionBtn, styles.coverBackBtn, { top: insets.top + 8 }]}
            onPress={() => router.back()}
            activeOpacity={0.7}
            accessibilityLabel="Geri"
          >
            <Ionicons name="chevron-back" size={24} color={theme.colors.white} />
          </TouchableOpacity>
          {!isMe ? (
            <TouchableOpacity
              style={[styles.coverActionBtn, styles.coverMenuBtn, { top: insets.top + 8 }]}
              onPress={() => setProfileMenuVisible(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="ellipsis-horizontal" size={22} color={theme.colors.white} />
            </TouchableOpacity>
          ) : null}
          <View style={styles.coverGradient} pointerEvents="none" />
          <TouchableOpacity
            style={styles.coverImageClip}
            activeOpacity={1}
            onPress={() => profile.cover_image && setCoverModalVisible(true)}
          >
            {profile.cover_image ? (
              <CachedImage uri={profile.cover_image} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={styles.coverPlaceholder} />
            )}
          </TouchableOpacity>
      </View>
      <View style={styles.profileHeaderRow}>
        <TouchableOpacity activeOpacity={1} onPress={() => avatarUri && setAvatarModalVisible(true)}>
          <AvatarWithBadge badge={profile.verification_badge ?? null} avatarSize={HEADER_AVATAR_SIZE} badgeSize={18} showBadge={false}>
            {avatarUri ? (
              <CachedImage uri={avatarUri} style={[styles.avatar, styles.avatarSmall]} contentFit="cover" />
            ) : (
              <View style={[styles.avatar, styles.avatarPlaceholder, styles.avatarSmall]}>
                <Text style={styles.avatarLetterSmall}>{(profile.full_name || '?').charAt(0).toUpperCase()}</Text>
              </View>
            )}
          </AvatarWithBadge>
        </TouchableOpacity>
        <View style={styles.nameBlock}>
          <StaffNameWithBadge name={profile.full_name || '—'} badge={profile.verification_badge ?? null} badgeSize={18} textStyle={styles.name} center />
          <Text style={styles.dept}>{profile.position || profile.department || '—'}</Text>
        </View>
      </View>
      <View style={styles.body}>

        {(profile.average_rating != null && profile.average_rating > 0) && (
          <View style={styles.ratingRow}>
            <Text style={styles.ratingText}>
              ★ {Number(profile.average_rating).toFixed(1)} ({profile.total_reviews ?? 0} değerlendirme)
            </Text>
          </View>
        )}

        <View style={styles.infoRow}>
          {profile.department && (
            <Row label="Departman" value={profile.department} />
          )}
          {profile.position && (
            <Row label="Pozisyon" value={profile.position} />
          )}
          {profile.hire_date && (
            <Row
              label="İşe başlama"
              value={new Date(profile.hire_date).toLocaleDateString('tr-TR')}
            />
          )}
          {profile.shift && (
            <Row
              label="Çalışma saatleri"
              value={`${profile.shift.start_time} - ${profile.shift.end_time}`}
            />
          )}
          {profile.office_location && (
            <Row label="Konum" value={profile.office_location} />
          )}
        </View>

        {profile.is_online != null && (
          <View style={styles.onlineRow}>
            <View style={[styles.onlineDot, profile.is_online && styles.onlineDotOn]} />
            <Text style={styles.onlineText}>
              {profile.is_online ? 'Çevrimiçi' : 'Çevrimdışı'}
            </Text>
          </View>
        )}

        {profile.specialties?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Uzmanlıklar</Text>
            {profile.specialties.map((s, i) => (
              <Text key={i} style={styles.bullet}>• {s}</Text>
            ))}
          </View>
        ) : null}

        {profile.languages?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Konuşulan diller</Text>
            {profile.languages.map((l, i) => (
              <Text key={i} style={styles.bullet}>• {l}</Text>
            ))}
          </View>
        ) : null}

        {profile.bio ? (
          <View style={styles.bioBlock}>
            <Text style={styles.bioLabel}>Hakkında</Text>
            <Text style={styles.bio}>{profile.bio}</Text>
          </View>
        ) : null}

        {profile.achievements?.length ? (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Başarılar</Text>
            {profile.achievements.map((a, i) => (
              <Text key={i} style={styles.bullet}>• {a}</Text>
            ))}
          </View>
        ) : null}

        {reviews.length > 0 && (
          <View style={styles.block}>
            <Text style={styles.blockTitle}>Son değerlendirmeler</Text>
            {reviews.map((r) => (
              <View key={r.id} style={styles.reviewCard}>
                <Text style={styles.reviewStars}>{'★'.repeat(r.rating)}</Text>
                {r.comment ? (
                  <Text style={styles.reviewComment}>{r.comment}</Text>
                ) : null}
              </View>
            ))}
          </View>
        )}

        {!isMe && (() => {
          const showPhone = !!profile.phone?.trim();
          const showEmail = !!profile.email?.trim();
          const showWhatsApp = !!profile.whatsapp?.trim();
          const hasAnyContact = showPhone || showEmail || showWhatsApp;
          if (!hasAnyContact) return null;
          return (
            <View style={styles.avatarActionsRow}>
              {showPhone && (
                <TouchableOpacity
                  onPress={() => profile.phone && Linking.openURL(`tel:${profile.phone.trim()}`)}
                  style={[styles.avatarActionCircle, styles.avatarActionPhone]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="call" size={20} color={theme.colors.white} />
                </TouchableOpacity>
              )}
              {showWhatsApp && (
                <TouchableOpacity
                  onPress={() =>
                    profile.whatsapp &&
                    Linking.openURL(`https://wa.me/${profile.whatsapp.trim().replace(/\D/g, '')}`)
                  }
                  style={[styles.avatarActionCircle, styles.avatarActionWhatsApp]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="logo-whatsapp" size={20} color={theme.colors.white} />
                </TouchableOpacity>
              )}
              {showEmail && (
                <TouchableOpacity
                  onPress={() =>
                    profile.email && Linking.openURL(`mailto:${profile.email.trim()}`)
                  }
                  style={[styles.avatarActionCircle, styles.avatarActionMail]}
                  activeOpacity={0.8}
                >
                  <Ionicons name="mail" size={20} color={theme.colors.white} />
                </TouchableOpacity>
              )}
            </View>
          );
        })()}

        {!isMe && (
          <TouchableOpacity
            style={[styles.chatBtn, openingChat && styles.chatBtnDisabled]}
            onPress={openChat}
            disabled={openingChat}
            activeOpacity={0.8}
          >
            {openingChat ? (
              <ActivityIndicator color={theme.colors.white} size="small" />
            ) : (
              <>
                <Ionicons name="chatbubbles" size={22} color={theme.colors.white} />
                <Text style={styles.chatBtnText}>Sohbet</Text>
              </>
            )}
          </TouchableOpacity>
        )}
        {isMe && (
          <TouchableOpacity
            style={styles.chatBtn}
            onPress={() => router.replace('/staff/(tabs)/profile')}
            activeOpacity={0.8}
          >
            <Ionicons name="person" size={22} color={theme.colors.white} />
            <Text style={styles.chatBtnText}>Profilimi düzenle</Text>
          </TouchableOpacity>
        )}
      </View>

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
              <Text style={styles.profileMenuText}>Engelle</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Modal>

      <ImagePreviewModal
        visible={coverModalVisible}
        uri={profile.cover_image ?? null}
        onClose={() => setCoverModalVisible(false)}
      />
      <ImagePreviewModal
        visible={avatarModalVisible}
        uri={profile.profile_image ?? null}
        onClose={() => setAvatarModalVisible(false)}
      />
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

const GOLD_COLOR = '#D4AF37';

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  containerGoldBorder: {
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderTopWidth: 4,
    borderColor: GOLD_COLOR,
  },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 32 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  loadingText: { marginTop: 12, fontSize: 15, color: theme.colors.textMuted },
  errorText: { marginTop: 12, fontSize: 16, color: theme.colors.text },
  backBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: 12,
  },
  backBtnText: { color: theme.colors.white, fontWeight: '600', fontSize: 15 },
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
  coverGradient: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 100,
    zIndex: 2,
    backgroundColor: 'rgba(0,0,0,0.2)',
  },
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
    ...theme.shadows.md,
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
  avatarPlaceholder: { justifyContent: 'center', alignItems: 'center' },
  avatarSmall: { width: HEADER_AVATAR_SIZE, height: HEADER_AVATAR_SIZE, borderRadius: HEADER_AVATAR_SIZE / 2, borderWidth: 2 },
  avatarLetter: { fontSize: 36, fontWeight: '700', color: theme.colors.primary },
  avatarLetterSmall: { fontSize: 24, fontWeight: '700', color: theme.colors.primary },
  body: {
    padding: theme.spacing.xl,
    backgroundColor: theme.colors.surface,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    borderWidth: 0,
    ...theme.shadows.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 6,
  },
  nameBlock: { alignItems: 'center', marginBottom: 4 },
  name: { ...theme.typography.title, fontSize: 24, color: theme.colors.text, textAlign: 'center', marginBottom: 6 },
  dept: { fontSize: 16, fontWeight: '600', color: theme.colors.primary, textAlign: 'center', marginBottom: 8 },
  ratingRow: { alignItems: 'center', marginBottom: 12 },
  ratingText: { fontSize: 14, color: theme.colors.primary, fontWeight: '600' },
  infoRow: { marginTop: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowLabel: { fontSize: 13, color: theme.colors.textMuted },
  rowValue: { fontSize: 14, color: theme.colors.text },
  onlineRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 12, gap: 6 },
  onlineDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: theme.colors.textMuted },
  onlineDotOn: { backgroundColor: theme.colors.success },
  onlineText: { fontSize: 13, color: theme.colors.textMuted },
  block: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  blockTitle: { fontSize: 13, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 8 },
  bullet: { fontSize: 14, color: theme.colors.text, marginBottom: 4 },
  bioBlock: { marginTop: 16, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  bioLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 6 },
  bio: { fontSize: 15, lineHeight: 22, color: theme.colors.text },
  reviewCard: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  reviewStars: { color: theme.colors.primary, marginBottom: 4 },
  reviewComment: { fontSize: 13, color: theme.colors.text },
  avatarActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginTop: 20,
    marginBottom: 8,
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
  chatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: theme.colors.primary,
  },
  chatBtnText: { color: theme.colors.white, fontSize: 16, fontWeight: '600' },
  chatBtnDisabled: { opacity: 0.7 },
  imageModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
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
  profileMenuText: { color: theme.colors.error, fontSize: 15, fontWeight: '600' },
  imageModalContent: { flex: 1, width: '100%', justifyContent: 'center' },
  imageModalImage: { width: '100%', height: '100%' },
});
