import type { ReactNode } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { StaffPerformanceScoreCard } from '@/components/StaffPerformanceScoreCard';
import { CachedImage } from '@/components/CachedImage';
import type { StaffEvaluationResolved } from '@/lib/staffEvaluation';
import { guestDisplayName } from '@/lib/guestDisplayName';

export type HubReview = {
  id: string;
  rating: number;
  comment: string | null;
  created_at: string;
  stay_room_label?: string | null;
  stay_nights_label?: string | null;
  guest?: { full_name: string | null; room_number?: string | null; photo_url?: string | null } | null;
};

const AVATAR_S = 44;

function defaultDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  } catch {
    return iso;
  }
}

function ReviewGuestHeader({
  r,
  formatDateTime,
}: {
  r: HubReview;
  formatDateTime: (iso: string) => string;
}) {
  const { t } = useTranslation();
  const name = guestDisplayName(r.guest?.full_name, t('guestLabel'));
  const roomFromReview = r.stay_room_label?.trim();
  const roomFromGuest = r.guest?.room_number;
  const nights = r.stay_nights_label?.trim();
  const uri = r.guest?.photo_url?.trim();

  return (
    <View style={rhStyles.row}>
      {uri ? (
        <CachedImage uri={uri} style={rhStyles.avatarImg} contentFit="cover" />
      ) : (
        <View style={rhStyles.avatarPh}>
          <Text style={rhStyles.avatarLetter}>{name.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={rhStyles.metaCol}>
        <Text style={rhStyles.name} numberOfLines={1}>
          {name}
        </Text>
        <Text style={rhStyles.dateTime}>{formatDateTime(r.created_at)}</Text>
        {roomFromReview || roomFromGuest ? (
          <Text style={rhStyles.extra} numberOfLines={1}>
            {roomFromReview ? `${t('reviewRoomPrefix')} ${roomFromReview}` : t('roomNumberLabel', { num: roomFromGuest })}
          </Text>
        ) : null}
        {nights ? (
          <Text style={rhStyles.extra} numberOfLines={1}>
            {t('reviewNightsPrefix')} {nights}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const rhStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 8 },
  avatarImg: { width: AVATAR_S, height: AVATAR_S, borderRadius: AVATAR_S / 2, backgroundColor: theme.colors.borderLight },
  avatarPh: {
    width: AVATAR_S,
    height: AVATAR_S,
    borderRadius: AVATAR_S / 2,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 18, fontWeight: '800', color: theme.colors.guestAvatarLetter },
  metaCol: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  dateTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  extra: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 4 },
});

type Props = {
  resolved: StaffEvaluationResolved;
  averageRating: number | null;
  totalReviews: number | null;
  reviews: HubReview[];
  previewLimit?: number;
  onOpenAllReviews: () => void;
  /** Tarih + saat (yorum kartları) */
  formatReviewDateTime?: (iso: string) => string;
  /** Geriye dönük: datetime verilmezse kullanılır */
  formatReviewDate?: (iso: string) => string;
  /** Örn. misafir “Değerlendir” butonu — başlığın hemen altında */
  headerActions?: ReactNode;
};

export function StaffEvaluationHub({
  resolved,
  averageRating,
  totalReviews,
  reviews,
  previewLimit = 3,
  onOpenAllReviews,
  formatReviewDateTime,
  formatReviewDate,
  headerActions,
}: Props) {
  const { t } = useTranslation();
  const preview = reviews.slice(0, previewLimit);
  const fmtDt =
    formatReviewDateTime ??
    ((iso: string) => (formatReviewDate ? formatReviewDate(iso) : defaultDateTime(iso)));

  return (
    <View style={styles.wrap}>
      <Text style={styles.blockTitle}>{t('evaluationHubTitle')}</Text>
      {headerActions ? <View style={styles.headerActionsWrap}>{headerActions}</View> : null}
      <StaffPerformanceScoreCard data={resolved} />

      <View style={styles.guestRatingCard}>
        <Text style={styles.guestRatingLabel}>{t('guestStarRating')}</Text>
        <Text style={styles.guestRatingValue}>
          {averageRating != null && averageRating > 0
            ? `★ ${Number(averageRating).toFixed(1)} · ${totalReviews ?? 0} ${t('reviewCount')}`
            : t('guestRatingNone')}
        </Text>
      </View>

      {preview.length > 0 ? (
        <View style={styles.previewBlock}>
          {preview.map((r) => (
            <View key={r.id} style={styles.previewItem}>
              <ReviewGuestHeader r={r} formatDateTime={fmtDt} />
              <Text style={styles.previewStarsRow}>{'★'.repeat(r.rating)}</Text>
              {r.comment ? (
                <Text style={styles.previewComment} numberOfLines={4}>
                  {r.comment}
                </Text>
              ) : (
                <Text style={styles.previewNoComment}>{t('noComment')}</Text>
              )}
            </View>
          ))}
        </View>
      ) : (
        <Text style={styles.noReviewsYet}>{t('noGuestReviewsYet')}</Text>
      )}

      {reviews.length > previewLimit && (
        <TouchableOpacity style={styles.seeAllBtn} onPress={onOpenAllReviews} activeOpacity={0.85}>
          <Text style={styles.seeAllText}>{t('seeAllReviews')}</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
      )}
    </View>
  );
}

type ProfileTeaserProps = {
  resolved: StaffEvaluationResolved;
  averageRating: number | null;
  totalReviews: number | null;
  onPress: () => void;
};

/** Profil özeti: tek satır; tıklanınca tam değerlendirme ekranına gider */
export function StaffEvaluationProfileTeaser({
  resolved,
  averageRating,
  totalReviews,
  onPress,
}: ProfileTeaserProps) {
  const { t } = useTranslation();
  const hasCorp = resolved.source !== 'none';
  const overall = hasCorp ? resolved.overall : null;
  const hasStars = averageRating != null && averageRating > 0;
  const n = totalReviews ?? 0;

  const subParts: string[] = [];
  if (hasCorp && overall != null) subParts.push(`${overall}/100`);
  if (hasStars) subParts.push(`★ ${Number(averageRating).toFixed(1)}`);
  if (n > 0) subParts.push(`${n} ${t('reviewCount')}`);
  const subLine = subParts.length > 0 ? subParts.join(' · ') : t('staffEvaluationEmpty');

  return (
    <TouchableOpacity style={teaserStyles.wrap} onPress={onPress} activeOpacity={0.82} accessibilityRole="button">
      <View style={teaserStyles.row}>
        <View style={teaserStyles.textCol}>
          <Text style={teaserStyles.title}>{t('evaluationHubTitle')}</Text>
          <Text style={teaserStyles.sub} numberOfLines={2}>
            {subLine}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={22} color={theme.colors.textMuted} />
      </View>
    </TouchableOpacity>
  );
}

const teaserStyles = StyleSheet.create({
  wrap: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    paddingVertical: 14,
    paddingHorizontal: 16,
    ...theme.shadows.sm,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  textCol: { flex: 1, minWidth: 0 },
  title: { fontSize: 16, fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  sub: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, lineHeight: 18 },
});

type ModalProps = {
  visible: boolean;
  onClose: () => void;
  staffName: string;
  reviews: HubReview[];
  formatReviewDateTime?: (iso: string) => string;
  formatReviewDate?: (iso: string) => string;
  footerExtra?: ReactNode;
};

export function StaffReviewsFullModal({
  visible,
  onClose,
  staffName,
  reviews,
  formatReviewDateTime,
  formatReviewDate,
  footerExtra,
}: ModalProps) {
  const { t } = useTranslation();
  const fmtDt =
    formatReviewDateTime ??
    ((iso: string) => (formatReviewDate ? formatReviewDate(iso) : defaultDateTime(iso)));

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.modalOverlay} onPress={onClose}>
        <Pressable style={styles.modalBox} onPress={() => {}}>
          <Text style={styles.modalTitle}>{t('allGuestReviewsTitle')}</Text>
          <Text style={styles.modalSubtitle}>
            {staffName} — {reviews.length} {t('reviewCount')}
          </Text>
          <ScrollView style={styles.modalList} showsVerticalScrollIndicator={false}>
            {reviews.length === 0 ? (
              <Text style={styles.modalEmpty}>{t('noGuestReviewsYet')}</Text>
            ) : (
              reviews.map((r) => (
                <View key={r.id} style={styles.modalItem}>
                  <ReviewGuestHeader r={r} formatDateTime={fmtDt} />
                  <Text style={styles.modalStarsBlock}>
                    {'★'.repeat(r.rating)}
                    {'☆'.repeat(5 - r.rating)}
                  </Text>
                  {r.comment ? (
                    <Text style={styles.modalComment}>{r.comment}</Text>
                  ) : (
                    <Text style={styles.modalNoComment}>{t('noComment')}</Text>
                  )}
                </View>
              ))
            )}
          </ScrollView>
          {footerExtra ? <View style={styles.modalFooterExtra}>{footerExtra}</View> : null}
          <TouchableOpacity style={styles.modalCloseBtn} onPress={onClose} activeOpacity={0.85}>
            <Text style={styles.modalCloseText}>{t('close')}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 4 },
  headerActionsWrap: { marginBottom: 12 },
  blockTitle: {
    ...theme.typography.bodySmall,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  guestRatingCard: {
    marginTop: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  guestRatingLabel: { fontSize: 12, fontWeight: '600', color: theme.colors.textMuted, marginBottom: 4 },
  guestRatingValue: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  previewBlock: { marginTop: 12, gap: 12 },
  previewItem: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  previewStarsRow: { color: theme.colors.primary, fontSize: 15, fontWeight: '600', marginBottom: 6 },
  previewComment: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  previewNoComment: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  noReviewsYet: { marginTop: 10, fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  seeAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 14,
    paddingVertical: 12,
  },
  seeAllText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  modalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 18,
    maxHeight: '82%',
  },
  modalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  modalSubtitle: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4, marginBottom: 12 },
  modalList: { maxHeight: 360 },
  modalEmpty: { padding: 16, color: theme.colors.textMuted },
  modalItem: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  modalStarsBlock: { color: theme.colors.primary, marginBottom: 8, fontSize: 15 },
  modalComment: { fontSize: 14, color: theme.colors.text, lineHeight: 20 },
  modalNoComment: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  modalFooterExtra: { marginTop: 8 },
  modalCloseBtn: {
    marginTop: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: 12,
  },
  modalCloseText: { fontSize: 16, fontWeight: '700', color: theme.colors.primary },
});
