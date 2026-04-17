import { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useWindowDimensions,
  ActivityIndicator,
  Alert,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Video } from 'expo-av';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName, isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import { sendNotification } from '@/lib/notificationService';
import { useAuthStore } from '@/stores/authStore';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { getHiddenUsersForGuest } from '@/lib/userBlocks';

type PostRow = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  guest_id: string | null;
  lat?: number | null;
  lng?: number | null;
  location_label?: string | null;
  staff: { full_name: string | null; department: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
  guest: { full_name: string | null } | null;
};

type CommentRow = {
  id: string;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

function getDisplayName(): string {
  const { user } = useAuthStore.getState();
  if (!user) return '';
  const name = user.user_metadata?.full_name ?? user.user_metadata?.name;
  if (name && typeof name === 'string') {
    const t = name.trim();
    if (t && !isOpaqueGuestDisplayString(t)) return t;
  }
  const email = user.email ?? '';
  const part = email.split('@')[0];
  if (part) {
    const cap = part.charAt(0).toUpperCase() + part.slice(1);
    if (!isOpaqueGuestDisplayString(cap)) return cap;
  }
  return 'Misafir';
}

export default function CustomerFeedPostDetail() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const idNorm = id && typeof id === 'string' ? id.trim() : '';
  const router = useRouter();
  const { width: winWidth } = useWindowDimensions();
  const { user } = useAuthStore();
  const [post, setPost] = useState<PostRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [videoLoading, setVideoLoading] = useState(true);
  const [likeCount, setLikeCount] = useState(0);
  const [commentCount, setCommentCount] = useState(0);
  const [myLike, setMyLike] = useState(false);
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [commentText, setCommentText] = useState('');
  const [togglingLike, setTogglingLike] = useState(false);
  const [postingComment, setPostingComment] = useState(false);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPost = useCallback(async () => {
    if (!idNorm) return;
    const guestRow = user ? await getOrCreateGuestForCurrentSession() : null;
    setMyGuestId(guestRow?.guest_id ?? null);
    const hidden = guestRow?.guest_id
      ? await getHiddenUsersForGuest(guestRow.guest_id)
      : { hiddenStaffIds: new Set<string>(), hiddenGuestIds: new Set<string>() };
    const { data, error: e } = await supabase
      .from('feed_posts')
      .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, guest_id, lat, lng, location_label, staff:staff_id(full_name, department, verification_badge, deleted_at), guest:guest_id(full_name, deleted_at)')
      .eq('id', idNorm)
      .in('visibility', ['customers', 'guests_only'])
      .maybeSingle();
    if (e) {
      setError('Yüklenemedi.');
      setPost(null);
      return;
    }
    const postRow = data as PostRow | null;
    const authorDeleted =
      postRow && ((postRow.staff_id && (postRow.staff as { deleted_at?: string | null } | null)?.deleted_at) ||
        (postRow.guest_id && (postRow.guest as { deleted_at?: string | null } | null)?.deleted_at));
    const hiddenPost = postRow
      ? (postRow.staff_id && hidden.hiddenStaffIds.has(postRow.staff_id)) ||
        (postRow.guest_id && hidden.hiddenGuestIds.has(postRow.guest_id)) ||
        !!authorDeleted
      : false;
    if (hiddenPost) {
      setPost(null);
      setError('Paylaşım bulunamadı.');
      return;
    }
    setPost(postRow);
    setError(data ? null : 'Paylaşım bulunamadı.');
    if (!data) return;
    const [reactionsRes, commentsRes, myRes] = await Promise.all([
      supabase.from('feed_post_reactions').select('post_id').eq('post_id', idNorm),
      supabase.from('feed_post_comments').select('id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)').eq('post_id', idNorm).order('created_at', { ascending: true }),
      guestRow ? supabase.from('feed_post_reactions').select('post_id').eq('post_id', idNorm).eq('guest_id', guestRow.guest_id) : Promise.resolve({ data: [] as { post_id: string }[] }),
    ]);
    const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
    const commentList = ((commentsRes.data ?? []) as CommentRow[]).filter(
      (c) =>
        !(c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) &&
        !(c.guest_id && hidden.hiddenGuestIds.has(c.guest_id)) &&
        !(c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    const myReactions = (myRes.data ?? []) as { post_id: string }[];
    setLikeCount(reactions.length);
    setCommentCount(commentList.length);
    setComments(commentList);
    setMyLike(myReactions.length > 0);
    if (guestRow) {
      supabase.from('feed_post_views').insert({ post_id: idNorm, guest_id: guestRow.guest_id }).then(() => {}).catch(() => {});
    }
  }, [idNorm, user]);

  useEffect(() => {
    if (!idNorm) {
      setLoading(false);
      setError('Paylaşım bulunamadı.');
      return;
    }
    setVideoLoading(true);
    loadPost().then(() => setLoading(false));
  }, [idNorm, loadPost]);

  // Video yüklenme overlay'ı bazen onLoad tetiklenmeyebilir; bir süre sonra kaldır
  useEffect(() => {
    if (!post || post.media_type !== 'video') return;
    const t = setTimeout(() => setVideoLoading(false), 4000);
    return () => clearTimeout(t);
  }, [post?.id]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  if (error || !post) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>{error ?? 'Paylaşım bulunamadı.'}</Text>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Text style={styles.backBtnText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const rawStaff = post.staff as { full_name?: string; department?: string; verification_badge?: 'blue' | 'yellow' | null } | null;
  const rawGuest = post.guest as { full_name?: string | null } | null;
  const staffInfo = Array.isArray(rawStaff) ? rawStaff[0] ?? null : rawStaff;
  const guestInfo = Array.isArray(rawGuest) ? rawGuest[0] ?? null : rawGuest;
  const authorName = staffInfo
    ? (staffInfo.full_name?.trim() || 'Personel')
    : guestDisplayName(guestInfo?.full_name, 'Misafir');
  const dept = staffInfo?.department;
  const badge = staffInfo?.verification_badge ?? null;
  const imageUri = post.media_type !== 'text' ? (post.thumbnail_url || post.media_url) : null;
  const mediaUri = post.media_type === 'image' ? post.media_url : (post.thumbnail_url || post.media_url);
  const isVideo = post.media_type === 'video';

  const toggleLike = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Beğenmek için giriş yapın.');
      return;
    }
    setTogglingLike(true);
    try {
      if (myLike) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', post.id).eq('guest_id', guestRow.guest_id);
        setMyLike(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: post.id, guest_id: guestRow.guest_id, reaction: 'like' });
        setMyLike(true);
        setLikeCount((c) => c + 1);
        const displayName = getDisplayName() || 'Bir misafir';
        if (post.staff_id) {
          await sendNotification({ staffId: post.staff_id, title: 'Yeni beğeni', body: `${displayName} paylaşımını beğendi.`, category: 'staff', notificationType: 'feed_like', data: { url: '/staff', postId: post.id } });
        } else if (post.guest_id) {
          await sendNotification({ guestId: post.guest_id, title: 'Yeni beğeni', body: `${displayName} paylaşımını beğendi.`, category: 'guest', notificationType: 'feed_like', data: { url: '/customer', postId: post.id } });
        }
      }
    } catch (e) {}
    setTogglingLike(false);
  };

  const submitComment = async () => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Yorum yapmak için giriş yapın.');
      return;
    }
    const text = commentText.trim();
    if (!text) return;
    setPostingComment(true);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: post.id, guest_id: guestRow.guest_id, content: text })
        .select('id, content, created_at')
        .single();
      setCommentText('');
      const displayName = getDisplayName() || 'Misafir';
      setComments((prev) => [...prev, { id: (inserted as { id: string }).id, content: text, created_at: (inserted as { created_at: string }).created_at, staff: null, guest: { full_name: displayName } }]);
      setCommentCount((c) => c + 1);
      const notifyBody = `${displayName}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      if (post.staff_id) {
        await sendNotification({ staffId: post.staff_id, title: 'Yeni yorum', body: notifyBody, category: 'staff', notificationType: 'feed_comment', data: { url: '/staff', postId: post.id } });
      } else if (post.guest_id) {
        await sendNotification({ guestId: post.guest_id, title: 'Yeni yorum', body: notifyBody, category: 'guest', notificationType: 'feed_comment', data: { url: '/customer', postId: post.id } });
      }
    } catch (e) {}
    setPostingComment(false);
  };

  const deleteOwnComment = async (commentId: string) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) return;
    Alert.alert('Yorumu sil', 'Bu yorum kalıcı olarak silinecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase
            .from('feed_post_comments')
            .delete()
            .eq('id', commentId)
            .eq('guest_id', guestRow.guest_id);
          if (error) {
            Alert.alert('Hata', error.message || 'Yorum silinemedi.');
            return;
          }
          setComments((prev) => prev.filter((c) => c.id !== commentId));
          setCommentCount((c) => Math.max(0, c - 1));
        },
      },
    ]);
  };

  const isOwnGuestPost = !!(post.guest_id && myGuestId && post.guest_id === myGuestId && !post.staff_id);

  const deletePost = async () => {
    if (!isOwnGuestPost || !post) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || post.guest_id !== guestRow.guest_id) return;
    Alert.alert('Paylaşımı sil', 'Bu paylaşım kalıcı olarak silinecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeleting(false);
          if (error) {
            Alert.alert('Hata', error.message || 'Paylaşım silinemedi.');
            return;
          }
          router.replace('/customer');
        },
      },
    ]);
  };

  const hasLocation = (post.lat != null && post.lng != null) || (post.location_label && post.location_label.trim());

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {hasLocation && (
          <View style={styles.locationBar}>
            <Ionicons name="location" size={14} color={theme.colors.primary} />
            <Text style={styles.locationText} numberOfLines={1}>
              {post.location_label?.trim() || '📍 Haritadan paylaşıldı'}
            </Text>
          </View>
        )}
        {imageUri || mediaUri ? (
          isVideo ? (
            <View style={[styles.mediaWrap, { width: winWidth - 32 }]}>
              <Video
                source={{ uri: post.media_url ?? undefined }}
                style={styles.video}
                useNativeControls
                resizeMode="contain"
                isLooping={false}
                onLoad={() => setVideoLoading(false)}
                onError={() => setVideoLoading(false)}
              />
              {videoLoading && (
                <View style={styles.videoLoadingOverlay} pointerEvents="none">
                  <ActivityIndicator size="large" color={theme.colors.primary} />
                  <Text style={styles.videoLoadingText}>Yükleniyor...</Text>
                </View>
              )}
            </View>
          ) : (
            <CachedImage
              uri={mediaUri ?? undefined}
              style={[styles.image, { width: winWidth - 32 }]}
              contentFit="cover"
            />
          )
        ) : (
          <View style={[styles.textOnlyBlock, { width: winWidth - 32 }]}>
            <Text style={styles.textOnlyTitle}>{post.title || 'Metin paylaşımı'}</Text>
          </View>
        )}
        <View style={styles.body}>
          <Text style={styles.title}>{post.title || (isVideo ? 'Video' : post.media_type === 'text' ? 'Metin' : 'Fotoğraf')}</Text>
          <View style={styles.metaRow}>
            {staffInfo ? (
              <>
                <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.metaText} />
                {dept ? <Text style={styles.metaText}> · {dept}</Text> : null}
              </>
            ) : (
              <Text style={styles.metaText}>{authorName}</Text>
            )}
          </View>
          <Text style={styles.date}>{new Date(post.created_at).toLocaleString('tr-TR')}</Text>
          <View style={styles.actionsRow}>
            {user ? (
              <TouchableOpacity style={styles.actionBtn} onPress={toggleLike} disabled={togglingLike} activeOpacity={0.7}>
                {togglingLike ? <ActivityIndicator size="small" color={theme.colors.textMuted} /> : <Ionicons name={myLike ? 'heart' : 'heart-outline'} size={22} color={myLike ? theme.colors.error : theme.colors.text} />}
                <Text style={styles.actionCount}>{likeCount}</Text>
              </TouchableOpacity>
            ) : null}
            <View style={styles.actionBtn}>
              <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text} />
              <Text style={styles.actionCount}>{commentCount}</Text>
            </View>
            {isOwnGuestPost ? (
              <TouchableOpacity style={styles.actionBtn} onPress={deletePost} disabled={deleting} activeOpacity={0.7}>
                {deleting ? <ActivityIndicator size="small" color={theme.colors.error} /> : <Ionicons name="trash-outline" size={22} color={theme.colors.error} />}
                <Text style={[styles.actionCount, styles.deleteActionLabel]}>Sil</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
        {comments.length > 0 ? (
          <View style={styles.commentsBlock}>
            <Text style={styles.commentsTitle}>Yorumlar</Text>
            {comments.map((c) => {
              const isGuestComment = !c.staff_id && !!c.guest_id;
              const cAuthor = isGuestComment
                ? guestDisplayName(c.guest?.full_name, '—')
                : ((c.staff?.full_name ?? '—').trim() || '—');
              const avatarUri = c.staff?.profile_image ?? c.guest?.photo_url ?? null;
              const profileHref = c.staff_id ? `/customer/staff/${c.staff_id}` : c.guest_id ? `/customer/guest/${c.guest_id}` : null;
              const canDelete = !!(myGuestId && c.guest_id && c.guest_id === myGuestId && !c.staff_id);
              return (
                <TouchableOpacity
                  key={c.id}
                  style={styles.commentRow}
                  onPress={() => profileHref && router.push(profileHref)}
                  activeOpacity={profileHref ? 0.7 : 1}
                  disabled={!profileHref}
                >
                  {avatarUri ? (
                    <CachedImage uri={avatarUri} style={styles.commentAvatar} contentFit="cover" />
                  ) : (
                    <View style={isGuestComment ? styles.commentAvatarPlaceholderGuest : styles.commentAvatarPlaceholder}>
                      <Text style={isGuestComment ? styles.commentAvatarInitialGuest : styles.commentAvatarInitial}>{(cAuthor || '—').charAt(0).toUpperCase()}</Text>
                    </View>
                  )}
                  <View style={styles.commentRowBody}>
                    <Text style={styles.commentAuthor}>{cAuthor}</Text>
                    <Text style={styles.commentText}>{c.content}</Text>
                    <View style={styles.commentMetaRow}>
                      <Text style={styles.commentTime}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: tr })}</Text>
                      {canDelete ? (
                        <TouchableOpacity onPress={() => deleteOwnComment(c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={styles.commentDeleteText}>Sil</Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
        {user ? (
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            style={styles.commentInputWrap}
            keyboardVerticalOffset={0}
          >
            <TextInput
              style={styles.commentInput}
              placeholder="Yorum yaz..."
              placeholderTextColor={theme.colors.textMuted}
              value={commentText}
              onChangeText={setCommentText}
              multiline
              maxLength={500}
              editable={!postingComment}
            />
            <TouchableOpacity
              style={[styles.commentSendBtn, (!commentText.trim() || postingComment) && styles.commentSendBtnDisabled]}
              onPress={submitComment}
              disabled={!commentText.trim() || postingComment}
              activeOpacity={0.8}
            >
              {postingComment ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="send" size={20} color="#fff" />}
            </TouchableOpacity>
          </KeyboardAvoidingView>
        ) : null}
      </View>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Ionicons name="arrow-back" size={20} color={theme.colors.primary} />
        <Text style={styles.backBtnText}>Geri</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.backgroundSecondary },
  errorText: { fontSize: 16, color: theme.colors.textMuted, marginBottom: 16 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.lg,
    ...theme.shadows.md,
  },
  locationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: theme.spacing.lg,
    paddingTop: 12,
    paddingBottom: 6,
  },
  locationText: {
    fontSize: 13,
    color: theme.colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  mediaWrap: { aspectRatio: 1, backgroundColor: theme.colors.borderLight },
  video: { width: '100%', height: '100%' },
  videoLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoLoadingText: { marginTop: 8, fontSize: 14, color: theme.colors.textSecondary },
  image: { aspectRatio: 1, backgroundColor: theme.colors.borderLight },
  textOnlyBlock: { padding: theme.spacing.xl, backgroundColor: theme.colors.borderLight + '60', minHeight: 120, justifyContent: 'center' },
  textOnlyTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text },
  body: { padding: theme.spacing.lg },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 },
  metaText: { fontSize: 14, color: theme.colors.textSecondary },
  date: { fontSize: 12, color: theme.colors.textMuted },
  actionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  actionCount: { fontSize: 13, color: theme.colors.textSecondary },
  deleteActionLabel: { color: theme.colors.error },
  commentsBlock: { paddingHorizontal: theme.spacing.lg, paddingBottom: 12, borderTopWidth: 1, borderTopColor: theme.colors.borderLight, paddingTop: 12 },
  commentsTitle: { fontSize: 16, fontWeight: '700', color: theme.colors.text, marginBottom: 10 },
  commentRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarPlaceholder: { width: 32, height: 32, borderRadius: 16, backgroundColor: theme.colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  commentAvatarPlaceholderGuest: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentAvatarInitial: { fontSize: 14, fontWeight: '700', color: theme.colors.textSecondary },
  commentAvatarInitialGuest: { fontSize: 14, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  commentRowBody: { flex: 1, minWidth: 0 },
  commentAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentDeleteText: { fontSize: 12, color: theme.colors.error, fontWeight: '700' },
  commentInputWrap: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: theme.spacing.lg, paddingBottom: 16 },
  commentInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.colors.text, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnDisabled: { opacity: 0.5 },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  backBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.primary },
});
