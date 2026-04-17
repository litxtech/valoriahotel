import { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { getPostTagVisual } from '@/lib/feedPostTagTheme';
import type { PostTagValue } from '@/lib/feedPostTags';

const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20 } as const;

const SHORT_TITLE_MAX_LEN = 72;

export type StaffFeedPostCardProps = {
  postTag: PostTagValue | string | null | undefined;
  authorName: string;
  authorAvatarUrl: string | null;
  authorBadge: 'blue' | 'yellow' | null;
  isGuestPost: boolean;
  /** Personel departmanı veya gösterilecek rol metni */
  roleLabel: string | null;
  timeAgo: string;
  createdAtLabel: string;
  title: string | null;
  media: React.ReactNode;
  hasMedia: boolean;
  liked: boolean;
  likeCount: number;
  commentCount: number;
  viewCount: number;
  notifOn: boolean;
  togglingLike: boolean;
  togglingNotif: boolean;
  deletingPost: boolean;
  onAuthorPress?: () => void;
  onLike: () => void;
  onComment: () => void;
  onViewers: () => void;
  onNotif: () => void;
  onMenu: () => void;
  onLayout?: (y: number) => void;
};

export function StaffFeedPostCard({
  postTag,
  authorName,
  authorAvatarUrl,
  authorBadge,
  isGuestPost,
  roleLabel,
  timeAgo,
  createdAtLabel,
  title,
  media,
  hasMedia,
  liked,
  likeCount,
  commentCount,
  viewCount,
  notifOn,
  togglingLike,
  togglingNotif,
  deletingPost,
  onAuthorPress,
  onLike,
  onComment,
  onViewers,
  onNotif,
  onMenu,
  onLayout,
}: StaffFeedPostCardProps) {
  const [expanded, setExpanded] = useState(false);
  const visual = getPostTagVisual(postTag);
  const rawTitle = (title ?? '').trim();
  const isShort = rawTitle.length > 0 && rawTitle.length <= SHORT_TITLE_MAX_LEN && !rawTitle.includes('\n\n');
  const showReadMore = rawTitle.length > 140;

  const ringGlow = isGuestPost
    ? 'rgba(74,111,138,0.5)'
    : authorBadge === 'blue'
      ? 'rgba(59,130,246,0.45)'
      : authorBadge === 'yellow'
        ? 'rgba(234,179,8,0.45)'
        : visual.avatarGlow;

  const AuthorWrapper = onAuthorPress ? TouchableOpacity : View;
  const authorProps = onAuthorPress
    ? { onPress: onAuthorPress, activeOpacity: 0.75 as const }
    : {};

  return (
    <View
      style={styles.outer}
      onLayout={(e) => onLayout?.(e.nativeEvent.layout.y)}
    >
      <View style={styles.pressable}>
        <View style={styles.surface}>
          <View pointerEvents="none" style={styles.surfaceHighlight} />
          <View style={styles.row}>
            <View style={[styles.accentBar, { backgroundColor: visual.bar }]} />
            <View style={styles.inner}>
              <View style={styles.headerRow}>
                <AuthorWrapper style={styles.headerLeft} {...authorProps}>
                  <View style={[styles.avatarWrap, { shadowColor: ringGlow }]}>
                    <AvatarWithBadge badge={authorBadge} avatarSize={36} badgeSize={11} showBadge={false}>
                      {authorAvatarUrl ? (
                        <CachedImage uri={authorAvatarUrl} style={styles.avatarImg} contentFit="cover" />
                      ) : (
                        <View style={isGuestPost ? styles.avatarPhGuest : styles.avatarPh}>
                          <Text style={isGuestPost ? styles.avatarLetterGuest : styles.avatarLetter}>{(authorName || '?').charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </AvatarWithBadge>
                  </View>
                  <View style={styles.headerText}>
                    <StaffNameWithBadge name={authorName} badge={authorBadge} textStyle={styles.name} />
                    <View style={styles.metaRow}>
                      {roleLabel ? (
                        <View style={styles.roleChip}>
                          <Text style={styles.roleChipText} numberOfLines={1}>
                            {roleLabel}
                          </Text>
                        </View>
                      ) : null}
                      <Text style={styles.time} numberOfLines={1}>
                        {timeAgo || 'şimdi'}
                      </Text>
                    </View>
                    <Text style={styles.dateTime}>{createdAtLabel}</Text>
                    {isGuestPost ? <Text style={styles.guestHint}>Misafir paylaşımı</Text> : null}
                  </View>
                </AuthorWrapper>
                <TouchableOpacity
                  style={styles.menuBtn}
                  onPress={onMenu}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                  activeOpacity={0.7}
                  disabled={!!deletingPost}
                >
                  {deletingPost ? (
                    <ActivityIndicator size="small" color={theme.colors.textMuted} />
                  ) : (
                    <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textMuted} style={{ opacity: 0.5 }} />
                  )}
                </TouchableOpacity>
              </View>

              <View style={styles.tagRow}>
                <View style={[styles.tagPill, { backgroundColor: visual.badgeBg }]}>
                  <Text style={[styles.tagPillText, { color: visual.badgeText }]}>{visual.label}</Text>
                </View>
              </View>

              {hasMedia ? <View style={styles.mediaSlot}>{media}</View> : null}

              {rawTitle ? (
                <View style={styles.body}>
                  <Text
                    style={[styles.postTitle, isShort && styles.postTitleShort]}
                    numberOfLines={expanded ? undefined : 3}
                  >
                    {rawTitle}
                  </Text>
                  {showReadMore && !expanded ? (
                    <TouchableOpacity onPress={() => setExpanded(true)} hitSlop={8} activeOpacity={0.7}>
                      <Text style={styles.readMore}>Devamını oku</Text>
                    </TouchableOpacity>
                  ) : null}
                  {expanded && showReadMore ? (
                    <TouchableOpacity onPress={() => setExpanded(false)} hitSlop={8} activeOpacity={0.7}>
                      <Text style={styles.readMore}>Daha az</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.actions}>
                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionPressed]}
                  onPress={onLike}
                  disabled={!!togglingLike}
                >
                  {togglingLike ? (
                    <Ionicons name="heart-outline" size={18} color={theme.colors.textMuted} />
                  ) : (
                    <Ionicons
                      name={liked ? 'heart' : 'heart-outline'}
                      size={18}
                      color={liked ? theme.colors.error : theme.colors.textMuted}
                    />
                  )}
                  <Text style={[styles.actionCount, liked && styles.actionCountActive]}>{likeCount}</Text>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.actionItem, pressed && styles.actionPressed]} onPress={onComment}>
                  <Ionicons name="chatbubble-outline" size={17} color={theme.colors.textMuted} />
                  <Text style={styles.actionCount}>{commentCount}</Text>
                </Pressable>

                <Pressable style={({ pressed }) => [styles.actionItem, pressed && styles.actionPressed]} onPress={onViewers}>
                  <Ionicons name="eye-outline" size={18} color={theme.colors.textMuted} />
                  <Text style={styles.actionCount}>{viewCount}</Text>
                </Pressable>

                <Pressable
                  style={({ pressed }) => [styles.actionItem, pressed && styles.actionPressed]}
                  onPress={onNotif}
                  disabled={!!togglingNotif}
                >
                  {togglingNotif ? (
                    <Ionicons name="notifications-outline" size={18} color={theme.colors.textMuted} />
                  ) : (
                    <Ionicons
                      name={notifOn ? 'notifications' : 'notifications-outline'}
                      size={18}
                      color={notifOn ? theme.colors.primary : theme.colors.textMuted}
                    />
                  )}
                </Pressable>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    marginHorizontal: SPACING.lg,
    marginTop: SPACING.lg,
    marginBottom: SPACING.xs,
    borderRadius: 20,
    backgroundColor: theme.colors.white,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#0f172a',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.08,
        shadowRadius: 14,
      },
      android: { elevation: 2 },
      default: {},
    }),
  },
  pressable: {
    borderRadius: 20,
    overflow: 'hidden',
  },
  surface: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  surfaceHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: 'rgba(248,250,252,0.95)',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  accentBar: {
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
  },
  inner: {
    flex: 1,
    padding: SPACING.xl,
    paddingLeft: SPACING.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: SPACING.sm,
  },
  headerLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SPACING.md,
    minWidth: 0,
  },
  avatarWrap: {
    borderRadius: 20,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 6,
    elevation: 3,
  },
  avatarImg: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  avatarPh: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarPhGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: { fontSize: 15, fontWeight: '700', color: theme.colors.white },
  avatarLetterGuest: { fontSize: 15, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  headerText: { flex: 1, minWidth: 0 },
  name: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: 4,
  },
  roleChip: {
    maxWidth: '70%',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: theme.colors.borderLight,
  },
  roleChipText: { fontSize: 11, fontWeight: '600', color: theme.colors.textSecondary },
  time: { fontSize: 12, fontWeight: '500', color: theme.colors.textMuted },
  dateTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  guestHint: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, fontStyle: 'italic' },
  menuBtn: { padding: SPACING.sm, marginTop: -4 },
  tagRow: { marginTop: SPACING.md },
  tagPill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  tagPillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.3 },
  /** İç padding sol 12 / sağ 20 olduğu için tam genişlik için asimetrik negatif margin */
  mediaSlot: { marginTop: SPACING.md, marginLeft: -SPACING.md, marginRight: -SPACING.xl },
  body: { marginTop: SPACING.md },
  postTitle: {
    fontSize: 16,
    fontWeight: '400',
    color: theme.colors.text,
    lineHeight: 24,
  },
  postTitleShort: {
    fontSize: 18,
    lineHeight: 1.45 * 18,
    fontWeight: '500',
  },
  readMore: {
    marginTop: SPACING.sm,
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SPACING.xl,
    paddingTop: SPACING.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    gap: SPACING.lg,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  actionPressed: { opacity: 0.75 },
  actionCount: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textMuted,
    minWidth: 16,
  },
  actionCountActive: { color: theme.colors.error },
});
