import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Dimensions,
  TextInput,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Modal,
  FlatList,
  Alert,
  Pressable,
  Animated,
  PanResponder,
} from 'react-native';
import { useRouter, useLocalSearchParams, useFocusEffect, useNavigation } from 'expo-router';
import { Video, Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { CachedImage } from '@/components/CachedImage';
import { formatDistanceToNow } from 'date-fns';
import { sendNotification, notifyAdmins } from '@/lib/notificationService';
import { tr } from 'date-fns/locale';
import { formatDateTime } from '@/lib/date';
import { log } from '@/lib/logger';
import { blockUserForStaff, getHiddenUsersForStaff } from '@/lib/userBlocks';
import { POST_TAGS, type PostTagValue } from '@/lib/feedPostTags';
import { StaffFeedPostCard } from '@/components/StaffFeedPostCard';
import { guestDisplayName } from '@/lib/guestDisplayName';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam / tekrarlayan içerik' },
  { value: 'inappropriate', label: 'Uygunsuz içerik' },
  { value: 'violence', label: 'Şiddet veya tehdit' },
  { value: 'hate', label: 'Nefret söylemi veya ayrımcılık' },
  { value: 'false_info', label: 'Yanıltıcı bilgi' },
  { value: 'other', label: 'Diğer' },
];

function timeAgo(date: string | null | undefined): string {
  if (!date) return '';
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: tr });
  } catch {
    return '';
  }
}

type FeedPostRow = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  post_tag?: string | null;
  staff: { full_name: string | null; department: string | null; profile_image: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
  guest_id?: string | null;
  guest?: { full_name: string | null; photo_url?: string | null } | null;
};

type ViewerRow = {
  id: string;
  staff_id: string | null;
  guest_id: string | null;
  viewed_at: string;
  staff: { full_name: string | null; profile_image: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type CommentRow = {
  id: string;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; verification_badge?: 'blue' | 'yellow' | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type CommentWithPostId = CommentRow & { post_id: string };

type StaffAvatarRow = {
  id: string;
  full_name: string | null;
  profile_image: string | null;
  department: string | null;
  position: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  role?: string | null;
};

type GuestAvatarRow = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
};

export default function StaffHomeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ openPostId?: string }>();
  const { staff } = useAuthStore();
  const [posts, setPosts] = useState<FeedPostRow[]>([]);
  const [staffList, setStaffList] = useState<StaffAvatarRow[]>([]);
  const [guestList, setGuestList] = useState<GuestAvatarRow[]>([]);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CommentRow[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [postingComment, setPostingComment] = useState<string | null>(null);
  const [togglingLike, setTogglingLike] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [viewCounts, setViewCounts] = useState<Record<string, number>>({});
  const [notificationPrefs, setNotificationPrefs] = useState<Set<string>>(new Set());
  const [viewersModalPostId, setViewersModalPostId] = useState<string | null>(null);
  const [viewersList, setViewersList] = useState<ViewerRow[]>([]);
  const [feedTagFilter, setFeedTagFilter] = useState<PostTagValue | null>(null);
  const [guestsExpanded, setGuestsExpanded] = useState(true);
  const [tagFiltersExpanded, setTagFiltersExpanded] = useState(true);
  const [loadingViewers, setLoadingViewers] = useState(false);
  const [togglingNotif, setTogglingNotif] = useState<string | null>(null);
  const [fullscreenPostMedia, setFullscreenPostMedia] = useState<{
    uri: string;
    mediaType: 'image' | 'video';
    postId?: string;
    posterUri?: string;
  } | null>(null);
  const [fullscreenVideoReady, setFullscreenVideoReady] = useState(false);
  const fullscreenVideoRef = useRef<import('expo-av').Video>(null);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<FeedPostRow | null>(null);
  const [reportReason, setReportReason] = useState<string>('');
  const [reportDetails, setReportDetails] = useState<string>('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [commentSheetKeyboardH, setCommentSheetKeyboardH] = useState(0);
  const [playingPreviewId, setPlayingPreviewId] = useState<string | null>(null);

  const COMMENT_SHEET_INITIAL = Platform.OS === 'android' ? SCREEN_HEIGHT * 0.62 : SCREEN_HEIGHT * 0.5;
  const COMMENT_SHEET_MAX = SCREEN_HEIGHT * 0.9;
  const commentSheetHeight = useRef(new Animated.Value(COMMENT_SHEET_INITIAL)).current;
  const commentSheetCurrentH = useRef(COMMENT_SHEET_INITIAL);

  const commentSheetPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_, g) => {
        const newH = commentSheetCurrentH.current - g.dy;
        const clamped = Math.max(COMMENT_SHEET_INITIAL * 0.5, Math.min(COMMENT_SHEET_MAX, newH));
        commentSheetCurrentH.current = clamped;
        commentSheetHeight.setValue(clamped);
      },
      onPanResponderRelease: (_, g) => {
        const h = commentSheetCurrentH.current;
        const vy = g.vy;
        if (h < COMMENT_SHEET_INITIAL * 0.65 || vy > 0.4) {
          setCommentsSheetPostId(null);
          commentSheetCurrentH.current = COMMENT_SHEET_INITIAL;
          commentSheetHeight.setValue(COMMENT_SHEET_INITIAL);
          return;
        }
        const target = vy < -0.2 || h > COMMENT_SHEET_INITIAL * 1.1 ? COMMENT_SHEET_MAX : COMMENT_SHEET_INITIAL;
        commentSheetCurrentH.current = target;
        Animated.spring(commentSheetHeight, {
          toValue: target,
          useNativeDriver: false,
          tension: 80,
          friction: 12,
        }).start();
      },
    })
  ).current;

  useEffect(() => {
    if (commentsSheetPostId) {
      commentSheetCurrentH.current = COMMENT_SHEET_INITIAL;
      commentSheetHeight.setValue(COMMENT_SHEET_INITIAL);
    } else {
      setCommentSheetKeyboardH(0);
    }
  }, [commentsSheetPostId]);

  // Android: yorum kartında klavye açılınca titremeyi önlemek için KeyboardAvoidingView behavior kapatıldı, manuel padding
  useEffect(() => {
    if (Platform.OS !== 'android' || !commentsSheetPostId) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setCommentSheetKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setCommentSheetKeyboardH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [commentsSheetPostId]);

  // Bildirimden tıklanınca yorum kartı açılmaz; gönderi listede görünsün diye etiket filtresi sıfırlanır ve karta kaydırılır
  useEffect(() => {
    const postId = params.openPostId;
    if (postId) {
      setFeedTagFilter(null);
      pendingScrollPostId.current = postId;
      router.setParams({ openPostId: undefined });
    }
  }, [params.openPostId, router]);

  useEffect(() => {
    const id = pendingScrollPostId.current;
    if (!id) return;
    const filtered = feedTagFilter ? posts.filter((p) => (p.post_tag ?? null) === feedTagFilter) : posts;
    if (!filtered.some((p) => p.id === id)) {
      const t = setTimeout(() => {
        if (pendingScrollPostId.current === id) pendingScrollPostId.current = null;
      }, 2500);
      return () => clearTimeout(t);
    }
    const attempt = () => {
      if (pendingScrollPostId.current !== id) return;
      const y = postYRef.current[id];
      if (y != null && scrollRef.current) {
        scrollRef.current.scrollTo({ y: Math.max(0, y - 20), animated: true });
        pendingScrollPostId.current = null;
      }
    };
    const raf = requestAnimationFrame(attempt);
    const t1 = setTimeout(attempt, 80);
    const t2 = setTimeout(attempt, 250);
    const t3 = setTimeout(attempt, 600);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [posts, feedTagFilter]);

  const loadStaffList = useCallback(async (hiddenStaffIds?: Set<string>) => {
    const { data } = await supabase
      .from('staff')
      .select('id, full_name, profile_image, department, position, verification_badge, email, role')
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('full_name');
    const rows = (data ?? []) as (StaffAvatarRow & { email?: string | null })[];
    const byKey = new Map<string, (StaffAvatarRow & { email?: string | null })>();
    rows.forEach((r) => {
      const key = (r.email && r.email.trim()) ? r.email.trim().toLowerCase() : r.id;
      if (!byKey.has(key)) byKey.set(key, r);
    });
    const mapped = Array.from(byKey.values()).map(
      ({ id, full_name, profile_image, department, position, verification_badge, role }) => ({
        id,
        full_name,
        profile_image,
        department,
        position,
        verification_badge,
        role,
      })
    );
    const visible = mapped.filter((s) => !hiddenStaffIds?.has(s.id));
    setStaffList(
      sortStaffAdminFirst(visible, (a, b) =>
        (a.full_name || '').localeCompare(b.full_name || '', 'tr')
      )
    );
  }, []);

  const loadFeed = useCallback(async () => {
    if (!staff) return;
    const hidden = await getHiddenUsersForStaff(staff.id);
    loadStaffList(hidden.hiddenStaffIds);
    const [{ data: postsData }, guestsRes] = await Promise.all([
      supabase
        .from('feed_posts')
        .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, post_tag, staff:staff_id(full_name, department, profile_image, verification_badge, deleted_at), guest_id, guest:guest_id(full_name, photo_url, deleted_at)')
        .or('visibility.eq.all_staff,visibility.eq.my_team,visibility.eq.customers')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('guests')
        .select('id, full_name, photo_url, banned_until')
        .not('auth_user_id', 'is', null)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(30),
    ]);
    const now = new Date().toISOString();
    const allGuests = ((guestsRes.data ?? []) as (GuestAvatarRow & { banned_until?: string | null })[]).filter(
      (g) => !hidden.hiddenGuestIds.has(g.id) && (!g.banned_until || g.banned_until < now)
    );
    setGuestList(allGuests.map(({ banned_until: _, ...g }) => g));
    const list = ((postsData ?? []) as FeedPostRow[]).filter(
      (p) =>
        !(p.staff_id && hidden.hiddenStaffIds.has(p.staff_id)) &&
        !(p.guest_id && hidden.hiddenGuestIds.has(p.guest_id)) &&
        !(p.staff_id && (p.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(p.guest_id && (p.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    if (!mountedRef.current) return;
    setPosts(list);
    setPlayingPreviewId(list.find((p) => p.media_type === 'video')?.id ?? null);
    const ids = list.map((p) => p.id);
    if (ids.length === 0) {
      setLikeCounts({});
      setCommentCounts({});
      setViewCounts({});
      setMyLikes(new Set());
      setNotificationPrefs(new Set());
      setCommentsByPost({});
      return;
    }
    const [reactionsRes, commentsRes, myReactionsRes, viewCountsRes, notifPrefsRes] = await Promise.all([
      supabase.from('feed_post_reactions').select('post_id').in('post_id', ids),
      supabase.from('feed_post_comments').select('post_id, id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, verification_badge, profile_image, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)').in('post_id', ids).order('created_at', { ascending: true }),
      supabase.from('feed_post_reactions').select('post_id').in('post_id', ids).eq('staff_id', staff.id),
      supabase.rpc('get_feed_post_view_counts', { post_ids: ids }),
      supabase.from('feed_post_notification_prefs').select('post_id').eq('staff_id', staff.id).in('post_id', ids),
    ]);
    if (!mountedRef.current) return;
    const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
    const comments = (commentsRes.data ?? []) as CommentWithPostId[];
    const myReactions = (myReactionsRes.data ?? []) as { post_id: string }[];
    if (viewCountsRes.error) {
      log.warn('get_feed_post_view_counts RPC error', viewCountsRes.error);
    }
    const viewCountRows = (viewCountsRes.data ?? []) as { post_id: string; view_count: number }[];
    const notifPrefs = (notifPrefsRes.data ?? []) as { post_id: string }[];
    const likeCount: Record<string, number> = {};
    reactions.forEach((r) => {
      likeCount[r.post_id] = (likeCount[r.post_id] ?? 0) + 1;
    });
    const viewCount: Record<string, number> = {};
    viewCountRows.forEach((row: { post_id: string; view_count?: number; viewCount?: number }) => {
      const pid = row.post_id != null ? String(row.post_id) : '';
      const cnt = row.view_count ?? row.viewCount ?? 0;
      if (pid) viewCount[pid] = Number(cnt) || 0;
    });
    const commentCount: Record<string, number> = {};
    const byPost: Record<string, CommentRow[]> = {};
    comments.forEach((c) => {
      if ((c.staff_id && hidden.hiddenStaffIds.has(c.staff_id)) || (c.guest_id && hidden.hiddenGuestIds.has(c.guest_id))) return;
      if ((c.staff_id && (c.staff as { deleted_at?: string | null } | null)?.deleted_at) || (c.guest_id && (c.guest as { deleted_at?: string | null } | null)?.deleted_at)) return;
      commentCount[c.post_id] = (commentCount[c.post_id] ?? 0) + 1;
      if (!byPost[c.post_id]) byPost[c.post_id] = [];
      byPost[c.post_id].push({
        id: c.id,
        staff_id: c.staff_id ?? null,
        guest_id: c.guest_id ?? null,
        content: c.content,
        created_at: c.created_at,
        staff: c.staff,
        guest: c.guest,
      });
    });
    setLikeCounts(likeCount);
    setCommentCounts(commentCount);
    setViewCounts(viewCount);
    setMyLikes(new Set(myReactions.map((r) => r.post_id)));
    setNotificationPrefs(new Set(notifPrefs.map((n) => n.post_id)));
    setCommentsByPost(byPost);
    const viewRows = ids.map((post_id) => ({ post_id, staff_id: staff.id }));
    supabase.from('feed_post_views').upsert(viewRows, { onConflict: 'post_id,staff_id', ignoreDuplicates: true }).then(() => {});
  }, [staff?.id, loadStaffList]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed]);

  useEffect(() => {
    if (fullscreenPostMedia?.mediaType === 'video') setFullscreenVideoReady(false);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!fullscreenPostMedia || fullscreenPostMedia.mediaType !== 'video') return;
    const t = setTimeout(() => {
      fullscreenVideoRef.current?.playAsync().catch(() => {});
      fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  useFocusEffect(
    useCallback(() => {
      if (staff?.id) loadFeed();
    }, [staff?.id, loadFeed])
  );

  useEffect(() => {
    const channel = supabase
      .channel('feed_posts_changes')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'feed_posts' },
        () => { loadFeed(); }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'feed_posts' },
        () => { loadFeed(); }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadFeed]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadFeed();
    setRefreshing(false);
  }, [loadFeed]);

  const toggleLike = async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    if (!staff) return;
    setTogglingLike(postId);
    try {
      const liked = myLikes.has(postId);
      if (liked) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', postId).eq('staff_id', staff.id);
        setMyLikes((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: postId, staff_id: staff.id, reaction: 'like' });
        setMyLikes((prev) => new Set(prev).add(postId));
        setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
        if (authorStaffId && authorStaffId !== staff.id) {
          const res = await sendNotification({
            staffId: String(authorStaffId),
            title: 'Yeni beğeni',
            body: `${staff.full_name ?? 'Bir çalışan'} paylaşımını beğendi.`,
            category: 'staff',
            notificationType: 'feed_like',
            data: { screen: 'staff_feed', url: '/staff', postId },
          });
          if (res?.error) log.warn('StaffFeed', 'Beğeni bildirimi', res.error);
        } else if (authorGuestId) {
          const res = await sendNotification({
            guestId: authorGuestId,
            title: 'Yeni beğeni',
            body: `${staff.full_name ?? 'Bir çalışan'} paylaşımını beğendi.`,
            category: 'guest',
            notificationType: 'feed_like',
            data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
          });
          if (res?.error) log.warn('StaffFeed', 'Beğeni bildirimi (misafir)', res.error);
        }
      }
    } catch (e) {
      // ignore
    }
    setTogglingLike(null);
  };

  const submitComment = async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const text = (commentText[postId] ?? '').trim();
    if (!staff || !text) return;
    setPostingComment(postId);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: postId, staff_id: staff.id, content: text })
        .select('id, content, created_at, staff_id')
        .single();
      setCommentText((prev) => ({ ...prev, [postId]: '' }));
      const newComment: CommentRow = {
        id: (inserted as { id: string }).id,
        content: text,
        created_at: (inserted as { created_at: string }).created_at,
        staff: { full_name: staff.full_name },
        guest: null,
      };
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), newComment],
      }));
      setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
      const notifyBody = `${staff.full_name ?? 'Bir çalışan'}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      if (authorStaffId && authorStaffId !== staff.id) {
        const res = await sendNotification({
          staffId: String(authorStaffId),
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        });
        if (res?.error) log.warn('StaffFeed', 'Yorum bildirimi', res.error);
      } else if (authorGuestId) {
        const res = await sendNotification({
          guestId: authorGuestId,
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'guest',
          notificationType: 'feed_comment',
          data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
        });
        if (res?.error) log.warn('StaffFeed', 'Yorum bildirimi (misafir)', res.error);
      }
      let prefQ = supabase.from('feed_post_notification_prefs').select('staff_id').eq('post_id', postId).neq('staff_id', staff.id);
      if (authorStaffId) prefQ = prefQ.neq('staff_id', authorStaffId);
      const { data: prefRows } = await prefQ;
      const staffIdsToNotify = (prefRows ?? []).map((r: { staff_id: string }) => r.staff_id);
      for (const sid of staffIdsToNotify) {
        sendNotification({
          staffId: sid,
          title: 'Yeni yorum (takip ettiğin paylaşım)',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        }).catch(() => {});
      }
    } catch (e) {
      // ignore
    }
    setPostingComment(null);
  };

  const openViewersModal = async (postId: string) => {
    setViewersModalPostId(postId);
    setLoadingViewers(true);
    setViewersList([]);
    const { data } = await supabase
      .from('feed_post_views')
      .select('id, staff_id, guest_id, viewed_at, staff:staff_id(full_name, profile_image, verification_badge, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)')
      .eq('post_id', postId)
      .order('viewed_at', { ascending: false });
    const rows = (data ?? []) as ViewerRow[];
    const filtered = rows.filter(
      (v) =>
        !(v.staff_id && (v.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(v.guest_id && (v.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    setViewersList(filtered);
    setLoadingViewers(false);
  };

  const toggleNotificationPref = async (postId: string) => {
    if (!staff) return;
    setTogglingNotif(postId);
    const isOn = notificationPrefs.has(postId);
    try {
      if (isOn) {
        await supabase.from('feed_post_notification_prefs').delete().eq('post_id', postId).eq('staff_id', staff.id);
        setNotificationPrefs((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
      } else {
        await supabase.from('feed_post_notification_prefs').upsert(
          { post_id: postId, staff_id: staff.id },
          { onConflict: 'post_id,staff_id' }
        );
        setNotificationPrefs((prev) => new Set(prev).add(postId));
      }
    } catch (e) {
      // ignore
    }
    setTogglingNotif(null);
  };

  const isAdmin = staff?.role === 'admin';
  const canDeletePost = (post: FeedPostRow) => staff && (staff.id === post.staff_id || isAdmin);
  const canDeleteComment = (c: CommentRow) =>
    !!staff && (isAdmin || (!!c.staff_id && c.staff_id === staff.id));

  const deleteComment = (postId: string, commentId: string) => {
    if (!staff) return;
    Alert.alert('Yorumu sil', 'Bu yorum kalıcı olarak silinecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('feed_post_comments').delete().eq('id', commentId);
          if (error) {
            Alert.alert('Hata', error.message || 'Yorum silinemedi.');
            return;
          }
          setCommentsByPost((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
          }));
          setCommentCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
        },
      },
    ]);
  };

  const handleDeletePost = (post: FeedPostRow) => {
    setMenuPostId(null);
    if (!canDeletePost(post)) return;
    Alert.alert(
      'Paylaşımı sil',
      'Bu paylaşımı silmek istediğinize emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingPostId(post.id);
            try {
              const { data, error } = await supabase
                .from('feed_posts')
                .delete()
                .eq('id', post.id)
                .select('id');
              if (error) {
                Alert.alert('Hata', error.message || 'Paylaşım silinemedi.');
                return;
              }
              if (data && data.length > 0) {
                setPosts((prev) => prev.filter((p) => p.id !== post.id));
              } else {
                Alert.alert('Hata', 'Paylaşım silinemedi. Yetkiniz olmayabilir.');
              }
            } catch (e) {
              Alert.alert('Hata', (e as Error).message || 'Bir hata oluştu.');
            } finally {
              setDeletingPostId(null);
            }
          },
        },
      ]
    );
  };

  const openReportModal = (post: FeedPostRow) => {
    setMenuPostId(null);
    setReportPost(post);
    setReportReason('');
    setReportDetails('');
  };

  const handleBlockPostAuthor = (post: FeedPostRow) => {
    if (!staff?.id) return;
    const blockedType = post.staff_id ? 'staff' : post.guest_id ? 'guest' : null;
    const blockedId = post.staff_id ?? post.guest_id ?? null;
    if (!blockedType || !blockedId) return;
    if (blockedType === 'staff' && blockedId === staff.id) {
      Alert.alert('Uyarı', 'Kendinizi engelleyemezsiniz.');
      return;
    }
    const targetName = post.staff_id
      ? ((post.staff as { full_name?: string | null } | null)?.full_name?.trim() || 'Bu kullanıcı')
      : guestDisplayName((post.guest as { full_name?: string | null } | null)?.full_name, 'Bu kullanıcı');
    Alert.alert('Kullanıcıyı engelle', `${targetName} artık sizi göremez ve siz de onu göremezsiniz.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForStaff({
            blockerStaffId: staff.id,
            blockedType,
            blockedId,
          });
          if (error && error.code !== '23505') {
            Alert.alert('Hata', error.message || 'Kullanıcı engellenemedi.');
            return;
          }
          setMenuPostId(null);
          await loadFeed();
        },
      },
    ]);
  };

  const submitReport = async () => {
    if (!reportPost || !staff || !reportReason.trim()) return;
    const reasonLabel = REPORT_REASONS.find((r) => r.value === reportReason)?.label ?? reportReason;
    setSubmittingReport(true);
    try {
      const postTitle = (reportPost.title ?? '').trim() || 'Paylaşım';
      const reporterName = staff.full_name ?? 'Bir çalışan';
      const body = `${reporterName}: "${postTitle}" — ${reasonLabel}${reportDetails.trim() ? ` — ${reportDetails.trim()}` : ''}`;
      const { error: insertErr } = await supabase.from('feed_post_reports').insert({
        post_id: reportPost.id,
        reporter_staff_id: staff.id,
        reason: reportReason,
        details: reportDetails.trim() || null,
        status: 'pending',
      });
      if (insertErr) {
        setSubmittingReport(false);
        Alert.alert('Hata', 'Bildirim kaydedilemedi. Lütfen tekrar deneyin.');
        return;
      }
      await notifyAdmins({
        title: 'Paylaşım bildirimi',
        body,
        data: {
          url: '/admin/reports',
          screen: 'admin',
          postId: reportPost.id,
          reason: reportReason,
          reporterStaffId: staff.id,
        },
      });
      setReportPost(null);
      setReportReason('');
      setReportDetails('');
      Alert.alert(
        'Bildiriminiz alındı',
        'Şikayetiniz yönetime iletildi. 24 saat içinde dönüş yapılacaktır.',
        [{ text: 'Tamam' }]
      );
    } catch (e) {
      Alert.alert('Hata', 'Bildirim gönderilemedi. Lütfen tekrar deneyin.');
    }
    setSubmittingReport(false);
  };

  const scrollRef = useRef<ScrollView>(null);
  const postYRef = useRef<Record<string, number>>({});
  const pendingScrollPostId = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);
  const navigation = useNavigation();
  useEffect(() => {
    const parent = navigation.getParent();
    const unsub = parent?.addListener?.('tabPress', () => {
      scrollRef.current?.scrollTo({ y: 0, animated: true });
    });
    return () => (typeof unsub === 'function' ? unsub() : undefined);
  }, [navigation]);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.white} />
        }
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.staffAvatarsSection}>
          <Text style={styles.staffAvatarsSectionLabel}>Personeller</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.staffAvatarsContent}
          >
            {staffList.map((s) => {
              const name = s.full_name || '—';
              return (
                <TouchableOpacity
                  key={s.id}
                  style={styles.staffAvatarCard}
                  onPress={() => router.push(`/staff/profile/${s.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.staffAvatarCardInner}>
                    <View style={styles.staffAvatarRing}>
                      <AvatarWithBadge badge={s.verification_badge ?? null} avatarSize={60} badgeSize={14} showBadge={false}>
                        {s.profile_image ? (
                          <CachedImage uri={s.profile_image} style={styles.staffAvatarImg} contentFit="cover" />
                        ) : (
                          <View style={styles.staffAvatarPlaceholder}>
                            <Text style={styles.staffAvatarLetter}>{name.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                      </AvatarWithBadge>
                    </View>
                    <StaffNameWithBadge name={name} badge={s.verification_badge ?? null} textStyle={styles.staffAvatarName} />
                    {(s.department || s.position) ? (
                      <Text style={styles.staffAvatarRole} numberOfLines={1}>{s.department || s.position || ''}</Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        <View style={styles.guestAvatarsSection}>
          <TouchableOpacity style={styles.collapseHeader} onPress={() => setGuestsExpanded(!guestsExpanded)} activeOpacity={0.7}>
            <Text style={styles.guestAvatarsSectionLabel}>Misafirler</Text>
            <Ionicons name={guestsExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          {guestsExpanded && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.guestAvatarsContent}
            >
              {guestList.map((g) => {
                const name = guestDisplayName(g.full_name, 'Misafir');
                const firstName = name.split(' ')[0] || 'Misafir';
                return (
                  <TouchableOpacity
                    key={`guest-${g.id}`}
                    style={styles.guestAvatarCard}
                    onPress={() => router.push(`/staff/guests/${g.id}`)}
                    activeOpacity={0.85}
                  >
                    <View style={styles.guestAvatarCardInner}>
                      <View style={styles.guestAvatarRing}>
                        {g.photo_url ? (
                          <CachedImage uri={g.photo_url} style={styles.guestAvatarImg} contentFit="cover" />
                        ) : (
                          <View style={styles.guestAvatarPlaceholder}>
                            <Text style={styles.guestAvatarLetter}>{firstName.charAt(0).toUpperCase()}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.guestAvatarName} numberOfLines={1}>{firstName}</Text>
                      <Text style={styles.guestAvatarRole} numberOfLines={1}>Misafir</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.collapseTagSection}>
          <TouchableOpacity style={styles.collapseHeader} onPress={() => setTagFiltersExpanded(!tagFiltersExpanded)} activeOpacity={0.7}>
            <Text style={styles.collapseLabel}>Etiket filtreleri</Text>
            <Ionicons name={tagFiltersExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.primary} />
          </TouchableOpacity>
          {tagFiltersExpanded && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.feedTagFilters} contentContainerStyle={styles.feedTagFiltersContent}>
          <TouchableOpacity
            style={[styles.feedTagBtn, !feedTagFilter && styles.feedTagBtnActive]}
            onPress={() => setFeedTagFilter(null)}
            activeOpacity={0.7}
          >
            <Text style={[styles.feedTagBtnText, !feedTagFilter && styles.feedTagBtnTextActive]}>Tümü</Text>
          </TouchableOpacity>
          {POST_TAGS.map((tag) => (
            <TouchableOpacity
              key={tag.value}
              style={[styles.feedTagBtn, feedTagFilter === tag.value && styles.feedTagBtnActive]}
              onPress={() => setFeedTagFilter(feedTagFilter === tag.value ? null : tag.value)}
              activeOpacity={0.7}
            >
              <Text style={[styles.feedTagBtnText, feedTagFilter === tag.value && styles.feedTagBtnTextActive]}>{tag.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
          )}
        </View>

        {(() => {
          const filtered = feedTagFilter ? posts.filter((p) => (p.post_tag ?? null) === feedTagFilter) : posts;
          if (filtered.length === 0) {
            return (
              <View style={styles.empty}>
                <Ionicons name="images-outline" size={64} color={theme.colors.textMuted} />
                <Text style={styles.emptyText}>
                  {feedTagFilter ? `${POST_TAGS.find((tg) => tg.value === feedTagFilter)?.label ?? feedTagFilter} etiketli paylaşım yok.` : 'Henüz paylaşım yok'}
                </Text>
                {!feedTagFilter && (
                  <TouchableOpacity style={styles.emptyBtn} onPress={() => router.push('/staff/feed/new')} activeOpacity={0.8}>
                    <Text style={styles.emptyBtnText}>İlk paylaşımı yap</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          }
          return filtered.map((p) => {
            const likeCount = likeCounts[p.id] ?? 0;
            const commentCount = commentCounts[p.id] ?? 0;
            const viewCount = viewCounts[p.id] ?? 0;
            const liked = myLikes.has(p.id);
            const notifOn = notificationPrefs.has(p.id);
            const comments = commentsByPost[p.id] ?? [];
            const staffInfo = p.staff as {
              full_name?: string;
              profile_image?: string;
              department?: string | null;
              position?: string | null;
              verification_badge?: 'blue' | 'yellow' | null;
            } | null;
            const rawGuest = p.guest;
            const guestInfo = Array.isArray(rawGuest) ? (rawGuest[0] as { full_name?: string | null; photo_url?: string | null } | null) : (rawGuest as { full_name?: string | null; photo_url?: string | null } | null);
            const isGuestPost = !p.staff_id;
            const authorName = isGuestPost
              ? guestDisplayName(guestInfo?.full_name, 'Misafir')
              : (staffInfo?.full_name?.trim() || '—');
            const authorAvatar = staffInfo?.profile_image ?? guestInfo?.photo_url ?? null;
            const authorBadge = staffInfo?.verification_badge ?? null;
            const roleLabel = isGuestPost ? 'Misafir' : (staffInfo?.department || staffInfo?.position || null);
            const hasMedia = p.media_type !== 'text' && !!(p.thumbnail_url || p.media_url);
            const mediaEl =
              hasMedia ? (
                <TouchableOpacity
                  activeOpacity={1}
                  onPress={() => {
                    const isVideo = p.media_type === 'video';
                    if (isVideo) {
                      setFullscreenPostMedia({
                        uri: p.media_url || p.thumbnail_url || '',
                        mediaType: 'video',
                        postId: p.id,
                        posterUri: p.thumbnail_url || p.media_url || undefined,
                      });
                    } else {
                      setFullscreenPostMedia({
                        uri: p.thumbnail_url || p.media_url || '',
                        mediaType: 'image',
                        postId: p.id,
                      });
                    }
                  }}
                >
                  <View style={styles.postImageWrap}>
                    {p.media_type === 'video' ? (
                      <Video
                        source={{ uri: p.media_url || p.thumbnail_url || '' }}
                        style={styles.postImage}
                        resizeMode="cover"
                        muted
                        shouldPlay={false}
                        useNativeControls={false}
                      />
                    ) : (
                      <CachedImage uri={p.thumbnail_url || p.media_url || ''} style={styles.postImage} contentFit="cover" />
                    )}
                  </View>
                </TouchableOpacity>
              ) : null;

            return (
              <View key={p.id}>
                <StaffFeedPostCard
                  postTag={p.post_tag}
                  authorName={authorName}
                  authorAvatarUrl={authorAvatar}
                  authorBadge={authorBadge}
                  isGuestPost={isGuestPost}
                  roleLabel={roleLabel}
                  timeAgo={timeAgo(p.created_at) || 'şimdi'}
                  createdAtLabel={formatDateTime(p.created_at)}
                  title={p.title}
                  media={mediaEl}
                  hasMedia={!!hasMedia}
                  liked={liked}
                  likeCount={likeCount}
                  commentCount={commentCount}
                  viewCount={viewCount}
                  notifOn={notifOn}
                  togglingLike={togglingLike === p.id}
                  togglingNotif={togglingNotif === p.id}
                  deletingPost={deletingPostId === p.id}
                  onAuthorPress={p.staff_id ? () => router.push(`/staff/profile/${p.staff_id}`) : undefined}
                  onLike={() => toggleLike(p.id, p.staff_id, p.guest_id ?? null)}
                  onComment={() => setCommentsSheetPostId(commentsSheetPostId === p.id ? null : p.id)}
                  onViewers={() => openViewersModal(p.id)}
                  onNotif={() => toggleNotificationPref(p.id)}
                  onMenu={() => setMenuPostId(menuPostId === p.id ? null : p.id)}
                  onLayout={(y) => {
                    postYRef.current[p.id] = y;
                  }}
                />
                {/* Menü modal: Sil / Bildir */}
                <Modal
                  visible={menuPostId === p.id}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setMenuPostId(null)}
                >
                  <Pressable style={styles.menuModalOverlay} onPress={() => setMenuPostId(null)}>
                    <View style={styles.menuModalBox}>
                      {canDeletePost(p) && (
                        <TouchableOpacity
                          style={styles.menuModalItem}
                          onPress={() => handleDeletePost(p)}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="trash-outline" size={22} color={theme.colors.error} />
                          <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>Sil</Text>
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => handleBlockPostAuthor(p)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ban-outline" size={22} color={theme.colors.error} />
                        <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>Engelle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => openReportModal(p)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
                        <Text style={styles.menuModalItemText}>Bildir</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
              </View>
            );
          });
        })()}
        <View style={styles.bottomSpacer} />
      </ScrollView>

      {/* Bildir modal: sebep seçenekleri + açıklama */}
      <Modal
        visible={!!reportPost}
        animationType="slide"
        transparent
        onRequestClose={() => setReportPost(null)}
      >
        <Pressable style={styles.reportModalOverlay} onPress={() => setReportPost(null)}>
          <Pressable style={styles.reportModalContent} onPress={(e) => e.stopPropagation()}>
            <View style={styles.reportModalHeader}>
              <Text style={styles.reportModalTitle}>Paylaşımı bildir</Text>
              <TouchableOpacity onPress={() => setReportPost(null)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.reportModalScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={styles.reportModalSubtitle}>Bildirim sebebi (zorunlu)</Text>
              {REPORT_REASONS.map((r) => (
                <TouchableOpacity
                  key={r.value}
                  style={[styles.reportReasonRow, reportReason === r.value && styles.reportReasonRowSelected]}
                  onPress={() => setReportReason(r.value)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={reportReason === r.value ? 'radio-button-on' : 'radio-button-off'}
                    size={22}
                    color={reportReason === r.value ? theme.colors.primary : theme.colors.textMuted}
                  />
                  <Text style={styles.reportReasonLabel}>{r.label}</Text>
                </TouchableOpacity>
              ))}
              <Text style={styles.reportModalSubtitle}>Ek açıklama (isteğe bağlı)</Text>
              <TextInput
                style={styles.reportDetailsInput}
                placeholder="Detay yazabilirsiniz..."
                placeholderTextColor={theme.colors.textMuted}
                value={reportDetails}
                onChangeText={setReportDetails}
                multiline
                maxLength={300}
                editable={!submittingReport}
              />
              <TouchableOpacity
                style={[styles.reportSubmitBtn, (!reportReason.trim() || submittingReport) && styles.reportSubmitBtnDisabled]}
                onPress={submitReport}
                disabled={!reportReason.trim() || submittingReport}
                activeOpacity={0.8}
              >
                {submittingReport ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <Text style={styles.reportSubmitBtnText}>Gönder</Text>
                )}
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!viewersModalPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setViewersModalPostId(null)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setViewersModalPostId(null)}
        >
          <View
            style={[styles.viewersModalContent, { height: SCREEN_HEIGHT * 0.5 }]}
            onStartShouldSetResponder={() => true}
          >
            <View style={styles.viewersModalHeader}>
              <Text style={styles.viewersModalTitle}>Görenler</Text>
              <TouchableOpacity onPress={() => setViewersModalPostId(null)} hitSlop={16}>
                <Ionicons name="close" size={28} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {loadingViewers ? (
              <ActivityIndicator size="large" color={theme.colors.primary} style={styles.viewersLoader} />
            ) : (
              <View style={styles.viewersListWrap}>
                <FlatList
                  data={viewersList}
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={<Text style={styles.viewersEmpty}>Henüz görüntüleyen yok</Text>}
                  renderItem={({ item }) => {
                    const v = item as ViewerRow;
                    const staffData = v.staff as { full_name?: string; profile_image?: string; verification_badge?: 'blue' | 'yellow' | null } | null;
                    const guestData = v.guest as { full_name?: string | null; photo_url?: string | null } | null;
                    const name = v.guest_id
                      ? guestDisplayName(guestData?.full_name, '—')
                      : (staffData?.full_name?.trim() || '—');
                    const img = staffData?.profile_image ?? guestData?.photo_url ?? null;
                    const badge = staffData?.verification_badge ?? null;
                    const isGuest = !!v.guest_id;
                    return (
                      <View style={styles.viewerRow}>
                        <AvatarWithBadge badge={badge} avatarSize={44} badgeSize={12} showBadge={false}>
                          {img ? (
                            <CachedImage uri={img} style={styles.viewerAvatar} contentFit="cover" />
                          ) : (
                            <View style={[styles.viewerAvatar, isGuest ? styles.viewerAvatarLetterGuest : styles.viewerAvatarLetter]}>
                              <Text style={styles.viewerAvatarText}>{name.charAt(0).toUpperCase()}</Text>
                            </View>
                          )}
                        </AvatarWithBadge>
                        <View style={styles.viewerInfo}>
                          {isGuest ? (
                            <Text style={styles.viewerName}>{name}</Text>
                          ) : (
                            <StaffNameWithBadge name={name} badge={badge} textStyle={styles.viewerName} />
                          )}
                          <Text style={styles.viewerTime}>{formatDateTime(v.viewed_at)}</Text>
                        </View>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Yorum kartı: ekranın yarısına kadar açılır, aşağı yukarı kaydırılabilir; Android'de klavye yüksekliği manuel padding ile (titreme önlenir) */}
      <Modal
        visible={!!commentsSheetPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsSheetPostId(null)}
      >
        <KeyboardAvoidingView
          style={styles.commentSheetOverlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={0}
        >
          <TouchableOpacity style={StyleSheet.absoluteFill} activeOpacity={1} onPress={() => setCommentsSheetPostId(null)} />
          <Animated.View
            style={[
              styles.commentSheetCard,
              { height: commentSheetHeight },
              Platform.OS === 'android' && commentSheetKeyboardH > 0 && { paddingBottom: commentSheetKeyboardH + 16 },
            ]}
            onStartShouldSetResponder={() => true}
          >
            <Pressable style={styles.commentSheetHandleWrap} {...commentSheetPanResponder.panHandlers}>
              <View style={styles.commentSheetHandle} />
            </Pressable>
            <View style={styles.commentSheetHeader}>
              <Text style={styles.commentSheetTitle}>Yorumlar</Text>
              <TouchableOpacity onPress={() => setCommentsSheetPostId(null)} hitSlop={16}>
                <Ionicons name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            {commentsSheetPostId && (() => {
              const post = posts.find((x) => x.id === commentsSheetPostId);
              const comments = commentsByPost[commentsSheetPostId] ?? [];
              if (!post) return null;
              return (
                <>
                  <ScrollView
                    style={styles.commentSheetScroll}
                    contentContainerStyle={styles.commentSheetScrollContent}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                  >
                    {comments.length === 0 ? (
                      <Text style={styles.commentSheetEmpty}>Henüz yorum yok. İlk yorumu sen yap.</Text>
                    ) : (
                      comments.map((c) => {
                        const isGuestComment = !c.staff_id && !!c.guest_id;
                        const authorName = isGuestComment
                          ? guestDisplayName((c.guest as { full_name?: string | null } | null)?.full_name, '—')
                          : ((c.staff as { full_name?: string } | null)?.full_name?.trim() || '—');
                        const badge = (c.staff as { verification_badge?: 'blue' | 'yellow' | null } | null)?.verification_badge ?? null;
                        const avatarUri = (c.staff as { profile_image?: string | null } | null)?.profile_image ?? (c.guest as { photo_url?: string | null } | null)?.photo_url ?? null;
                        const profileHref = c.staff_id ? `/staff/profile/${c.staff_id}` : c.guest_id ? `/staff/guests/${c.guest_id}` : null;
                        const deletable = canDeleteComment(c);
                        return (
                          <TouchableOpacity
                            key={c.id}
                            style={styles.commentSheetRow}
                            onPress={() => profileHref && router.push(profileHref)}
                            activeOpacity={profileHref ? 0.7 : 1}
                            disabled={!profileHref}
                          >
                            {avatarUri ? (
                              <CachedImage uri={avatarUri} style={styles.commentSheetAvatar} contentFit="cover" />
                            ) : (
                              <View style={isGuestComment ? styles.commentSheetAvatarPlaceholderGuest : styles.commentSheetAvatarPlaceholder}>
                                <Text style={isGuestComment ? styles.commentSheetAvatarInitialGuest : styles.commentSheetAvatarInitial}>{(authorName || '—').charAt(0).toUpperCase()}</Text>
                              </View>
                            )}
                            <View style={styles.commentSheetRowBody}>
                              {c.staff ? (
                                <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.commentSheetAuthor} />
                              ) : (
                                <Text style={styles.commentSheetAuthor}>{authorName}</Text>
                              )}
                              <Text style={styles.commentSheetText}>{c.content}</Text>
                              <View style={styles.commentSheetMetaRow}>
                                <Text style={styles.commentSheetTime}>{timeAgo(c.created_at)}</Text>
                                {deletable ? (
                                  <TouchableOpacity onPress={() => deleteComment(post.id, c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={styles.commentDeleteText}>Sil</Text>
                                  </TouchableOpacity>
                                ) : null}
                              </View>
                            </View>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </ScrollView>
                  <View style={styles.commentSheetInputRow}>
                    <TextInput
                      style={styles.commentSheetInput}
                      placeholder="Yorum yaz..."
                      placeholderTextColor={theme.colors.textMuted}
                      value={commentText[post.id] ?? ''}
                      onChangeText={(t) => setCommentText((prev) => ({ ...prev, [post.id]: t }))}
                      multiline
                      maxLength={500}
                      editable={postingComment !== post.id}
                    />
                    <TouchableOpacity
                      style={[styles.commentSendBtn, (!(commentText[post.id] ?? '').trim() || postingComment === post.id) && styles.commentSendBtnDisabled]}
                      onPress={() => submitComment(post.id, post.staff_id, post.guest_id ?? null)}
                      disabled={!(commentText[post.id] ?? '').trim() || postingComment === post.id}
                      activeOpacity={0.8}
                    >
                      {postingComment === post.id ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Ionicons name="send" size={20} color="#fff" />
                      )}
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* Gönderi medyası tam ekran: yükleme çubuğu, sol/sağ tıkla sarma, yorum kartı birlikte açılır */}
      <Modal
        visible={!!fullscreenPostMedia}
        transparent
        animationType="fade"
        onRequestClose={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }}
      >
        <Pressable
          style={[styles.fullscreenOverlay, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
          onPress={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }}
        >
          {fullscreenPostMedia ? (
            <>
              <View style={styles.fullscreenImageWrap} pointerEvents="box-none">
                {fullscreenPostMedia.mediaType === 'video' ? (
                  <>
                    <Video
                      key={fullscreenPostMedia.uri}
                      ref={fullscreenVideoRef}
                      source={{ uri: fullscreenPostMedia.uri }}
                      usePoster={false}
                      style={[styles.fullscreenImage, styles.fullscreenVideo, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
                      useNativeControls={false}
                      resizeMode="contain"
                      isLooping={false}
                      shouldPlay
                      isMuted={false}
                      progressUpdateIntervalMillis={500}
                      onLoad={() => {
                        setFullscreenVideoReady(true);
                        fullscreenVideoRef.current?.playAsync().catch(() => {});
                        fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
                      }}
                    />
                    {fullscreenPostMedia.posterUri && !fullscreenVideoReady ? (
                      <CachedImage
                        uri={fullscreenPostMedia.posterUri}
                        style={[StyleSheet.absoluteFillObject, styles.fullscreenPosterImage, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                    ) : null}
                    <View style={styles.fullscreenSeekZones} pointerEvents="box-none">
                      <Pressable
                        style={styles.fullscreenSeekZoneLeft}
                        onPress={(e) => {
                          e.stopPropagation();
                          fullscreenVideoRef.current?.getStatusAsync().then((s) => {
                            if (s.isLoaded && 'positionMillis' in s) {
                              const pos = Math.max(0, (s.positionMillis ?? 0) - 10000);
                              fullscreenVideoRef.current?.setPositionAsync(pos);
                            }
                          });
                        }}
                      />
                      <Pressable style={styles.fullscreenSeekZoneCenter} onPress={() => { setFullscreenPostMedia(null); setCommentsSheetPostId(null); }} />
                      <Pressable
                        style={styles.fullscreenSeekZoneRight}
                        onPress={(e) => {
                          e.stopPropagation();
                          fullscreenVideoRef.current?.getStatusAsync().then((s) => {
                            if (s.isLoaded && 'positionMillis' in s) {
                              const dur = (s as { durationMillis?: number }).durationMillis ?? 0;
                              const pos = Math.min(dur, (s.positionMillis ?? 0) + 10000);
                              fullscreenVideoRef.current?.setPositionAsync(pos);
                            }
                          });
                        }}
                      />
                    </View>
                  </>
                ) : (
                  <CachedImage
                    uri={fullscreenPostMedia.uri}
                    style={[styles.fullscreenImage, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
                    contentFit="contain"
                  />
                )}
              </View>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  scroll: { flex: 1 },
  content: { paddingBottom: 100 },
  staffAvatarsSection: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  staffAvatarsSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    marginHorizontal: 16,
    marginBottom: 8,
    letterSpacing: 0.3,
  },
  staffAvatarsContent: { paddingHorizontal: 16, alignItems: 'center', paddingRight: 24 },
  staffAvatarCard: { width: 72, marginRight: 24, alignItems: 'center' },
  staffAvatarCardInner: { alignItems: 'center' },
  staffAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  staffAvatarImg: { width: 60, height: 60, borderRadius: 30, backgroundColor: theme.colors.borderLight },
  staffAvatarPlaceholder: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  staffAvatarLetter: { fontSize: 24, fontWeight: '700', color: theme.colors.white },
  staffAvatarName: { fontSize: 13, fontWeight: '600', color: theme.colors.text, maxWidth: 72, textAlign: 'center' },
  staffAvatarRole: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, maxWidth: 72, textAlign: 'center' },
  guestAvatarsSection: {
    backgroundColor: theme.colors.surface,
    paddingVertical: 12,
    paddingTop: 4,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  guestAvatarsSectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.primary,
    letterSpacing: 0.3,
  },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  collapseLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  collapseTagSection: { marginBottom: 4 },
  guestAvatarsContent: { paddingHorizontal: 16, alignItems: 'center', paddingRight: 24 },
  guestAvatarCard: { width: 72, marginRight: 24, alignItems: 'center' },
  guestAvatarCardInner: { alignItems: 'center' },
  guestAvatarRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 2.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
  },
  guestAvatarImg: { width: 64, height: 64, borderRadius: 32, backgroundColor: theme.colors.borderLight },
  guestAvatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  guestAvatarLetter: { fontSize: 24, fontWeight: '700', color: theme.colors.white },
  guestAvatarName: { fontSize: 13, fontWeight: '600', color: theme.colors.text, maxWidth: 72, textAlign: 'center' },
  guestAvatarRole: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, maxWidth: 72, textAlign: 'center' },
  feedTagFilters: { marginBottom: 12, paddingHorizontal: 16 },
  feedTagFiltersContent: { gap: 8, paddingRight: 20 },
  feedTagBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  feedTagBtnActive: { backgroundColor: theme.colors.primary + '18', borderColor: theme.colors.primary },
  feedTagBtnText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  feedTagBtnTextActive: { color: theme.colors.primary },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 24,
  },
  emptyText: { fontSize: 16, color: theme.colors.textMuted, marginTop: 16 },
  emptyBtn: {
    marginTop: 20,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 24,
    backgroundColor: theme.colors.primary,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '600', color: theme.colors.white },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuModalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    minWidth: 200,
    paddingVertical: 8,
    ...theme.shadows.lg,
  },
  menuModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  menuModalItemText: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.text,
  },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingBottom: 40,
    maxHeight: SCREEN_HEIGHT * 0.85,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  reportModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  reportModalSubtitle: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 16,
    marginBottom: 8,
  },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: theme.radius.md,
  },
  reportReasonRowSelected: {
    backgroundColor: `${theme.colors.primary}14`,
  },
  reportReasonLabel: { fontSize: 15, color: theme.colors.text, flex: 1 },
  reportDetailsInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
    minHeight: 80,
    textAlignVertical: 'top',
    marginTop: 4,
  },
  reportSubmitBtn: {
    marginTop: 24,
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { fontSize: 16, fontWeight: '700', color: theme.colors.white },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'transparent',
    justifyContent: 'flex-end',
  },
  viewersModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
  },
  viewersListWrap: {
    flex: 1,
    minHeight: 0,
  },
  viewersModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  viewersModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  viewersLoader: { marginVertical: 40 },
  viewersEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 32 },
  viewerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 14,
    gap: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  viewerAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  viewerAvatarLetter: {
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerAvatarLetterGuest: {
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerAvatarText: { fontSize: 18, fontWeight: '700', color: theme.colors.white },
  viewerInfo: { flex: 1, minWidth: 0 },
  viewerName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  viewerTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  postImageWrap: {
    position: 'relative',
    width: '100%',
    aspectRatio: 4 / 5,
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: theme.colors.borderLight,
  },
  postImage: {
    width: '100%',
    height: '100%',
  },
  videoPlayOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  commentsBlock: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  commentRow: { marginBottom: 10 },
  commentAuthor: { fontSize: 13, fontWeight: '700', color: theme.colors.text },
  commentText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 8,
  },
  commentInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  commentSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSendBtnDisabled: { opacity: 0.5 },
  commentSheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  commentSheetCard: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  commentSheetHandleWrap: {
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  commentSheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.borderLight,
  },
  commentSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
  },
  commentSheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  commentSheetScroll: { flex: 1, minHeight: 0 },
  commentSheetScrollContent: { padding: 20, paddingBottom: 16 },
  commentSheetEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  commentSheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  commentSheetAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  commentSheetAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.borderLight,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarPlaceholderGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarInitial: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textSecondary,
  },
  commentSheetAvatarInitialGuest: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  commentSheetRowBody: { flex: 1, minWidth: 0 },
  commentSheetAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentSheetText: { fontSize: 15, color: theme.colors.text, marginTop: 4, lineHeight: 22 },
  commentSheetMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  commentSheetTime: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  commentDeleteText: { fontSize: 12, color: theme.colors.error, fontWeight: '700' },
  commentSheetInputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
    backgroundColor: theme.colors.surface,
  },
  commentSheetInput: {
    flex: 1,
    minHeight: 40,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.backgroundSecondary,
  },
  bottomSpacer: { height: 24 },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  fullscreenImage: {},
  fullscreenVideo: { backgroundColor: '#000' },
  fullscreenPosterImage: { backgroundColor: 'transparent' },
  fullscreenSeekZones: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
  },
  fullscreenSeekZoneLeft: { flex: 1 },
  fullscreenSeekZoneCenter: { flex: 1 },
  fullscreenSeekZoneRight: { flex: 1 },
});
