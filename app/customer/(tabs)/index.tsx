import { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  Image,
  TouchableOpacity,
  StyleSheet,
  RefreshControl,
  Modal,
  useWindowDimensions,
  Pressable,
  Animated,
  Dimensions,
  Platform,
  Alert,
  TextInput,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { Video, Audio } from 'expo-av';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useScrollToTopStore } from '@/stores/scrollToTopStore';
import { theme } from '@/constants/theme';
import { formatRelative } from '@/lib/date';
import { StaffNameWithBadge, AvatarWithBadge } from '@/components/VerifiedBadge';
import { Skeleton, SkeletonCard } from '@/components/ui/Skeleton';
import { getOrCreateGuestForCurrentSession } from '@/lib/getOrCreateGuestForCaller';
import { guestDisplayName, isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import { notifyAdmins, sendNotification } from '@/lib/notificationService';
import { CachedImage } from '@/components/CachedImage';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { KeyboardAvoidingView } from 'react-native';
import { blockUserForGuest, getHiddenUsersForGuest } from '@/lib/userBlocks';
import { POST_TAGS, type PostTagValue } from '@/lib/feedPostTags';
import { sortStaffAdminFirst } from '@/lib/sortStaffAdminFirst';

type CustomerCommentRow = {
  id: string;
  staff_id?: string | null;
  guest_id?: string | null;
  content: string;
  created_at: string;
  staff: { full_name: string | null; profile_image?: string | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

const REPORT_REASONS: { value: string; label: string }[] = [
  { value: 'spam', label: 'Spam / tekrarlayan içerik' },
  { value: 'inappropriate', label: 'Uygunsuz içerik' },
  { value: 'violence', label: 'Şiddet veya tehdit' },
  { value: 'hate', label: 'Nefret söylemi veya ayrımcılık' },
  { value: 'false_info', label: 'Yanıltıcı bilgi' },
  { value: 'other', label: 'Diğer' },
];

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
  profile_image: string | null;
  is_online: boolean | null;
  last_active: string | null;
  work_status: string | null;
  verification_badge?: 'blue' | 'yellow' | null;
  role?: string | null;
};

type GuestRow = {
  id: string;
  full_name: string | null;
  photo_url: string | null;
};

type HotelInfoRow = {
  id: string;
  name: string | null;
  description: string | null;
  address: string | null;
  stars: number | null;
};

type FeedPost = {
  id: string;
  media_type: string;
  media_url: string | null;
  thumbnail_url: string | null;
  title: string | null;
  created_at: string;
  staff_id: string | null;
  guest_id: string | null;
  post_tag?: string | null;
  lat?: number | null;
  lng?: number | null;
  location_label?: string | null;
  staff: { full_name: string | null; department: string | null; profile_image?: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
  guest: { full_name: string | null; photo_url?: string | null } | null;
};

type MyRoom = {
  room_number: string;
  view_type: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
};

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const WORK_STATUS_COLOR: Record<string, string> = {
  active: theme.colors.success,
  break: '#eab308',
  off: theme.colors.error,
  leave: '#9ca3af',
};

type IoniconName = ComponentProps<typeof Ionicons>['name'];

function getTimeGreetingTr(): string {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'Günaydın';
  if (h >= 12 && h < 17) return 'İyi günler';
  if (h >= 17 && h < 22) return 'İyi akşamlar';
  return 'İyi geceler';
}

const GLYPH = Ionicons.glyphMap as Record<string, number>;

function getFacilityIonIcon(icon: string | null, facilityName: string): IoniconName {
  const key = icon?.trim().toLowerCase().replace(/^ionicons?:/, '').replace(/_/g, '-') ?? '';
  if (key && key in GLYPH) return key as IoniconName;
  const n = facilityName.toLowerCase();
  if (n.includes('havuz')) return 'water-outline';
  if (n.includes('spa') || n.includes('wellness')) return 'leaf-outline';
  if (n.includes('fitness') || n.includes('spor')) return 'barbell-outline';
  if (n.includes('wifi')) return 'wifi-outline';
  if (n.includes('restoran') || n.includes('yemek')) return 'restaurant-outline';
  if (n.includes('kahvaltı')) return 'cafe-outline';
  if (n.includes('otopark') || n.includes('park')) return 'car-outline';
  if (n.includes('çocuk')) return 'happy-outline';
  return 'sparkles-outline';
}

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

export default function CustomerHome() {
  const router = useRouter();
  const { user } = useAuthStore();
  const [activeStaff, setActiveStaff] = useState<StaffRow[]>([]);
  const [activeGuests, setActiveGuests] = useState<GuestRow[]>([]);
  const [hotelInfo, setHotelInfo] = useState<HotelInfoRow | null>(null);
  const [feedPosts, setFeedPosts] = useState<FeedPost[]>([]);
  const [myRoom, setMyRoom] = useState<MyRoom | null>(null);
  const [facilities, setFacilities] = useState<{ name: string; icon: string | null }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fullscreenPostMedia, setFullscreenPostMedia] = useState<{
    uri: string;
    mediaType: 'image' | 'video';
    posterUri?: string;
  } | null>(null);
  const [fullscreenVideoReady, setFullscreenVideoReady] = useState(false);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [myGuestId, setMyGuestId] = useState<string | null>(null);
  const [deletingPostId, setDeletingPostId] = useState<string | null>(null);
  const [reportPost, setReportPost] = useState<FeedPost | null>(null);
  const [reportReason, setReportReason] = useState('');
  const [reportDetails, setReportDetails] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [myLikes, setMyLikes] = useState<Set<string>>(new Set());
  const [commentsByPost, setCommentsByPost] = useState<Record<string, CustomerCommentRow[]>>({});
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [commentsSheetPostId, setCommentsSheetPostId] = useState<string | null>(null);
  const [commentSheetKeyboardH, setCommentSheetKeyboardH] = useState(0);
  const [feedTagFilter, setFeedTagFilter] = useState<PostTagValue | null>(null);
  const [guestsExpanded, setGuestsExpanded] = useState(true);
  const [tagFiltersExpanded, setTagFiltersExpanded] = useState(true);
  const filteredPosts = feedTagFilter ? feedPosts.filter((p) => (p.post_tag ?? null) === feedTagFilter) : feedPosts;
  const [togglingLike, setTogglingLike] = useState<string | null>(null);
  const [postingComment, setPostingComment] = useState<string | null>(null);
  const fullscreenVideoRef = useRef<Video>(null);
  const { width: winWidth, height: winHeight } = useWindowDimensions();
  const scrollRef = useRef<ScrollView>(null);
  const setScrollToTop = useScrollToTopStore((s) => s.setScrollToTop);
  const onlineBlinkOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(onlineBlinkOpacity, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(onlineBlinkOpacity, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [onlineBlinkOpacity]);

  useEffect(() => {
    setScrollToTop(() => () => scrollRef.current?.scrollTo({ y: 0, animated: true }));
    return () => setScrollToTop(null);
  }, [setScrollToTop]);

  // Video sesi hoparlörden tam açılsın (Android ses kısık sorunu)
  useEffect(() => {
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
  }, []);

  // Tam ekran video açıldığında poster overlay sıfırla (yeni video = henüz yüklenmedi)
  useEffect(() => {
    if (fullscreenPostMedia?.mediaType === 'video') setFullscreenVideoReady(false);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  // Tam ekran video açıldığında oynat ve sesi aç
  useEffect(() => {
    if (!fullscreenPostMedia || fullscreenPostMedia.mediaType !== 'video') return;
    const t = setTimeout(() => {
      fullscreenVideoRef.current?.playAsync().catch(() => {});
      fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
    }, 300);
    return () => clearTimeout(t);
  }, [fullscreenPostMedia?.uri, fullscreenPostMedia?.mediaType]);

  const load = useCallback(async () => {
    const guestRow = user ? await getOrCreateGuestForCurrentSession() : null;
    setMyGuestId(guestRow?.guest_id ?? null);
    const hidden = guestRow?.guest_id
      ? await getHiddenUsersForGuest(guestRow.guest_id)
      : { hiddenStaffIds: new Set<string>(), hiddenGuestIds: new Set<string>() };

    const [staffRes, hotelRes, guestsRes, feedRes, facilitiesRes] = await Promise.all([
      (async () => {
        const { data } = await supabase
          .from('staff')
          .select('id, full_name, department, profile_image, is_online, last_active, work_status, verification_badge, email, role')
          .eq('is_active', true)
          .is('deleted_at', null)
          .order('is_online', { ascending: false })
          .order('last_active', { ascending: false });
        const rows = (data ?? []) as (StaffRow & { email?: string | null })[];
        const byKey = new Map<string, StaffRow>();
        rows.forEach((r) => {
          const key = (r.email && r.email.trim()) ? r.email.trim().toLowerCase() : r.id;
          if (!byKey.has(key)) {
            byKey.set(key, {
              id: r.id,
              full_name: r.full_name,
              department: r.department,
              profile_image: r.profile_image,
              is_online: r.is_online,
              last_active: r.last_active,
              work_status: r.work_status,
              verification_badge: r.verification_badge,
              role: r.role,
            });
          }
        });
        const deduped = Array.from(byKey.values());
        return {
          data: sortStaffAdminFirst(deduped, (a, b) => {
            const onA = a.is_online ? 1 : 0;
            const onB = b.is_online ? 1 : 0;
            if (onA !== onB) return onB - onA;
            return (b.last_active ?? '').localeCompare(a.last_active ?? '');
          }),
        };
      })(),
      supabase.from('hotel_info').select('id, name, description, address, stars').limit(1).maybeSingle(),
      supabase
        .from('guests')
        .select('id, full_name, photo_url, banned_until')
        .not('auth_user_id', 'is', null)
        .is('deleted_at', null)
        .order('updated_at', { ascending: false })
        .limit(30),
      supabase
        .from('feed_posts')
        .select('id, media_type, media_url, thumbnail_url, title, created_at, staff_id, guest_id, post_tag, lat, lng, location_label, staff:staff_id(full_name, department, profile_image, verification_badge, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)')
        .eq('visibility', 'customers')
        .order('created_at', { ascending: false })
        .limit(10),
      supabase.from('facilities').select('name, icon').eq('is_active', true).order('sort_order').limit(6),
    ]);
    setActiveStaff((staffRes.data ?? []).filter((s) => !hidden.hiddenStaffIds.has(s.id)));
    setHotelInfo(hotelRes.data ?? null);
    const now = new Date().toISOString();
    const allGuests = ((guestsRes.data ?? []) as (GuestRow & { banned_until?: string | null })[]).filter(
      (g) => !hidden.hiddenGuestIds.has(g.id) && (!g.banned_until || g.banned_until < now)
    );
    setActiveGuests(allGuests.map(({ banned_until: _, ...g }) => g));
    const posts = ((feedRes.data ?? []) as FeedPost[]).filter(
      (p) =>
        !(p.staff_id && hidden.hiddenStaffIds.has(p.staff_id)) &&
        !(p.guest_id && hidden.hiddenGuestIds.has(p.guest_id)) &&
        !(p.staff_id && (p.staff as { deleted_at?: string | null } | null)?.deleted_at) &&
        !(p.guest_id && (p.guest as { deleted_at?: string | null } | null)?.deleted_at)
    );
    setFeedPosts(posts);
    setFacilities(facilitiesRes.data ?? []);
    const guestId = guestRow?.guest_id ?? null;
    const ids = posts.map((p) => p.id);
    if (ids.length > 0) {
      const [reactionsRes, commentsRes, myReactionsRes] = await Promise.all([
        supabase.from('feed_post_reactions').select('post_id').in('post_id', ids),
        supabase.from('feed_post_comments').select('post_id, id, staff_id, guest_id, content, created_at, staff:staff_id(full_name, profile_image, deleted_at), guest:guest_id(full_name, photo_url, deleted_at)').in('post_id', ids).order('created_at', { ascending: true }),
        guestId ? supabase.from('feed_post_reactions').select('post_id').in('post_id', ids).eq('guest_id', guestId) : Promise.resolve({ data: [] as { post_id: string }[] }),
      ]);
      const reactions = (reactionsRes.data ?? []) as { post_id: string }[];
      const comments = (commentsRes.data ?? []) as (CustomerCommentRow & { post_id: string })[];
      const myReactions = (myReactionsRes.data ?? []) as { post_id: string }[];
      const likeCount: Record<string, number> = {};
      reactions.forEach((r) => { likeCount[r.post_id] = (likeCount[r.post_id] ?? 0) + 1; });
      const commentCount: Record<string, number> = {};
      const byPost: Record<string, CustomerCommentRow[]> = {};
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
      setMyLikes(new Set(myReactions.map((r) => r.post_id)));
      setCommentsByPost(byPost);
      if (guestId) {
        const viewRows = ids.map((post_id) => ({ post_id, guest_id: guestId }));
        supabase.from('feed_post_views').upsert(viewRows, { onConflict: 'post_id,guest_id', ignoreDuplicates: true }).then(() => {});
      }
    } else {
      setLikeCounts({});
      setCommentCounts({});
      setMyLikes(new Set());
      setCommentsByPost({});
    }

    if (user?.email) {
      const { data: guest } = await supabase
        .from('guests')
        .select('room_id')
        .eq('email', user.email)
        .eq('status', 'checked_in')
        .order('check_in_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (guest?.room_id) {
        const { data: room } = await supabase
          .from('rooms')
          .select('room_number, view_type')
          .eq('id', guest.room_id)
          .single();
        const { data: g } = await supabase
          .from('guests')
          .select('check_in_at, check_out_at')
          .eq('room_id', guest.room_id)
          .eq('status', 'checked_in')
          .limit(1)
          .single();
        if (room && g)
          setMyRoom({
            room_number: room.room_number,
            view_type: room.view_type,
            check_in_at: g.check_in_at,
            check_out_at: g.check_out_at,
          });
        else setMyRoom(null);
      } else setMyRoom(null);
    }
  }, [user?.email]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    setLoading(false);
  }, [load]);

  useEffect(() => {
    load().then(() => setLoading(false));
  }, [load]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {};
    }, [load])
  );

  // Android: yorum modalında klavye açılınca input klavyenin üstünde kalsın (manuel padding)
  useEffect(() => {
    if (Platform.OS !== 'android' || !commentsSheetPostId) return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => setCommentSheetKeyboardH(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setCommentSheetKeyboardH(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [commentsSheetPostId]);

  useEffect(() => {
    if (!commentsSheetPostId) setCommentSheetKeyboardH(0);
  }, [commentsSheetPostId]);

  const toggleLike = useCallback(async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Beğenmek için giriş yapın.');
      return;
    }
    setTogglingLike(postId);
    try {
      const liked = myLikes.has(postId);
      if (liked) {
        await supabase.from('feed_post_reactions').delete().eq('post_id', postId).eq('guest_id', guestRow.guest_id);
        setMyLikes((prev) => {
          const next = new Set(prev);
          next.delete(postId);
          return next;
        });
        setLikeCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
      } else {
        await supabase.from('feed_post_reactions').insert({ post_id: postId, guest_id: guestRow.guest_id, reaction: 'like' });
        setMyLikes((prev) => new Set(prev).add(postId));
        setLikeCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
        const displayName = getDisplayName() || 'Bir misafir';
        if (authorStaffId) {
          await sendNotification({
            staffId: authorStaffId,
            title: 'Yeni beğeni',
            body: `${displayName} paylaşımını beğendi.`,
            category: 'staff',
            notificationType: 'feed_like',
            data: { screen: 'staff_feed', url: '/staff', postId },
          });
        } else if (authorGuestId) {
          await sendNotification({
            guestId: authorGuestId,
            title: 'Yeni beğeni',
            body: `${displayName} paylaşımını beğendi.`,
            category: 'guest',
            notificationType: 'feed_like',
            data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
          });
        }
      }
    } catch (e) {
      // ignore
    }
    setTogglingLike(null);
  }, [myLikes]);

  const submitComment = useCallback(async (postId: string, authorStaffId: string | null, authorGuestId: string | null) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Yorum yapmak için giriş yapın.');
      return;
    }
    const text = (commentText[postId] ?? '').trim();
    if (!text) return;
    setPostingComment(postId);
    try {
      const { data: inserted } = await supabase
        .from('feed_post_comments')
        .insert({ post_id: postId, guest_id: guestRow.guest_id, content: text })
        .select('id, content, created_at')
        .single();
      setCommentText((prev) => ({ ...prev, [postId]: '' }));
      const displayName = getDisplayName() || 'Misafir';
      const newComment: CustomerCommentRow = {
        id: (inserted as { id: string }).id,
        content: text,
        created_at: (inserted as { created_at: string }).created_at,
        staff: null,
        guest: { full_name: displayName },
      };
      setCommentsByPost((prev) => ({
        ...prev,
        [postId]: [...(prev[postId] ?? []), newComment],
      }));
      setCommentCounts((prev) => ({ ...prev, [postId]: (prev[postId] ?? 0) + 1 }));
      const notifyBody = `${displayName}: ${text.slice(0, 60)}${text.length > 60 ? '…' : ''}`;
      if (authorStaffId) {
        await sendNotification({
          staffId: authorStaffId,
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'staff',
          notificationType: 'feed_comment',
          data: { screen: 'staff_feed', url: '/staff', postId },
        });
      } else if (authorGuestId) {
        await sendNotification({
          guestId: authorGuestId,
          title: 'Yeni yorum',
          body: notifyBody,
          category: 'guest',
          notificationType: 'feed_comment',
          data: { screen: 'customer_feed', url: '/customer/feed/' + postId, postId },
        });
      }
    } catch (e) {
      // ignore
    }
    setPostingComment(null);
  }, [commentText]);

  const deleteOwnComment = useCallback(async (postId: string, commentId: string) => {
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
          setCommentsByPost((prev) => ({
            ...prev,
            [postId]: (prev[postId] ?? []).filter((c) => c.id !== commentId),
          }));
          setCommentCounts((prev) => ({ ...prev, [postId]: Math.max(0, (prev[postId] ?? 1) - 1) }));
        },
      },
    ]);
  }, []);

  const openReportModal = (post: FeedPost) => {
    setMenuPostId(null);
    setReportPost(post);
    setReportReason('');
    setReportDetails('');
  };

  const handleDeleteOwnPost = useCallback(async (post: FeedPost) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id || post.guest_id !== guestRow.guest_id) return;
    Alert.alert('Paylaşımı sil', 'Bu paylaşım kalıcı olarak silinecek.', [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Sil',
        style: 'destructive',
        onPress: async () => {
          setMenuPostId(null);
          setDeletingPostId(post.id);
          const { error } = await supabase.from('feed_posts').delete().eq('id', post.id);
          setDeletingPostId(null);
          if (error) {
            Alert.alert('Hata', error.message || 'Paylaşım silinemedi.');
            return;
          }
          setFeedPosts((prev) => prev.filter((p) => p.id !== post.id));
          setLikeCounts((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          setCommentCounts((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          setMyLikes((prev) => {
            const n = new Set(prev);
            n.delete(post.id);
            return n;
          });
          setCommentsByPost((prev) => {
            const n = { ...prev };
            delete n[post.id];
            return n;
          });
          if (commentsSheetPostId === post.id) setCommentsSheetPostId(null);
        },
      },
    ]);
  }, [commentsSheetPostId]);

  const handleBlockUser = useCallback(async (post: FeedPost) => {
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.guest_id) {
      Alert.alert('Giriş gerekli', 'Kullanıcı engellemek için giriş yapın.');
      return;
    }
    const targetStaffId = post.staff_id ?? null;
    const targetGuestId = post.guest_id ?? null;
    if (targetGuestId && targetGuestId === guestRow.guest_id) {
      Alert.alert('Uyarı', 'Kendinizi engelleyemezsiniz.');
      return;
    }
    const targetType = targetStaffId ? 'staff' : targetGuestId ? 'guest' : null;
    const targetId = targetStaffId ?? targetGuestId;
    if (!targetType || !targetId) return;
    const rawStaff = post.staff as { full_name?: string | null } | null;
    const rawGuest = post.guest as { full_name?: string | null } | null;
    const targetName = targetStaffId
      ? ((rawStaff?.full_name ?? '').trim() || 'Bu kullanıcı')
      : guestDisplayName(rawGuest?.full_name, 'Bu kullanıcı');

    Alert.alert('Kullanıcıyı engelle', `${targetName} artık sizi göremez ve siz de onu göremezsiniz.`, [
      { text: 'İptal', style: 'cancel' },
      {
        text: 'Engelle',
        style: 'destructive',
        onPress: async () => {
          const { error } = await blockUserForGuest({
            blockerGuestId: guestRow.guest_id,
            blockedType: targetType,
            blockedId: targetId,
          });
          if (error && error.code !== '23505') {
            Alert.alert('Hata', error.message || 'Kullanıcı engellenemedi.');
            return;
          }
          setMenuPostId(null);
          await load();
        },
      },
    ]);
  }, [load]);

  const submitReport = async () => {
    if (!reportPost || !reportReason.trim()) return;
    const guestRow = await getOrCreateGuestForCurrentSession();
    if (!guestRow?.app_token) {
      Alert.alert('Giriş gerekli', 'Bildirim göndermek için giriş yapın.');
      return;
    }
    const reasonLabel = REPORT_REASONS.find((r) => r.value === reportReason)?.label ?? reportReason;
    setSubmittingReport(true);
    try {
      const { data: reportId, error } = await supabase.rpc('report_feed_post_guest', {
        p_app_token: guestRow.app_token,
        p_post_id: reportPost.id,
        p_reason: reportReason.trim(),
        p_details: reportDetails.trim() || null,
      });
      if (error) {
        Alert.alert('Hata', error.message ?? 'Bildirim kaydedilemedi.');
        setSubmittingReport(false);
        return;
      }
      const postTitle = (reportPost.title ?? '').trim() || 'Paylaşım';
      await notifyAdmins({
        title: 'Paylaşım bildirimi (misafir)',
        body: `"${postTitle}" — ${reasonLabel}${reportDetails.trim() ? ` — ${reportDetails.trim().slice(0, 40)}…` : ''}`,
        data: { url: '/admin/reports', screen: 'admin', postId: reportPost.id },
      }).catch(() => {});
      setReportPost(null);
      setReportReason('');
      setReportDetails('');
      Alert.alert(
        'Bildiriminiz alındı',
        'Şikayetiniz yönetime iletildi. 24 saat içinde dönüş yapılacaktır.',
        [{ text: 'Tamam' }]
      );
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Bildirim gönderilemedi.');
    }
    setSubmittingReport(false);
  };

  const displayName = getDisplayName();
  const locationName = hotelInfo?.name ?? 'Valoria Hotel';

  if (loading && activeStaff.length === 0 && !hotelInfo) {
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Skeleton height={118} borderRadius={theme.radius.lg} style={{ marginBottom: theme.spacing.md }} />
        <View style={styles.quickActionsRow}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} height={72} borderRadius={theme.radius.md} style={{ flex: 1, minWidth: 0 }} />
          ))}
        </View>
        <View style={styles.categoryRow}>
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} width={56} height={56} borderRadius={12} style={{ marginRight: 12 }} />
          ))}
        </View>
        <Text style={styles.sectionTitle}>Personeller</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={72} height={72} borderRadius={36} />
          ))}
        </View>
        <Text style={styles.sectionTitle}>Misafirler</Text>
        <View style={{ flexDirection: 'row', gap: 16, marginBottom: 24 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} width={72} height={72} borderRadius={36} />
          ))}
        </View>
        <SkeletonCard />
      </ScrollView>
    );
  }

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
      }
    >
      <LinearGradient
        colors={['#faf6ec', '#f3e8d4', theme.colors.surface]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCard}
      >
        <Text style={styles.heroTitle} numberOfLines={2}>
          {getTimeGreetingTr()}
          {displayName ? `, ${displayName}` : ''}
        </Text>
        <Text style={styles.heroSubtitle} numberOfLines={2}>
          {locationName}
          {hotelInfo?.stars != null && hotelInfo.stars > 0
            ? ` · ${hotelInfo.stars} yıldız`
            : ''}
        </Text>
        {hotelInfo?.address?.trim() ? (
          <View style={styles.heroLocationChip}>
            <Ionicons name="location" size={15} color={theme.colors.primaryDark} />
            <Text style={styles.heroLocationChipText} numberOfLines={2}>
              {hotelInfo.address.trim()}
            </Text>
          </View>
        ) : null}
        {hotelInfo?.description?.trim() ? (
          <Text style={styles.heroDescription} numberOfLines={2}>
            {hotelInfo.description.trim()}
          </Text>
        ) : null}
      </LinearGradient>

      <View style={styles.quickActionsRow}>
        <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/map')} activeOpacity={0.85}>
          <View style={styles.quickActionIconWrap}>
            <Ionicons name="map-outline" size={22} color={theme.colors.primaryDark} />
          </View>
          <Text style={styles.quickActionLabel}>Harita</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/customer/notifications')} activeOpacity={0.85}>
          <View style={styles.quickActionIconWrap}>
            <Ionicons name="notifications-outline" size={22} color={theme.colors.primaryDark} />
          </View>
          <Text style={styles.quickActionLabel}>Bildirimler</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/(tabs)/messages')} activeOpacity={0.85}>
          <View style={styles.quickActionIconWrap}>
            <Ionicons name="chatbubbles-outline" size={22} color={theme.colors.primaryDark} />
          </View>
          <Text style={styles.quickActionLabel}>Mesajlar</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.quickActionItem} onPress={() => router.push('/customer/feed/new')} activeOpacity={0.85}>
          <View style={styles.quickActionIconWrap}>
            <Ionicons name="add-circle-outline" size={22} color={theme.colors.primaryDark} />
          </View>
          <Text style={styles.quickActionLabel}>Paylaş</Text>
        </TouchableOpacity>
      </View>

      {myRoom ? (
        <>
          <Text style={[styles.sectionTitle, styles.sectionTitleAfterHero]}>Odam</Text>
          <View style={styles.roomCard}>
            <View style={styles.roomCardAccent} />
            <View style={styles.roomCardInner}>
              <View style={styles.roomCardHeader}>
                <View style={styles.roomNumberBadge}>
                  <Ionicons name="bed-outline" size={20} color={theme.colors.primary} />
                  <Text style={styles.roomTitle}>Oda {myRoom.room_number}</Text>
                </View>
                {myRoom.view_type ? (
                  <View style={styles.roomViewChip}>
                    <Text style={styles.roomViewChipText}>{myRoom.view_type}</Text>
                  </View>
                ) : null}
              </View>
              <View style={styles.roomDatesRow}>
                {myRoom.check_in_at && (
                  <View style={styles.roomDateItem}>
                    <Ionicons name="log-in-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.roomMeta}>{new Date(myRoom.check_in_at).toLocaleDateString('tr-TR')} · 14:00</Text>
                  </View>
                )}
                {myRoom.check_out_at && (
                  <View style={styles.roomDateItem}>
                    <Ionicons name="log-out-outline" size={14} color={theme.colors.textSecondary} />
                    <Text style={styles.roomMeta}>{new Date(myRoom.check_out_at).toLocaleDateString('tr-TR')} · 11:00</Text>
                  </View>
                )}
              </View>
              <View style={styles.roomActions}>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/customer/key')} activeOpacity={0.8}>
                  <Ionicons name="key-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>Dijital anahtar</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/customer/room-service/')} activeOpacity={0.8}>
                  <Ionicons name="restaurant-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>Oda servisi</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.roomBtn} onPress={() => router.push('/(tabs)/messages')} activeOpacity={0.8}>
                  <Ionicons name="sparkles-outline" size={18} color={theme.colors.primary} />
                  <Text style={styles.roomBtnText}>Temizlik iste</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </>
      ) : null}

      {facilities.length > 0 ? (
        <>
          <Text style={styles.sectionLabel}>Tesis ve olanaklar</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.facilitiesRow}
            style={styles.storyScroll}
          >
            {facilities.map((f, idx) => (
              <View key={`${f.name}-${idx}`} style={styles.facilityChip}>
                <View style={styles.facilityIconCircle}>
                  <Ionicons name={getFacilityIonIcon(f.icon, f.name)} size={22} color={theme.colors.primaryDark} />
                </View>
                <Text style={styles.facilityChipName} numberOfLines={2}>
                  {f.name}
                </Text>
              </View>
            ))}
          </ScrollView>
        </>
      ) : null}

      {/* Personeller - kart stili */}
      <Text style={styles.sectionLabel}>Personeller</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.staffCardsRow}
        style={styles.storyScroll}
      >
        {activeStaff.map((staff) => {
          const statusColor = WORK_STATUS_COLOR[staff.work_status ?? 'active'] ?? theme.colors.success;
          return (
            <TouchableOpacity
              key={staff.id}
              style={styles.staffCard}
              onPress={() => router.push(`/customer/staff/${staff.id}`)}
              activeOpacity={0.85}
            >
              <View style={styles.staffCardInner}>
                <View style={styles.staffCardRing}>
                  <AvatarWithBadge badge={staff.verification_badge ?? null} avatarSize={68} badgeSize={14}>
                    {staff.profile_image ? (
                      <CachedImage uri={staff.profile_image} style={styles.staffCardAvatar} contentFit="cover" />
                    ) : (
                      <View style={[styles.staffCardAvatar, styles.staffCardPlaceholder]}>
                        <Text style={styles.staffCardLetter}>{(staff.full_name || 'P').charAt(0).toUpperCase()}</Text>
                      </View>
                    )}
                  </AvatarWithBadge>
                  {staff.is_online ? (
                    <Animated.View style={[styles.statusDot, styles.statusDotOnline, { backgroundColor: theme.colors.success, opacity: onlineBlinkOpacity }]} />
                  ) : (
                    <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                  )}
                </View>
                <View style={styles.staffCardTextBlock}>
                  <StaffNameWithBadge
                    name={staff.full_name?.split(' ')[0] || 'Personel'}
                    badge={staff.verification_badge ?? null}
                    textStyle={styles.staffCardName}
                  />
                  <Text style={styles.staffCardDept} numberOfLines={1}>{staff.department || '—'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* Yeni kayıt olmuş misafirler */}
      <View style={styles.collapseSection}>
        <TouchableOpacity style={styles.collapseHeader} onPress={() => setGuestsExpanded(!guestsExpanded)} activeOpacity={0.7}>
          <Text style={[styles.sectionLabel, { marginTop: theme.spacing.lg, marginBottom: 0 }]}>Misafirler</Text>
          <Ionicons name={guestsExpanded ? 'chevron-up' : 'chevron-down'} size={22} color={theme.colors.primary} />
        </TouchableOpacity>
        {guestsExpanded && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.staffCardsRow}
            style={styles.storyScroll}
          >
            {activeGuests.map((guest) => {
              const name = guestDisplayName(guest.full_name, 'Misafir');
              const firstName = name.split(' ')[0] || 'Misafir';
              return (
                <TouchableOpacity
                  key={`guest-${guest.id}`}
                  style={styles.staffCard}
                  onPress={() => router.push(`/customer/guest/${guest.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.staffCardInner}>
                    <View style={styles.staffCardRing}>
                      {guest.photo_url ? (
                        <CachedImage uri={guest.photo_url} style={styles.staffCardAvatar} contentFit="cover" />
                      ) : (
                        <View style={[styles.staffCardAvatar, styles.staffCardPlaceholderGuest]}>
                          <Text style={styles.staffCardLetterGuest}>{firstName.charAt(0).toUpperCase()}</Text>
                        </View>
                      )}
                    </View>
                    <View style={styles.staffCardTextBlock}>
                      <Text style={styles.staffCardName} numberOfLines={1}>{firstName}</Text>
                      <Text style={styles.staffCardDept} numberOfLines={1}>Misafir</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      <Text style={styles.feedSectionHeading}>Paylaşımlar</Text>
      <View style={[styles.collapseSection, styles.feedBlockTop]}>
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
      {filteredPosts.length === 0 ? (
        <View style={styles.emptyFeed}>
          <View style={styles.emptyFeedIconWrap}>
            <Ionicons name="images-outline" size={40} color={theme.colors.primary} />
          </View>
          <Text style={styles.emptyFeedTitle}>
            {feedTagFilter
              ? 'Bu etikette paylaşım yok'
              : 'Henüz paylaşım yok'}
          </Text>
          <Text style={styles.emptyFeedText}>
            {feedTagFilter
              ? `${POST_TAGS.find((t) => t.value === feedTagFilter)?.label ?? feedTagFilter} etiketini kaldırarak tüm gönderileri görebilir veya başka bir etiket seçebilirsiniz.`
              : 'Personel ve misafirlerden gelen fotoğraf ve duyurular burada görünecek. İlk paylaşımı siz yapabilirsiniz.'}
          </Text>
          {!feedTagFilter ? (
            <TouchableOpacity style={styles.emptyFeedCta} onPress={() => router.push('/customer/feed/new')} activeOpacity={0.85}>
              <Ionicons name="camera-outline" size={20} color="#fff" />
              <Text style={styles.emptyFeedCtaText}>Paylaşım oluştur</Text>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={styles.emptyFeedCtaSecondary} onPress={() => setFeedTagFilter(null)} activeOpacity={0.85}>
              <Text style={styles.emptyFeedCtaSecondaryText}>Tüm paylaşımları göster</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <View style={styles.feedList}>
          {filteredPosts.slice(0, 20).map((post) => {
            const rawStaff = post.staff as { full_name?: string; department?: string; profile_image?: string | null; verification_badge?: 'blue' | 'yellow' | null } | null;
            const rawGuest = post.guest;
            const staffInfo = Array.isArray(rawStaff) ? rawStaff[0] ?? null : rawStaff;
            const guestInfo = Array.isArray(rawGuest) ? (rawGuest[0] as { full_name?: string | null; photo_url?: string | null } | null) ?? null : (rawGuest as { full_name?: string | null; photo_url?: string | null } | null);
            const authorName = staffInfo
              ? (staffInfo.full_name?.trim() || 'Personel')
              : guestDisplayName(guestInfo?.full_name, 'Misafir');
            const dept = staffInfo?.department;
            const badge = staffInfo?.verification_badge ?? null;
            const profileImage = staffInfo?.profile_image ?? guestInfo?.photo_url ?? null;
            const isGuest = !staffInfo && (guestInfo || !rawStaff);
            const imageUri = post.media_type !== 'text' ? (post.thumbnail_url || post.media_url) : null;
            const hasMedia = !!imageUri;
            const avatarLetter = authorName.charAt(0).toUpperCase();
            const hasLocation = (post.lat != null && post.lng != null) || (post.location_label && post.location_label.trim());
            return (
              <View key={post.id} style={styles.feedItem}>
                <View style={styles.feedItemAccent} />
                {hasLocation && (
                  <View style={styles.feedLocationBar}>
                    <Ionicons name="location" size={14} color={theme.colors.primary} />
                    <Text style={styles.feedLocationText} numberOfLines={1}>
                      {post.location_label?.trim() || '📍 Haritadan paylaşıldı'}
                    </Text>
                  </View>
                )}
                <View style={styles.feedItemHeader}>
                  {profileImage ? (
                    <CachedImage uri={profileImage} style={styles.feedAvatar} contentFit="cover" />
                  ) : (
                    <View style={[styles.feedAvatar, isGuest ? styles.feedAvatarPlaceholderGuest : styles.feedAvatarPlaceholder]}>
                      <Text style={isGuest ? styles.feedAvatarLetterGuest : styles.feedAvatarLetter}>{avatarLetter}</Text>
                    </View>
                  )}
                  <View style={styles.feedItemHeaderText}>
                    {staffInfo ? (
                      <StaffNameWithBadge name={authorName} badge={badge} textStyle={styles.feedAuthorName} />
                    ) : (
                      <Text style={styles.feedAuthorName} numberOfLines={1}>{authorName}</Text>
                    )}
                    <View style={styles.feedItemMetaRow}>
                      {dept ? <Text style={styles.feedItemMeta}>{dept}</Text> : isGuest ? <Text style={styles.feedItemMeta}>Misafir</Text> : null}
                      {post.created_at ? (
                        <Text style={styles.feedItemDate}>{formatRelative(post.created_at)}</Text>
                      ) : null}
                    </View>
                  </View>
                  {user ? (
                    <View style={styles.feedHeaderActions}>
                      {myGuestId && post.guest_id === myGuestId ? (
                        <TouchableOpacity
                          style={styles.feedDeleteHeaderBtn}
                          onPress={() => handleDeleteOwnPost(post)}
                          disabled={deletingPostId === post.id}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          activeOpacity={0.7}
                        >
                          {deletingPostId === post.id ? (
                            <ActivityIndicator size="small" color={theme.colors.error} />
                          ) : (
                            <Ionicons name="trash-outline" size={20} color={theme.colors.error} />
                          )}
                        </TouchableOpacity>
                      ) : (
                        <TouchableOpacity
                          style={styles.feedMenuBtn}
                          onPress={() => setMenuPostId(menuPostId === post.id ? null : post.id)}
                          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                          activeOpacity={0.7}
                        >
                          <Ionicons name="ellipsis-vertical" size={20} color={theme.colors.textMuted} />
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : null}
                </View>
                <Modal
                  visible={menuPostId === post.id}
                  transparent
                  animationType="fade"
                  onRequestClose={() => setMenuPostId(null)}
                >
                  <Pressable style={styles.menuModalOverlay} onPress={() => setMenuPostId(null)}>
                    <View style={styles.menuModalBox}>
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => handleBlockUser(post)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="ban-outline" size={22} color={theme.colors.error} />
                        <Text style={[styles.menuModalItemText, { color: theme.colors.error }]}>Engelle</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.menuModalItem}
                        onPress={() => openReportModal(post)}
                        activeOpacity={0.7}
                      >
                        <Ionicons name="flag-outline" size={22} color={theme.colors.text} />
                        <Text style={styles.menuModalItemText}>Bildir</Text>
                      </TouchableOpacity>
                    </View>
                  </Pressable>
                </Modal>
                {hasMedia ? (
                  <TouchableOpacity
                    activeOpacity={1}
                    onPress={() => {
                      const isVideo = post.media_type === 'video';
                      if (isVideo) {
                        setFullscreenPostMedia({
                          uri: post.media_url || post.thumbnail_url || '',
                          mediaType: 'video',
                          posterUri: post.thumbnail_url || post.media_url || undefined,
                        });
                      } else {
                        setFullscreenPostMedia({
                          uri: post.media_url || post.thumbnail_url || '',
                          mediaType: 'image',
                        });
                      }
                    }}
                    style={styles.postMediaTouchable}
                  >
                    <View style={styles.postImageWrap}>
                      {post.media_type === 'video' ? (
                        <Video
                          source={{ uri: post.media_url || post.thumbnail_url || '' }}
                          style={styles.postImage}
                          resizeMode="cover"
                          muted
                          shouldPlay={false}
                          useNativeControls={false}
                        />
                      ) : (
                        <CachedImage
                          uri={post.thumbnail_url || post.media_url || ''}
                          style={styles.postImage}
                          contentFit="cover"
                        />
                      )}
                    </View>
                  </TouchableOpacity>
                ) : null}
                <View style={styles.feedItemBody}>
                  {(post.title ?? '').trim() ? (
                    <Text style={[styles.feedItemTitle, !hasMedia && styles.feedItemTitleTextOnly]}>
                      {post.title}
                    </Text>
                  ) : hasMedia ? (
                    <Text style={styles.feedItemTitle} numberOfLines={1}>
                      {post.media_type === 'video' ? 'Video' : 'Fotoğraf'}
                    </Text>
                  ) : null}
                  <View style={styles.feedActionsRow}>
                    {user ? (
                      <TouchableOpacity
                        style={styles.feedActionBtn}
                        onPress={() => toggleLike(post.id, post.staff_id ?? null, post.guest_id ?? null)}
                        disabled={togglingLike === post.id}
                        activeOpacity={0.7}
                      >
                        {togglingLike === post.id ? (
                          <ActivityIndicator size="small" color={theme.colors.textMuted} />
                        ) : (
                          <Ionicons
                            name={myLikes.has(post.id) ? 'heart' : 'heart-outline'}
                            size={22}
                            color={myLikes.has(post.id) ? theme.colors.error : theme.colors.text}
                          />
                        )}
                        <Text style={styles.feedActionCount}>{likeCounts[post.id] ?? 0}</Text>
                      </TouchableOpacity>
                    ) : null}
                    <TouchableOpacity
                      style={styles.feedActionBtn}
                      onPress={() => setCommentsSheetPostId(commentsSheetPostId === post.id ? null : post.id)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="chatbubble-outline" size={20} color={theme.colors.text} />
                      <Text style={styles.feedActionCount}>{commentCounts[post.id] ?? 0}</Text>
                    </TouchableOpacity>
                    {Platform.OS !== 'android' ? (
                      <TouchableOpacity
                        style={styles.feedActionBtn}
                        onPress={() => router.push(`/customer/feed/${post.id}`)}
                        activeOpacity={0.7}
                      >
                        <Text style={styles.feedDetailLink}>Detay</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>
              </View>
            );
          })}
            <TouchableOpacity onPress={() => router.push('/customer/feed/' + filteredPosts[0].id)} style={styles.showAllBtn}>
              <Text style={styles.showAllText}>Tümünü göster</Text>
            </TouchableOpacity>
        </View>
      )}

      {/* Yorum kartı */}
      <Modal
        visible={!!commentsSheetPostId}
        animationType="slide"
        transparent
        onRequestClose={() => setCommentsSheetPostId(null)}
      >
        <Pressable style={styles.commentSheetOverlay} onPress={() => setCommentsSheetPostId(null)}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.commentSheetKeyboard}
          >
            <Pressable
              style={[styles.commentSheetCard, Platform.OS === 'android' && commentSheetKeyboardH > 0 && { paddingBottom: commentSheetKeyboardH + 24 }]}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={styles.commentSheetHeader}>
                <Text style={styles.commentSheetTitle}>Yorumlar</Text>
                <TouchableOpacity onPress={() => setCommentsSheetPostId(null)} hitSlop={16}>
                  <Ionicons name="close" size={24} color={theme.colors.text} />
                </TouchableOpacity>
              </View>
              {commentsSheetPostId && (() => {
                const post = feedPosts.find((p) => p.id === commentsSheetPostId);
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
                            ? guestDisplayName(c.guest?.full_name, '—')
                            : ((c.staff?.full_name ?? '—').trim() || '—');
                          const avatarUri = c.staff?.profile_image ?? c.guest?.photo_url ?? null;
                          const canDelete = !!(myGuestId && c.guest_id && c.guest_id === myGuestId && !c.staff_id);
                          return (
                            <View key={c.id} style={styles.commentSheetRow}>
                              {avatarUri ? (
                                <CachedImage uri={avatarUri} style={styles.commentSheetAvatar} contentFit="cover" />
                              ) : (
                                <View style={isGuestComment ? styles.commentSheetAvatarPlaceholderGuest : styles.commentSheetAvatarPlaceholder}>
                                  <Text style={isGuestComment ? styles.commentSheetAvatarInitialGuest : styles.commentSheetAvatarInitial}>{(authorName || '—').charAt(0).toUpperCase()}</Text>
                                </View>
                              )}
                              <View style={styles.commentSheetRowBody}>
                                <Text style={styles.commentSheetAuthor}>{authorName}</Text>
                                <Text style={styles.commentSheetText}>{c.content}</Text>
                                <View style={styles.commentSheetMetaRow}>
                                  <Text style={styles.commentSheetTime}>{formatDistanceToNow(new Date(c.created_at), { addSuffix: true, locale: tr })}</Text>
                                  {canDelete ? (
                                    <TouchableOpacity onPress={() => deleteOwnComment(post.id, c.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                      <Text style={styles.commentDeleteText}>Sil</Text>
                                    </TouchableOpacity>
                                  ) : null}
                                </View>
                              </View>
                            </View>
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
                        onPress={() => submitComment(post.id, post.staff_id ?? null, post.guest_id ?? null)}
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
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>

      {/* Bildir modal: sebep + açıklama */}
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

      {/* Gönderi medyası tam ekran (resim / video) — personel ile aynı */}
      <Modal
        visible={!!fullscreenPostMedia}
        transparent
        animationType="fade"
        onRequestClose={() => setFullscreenPostMedia(null)}
      >
        <Pressable
          style={[styles.fullscreenOverlay, { width: SCREEN_WIDTH, height: SCREEN_HEIGHT }]}
          onPress={() => setFullscreenPostMedia(null)}
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
                      style={[styles.fullscreenImage, styles.fullscreenVideo, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                      useNativeControls={false}
                      resizeMode="contain"
                      isLooping={false}
                      shouldPlay
                      isMuted={false}
                      onLoad={() => {
                        setFullscreenVideoReady(true);
                        fullscreenVideoRef.current?.playAsync().catch(() => {});
                        fullscreenVideoRef.current?.setVolumeAsync(1.0).catch(() => {});
                      }}
                    />
                    {fullscreenPostMedia.posterUri && !fullscreenVideoReady ? (
                      <CachedImage
                        uri={fullscreenPostMedia.posterUri}
                        style={[StyleSheet.absoluteFillObject, styles.fullscreenPosterImage, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                        contentFit="contain"
                        pointerEvents="none"
                      />
                    ) : null}
                  </>
                ) : (
                  <CachedImage
                    uri={fullscreenPostMedia.uri}
                    style={[styles.fullscreenImage, { width: SCREEN_WIDTH - 48, height: SCREEN_HEIGHT - 96 }]}
                    contentFit="contain"
                  />
                )}
              </View>
              <TouchableOpacity
                style={styles.fullscreenCloseBtn}
                onPress={() => setFullscreenPostMedia(null)}
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name="close-circle" size={40} color="rgba(255,255,255,0.9)" />
              </TouchableOpacity>
            </>
          ) : null}
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg, paddingBottom: theme.spacing.xxl + 24 },
  heroCard: {
    borderRadius: theme.radius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}28`,
    ...theme.shadows.md,
  },
  heroTitle: { fontSize: 24, fontWeight: '800', color: theme.colors.text, lineHeight: 30, marginBottom: 6 },
  heroSubtitle: {
    fontSize: 15,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginTop: 6,
    lineHeight: 22,
  },
  heroLocationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: theme.radius.full,
    backgroundColor: 'rgba(255,255,255,0.75)',
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    maxWidth: '100%',
  },
  heroLocationChipText: { flex: 1, fontSize: 13, color: theme.colors.text, fontWeight: '500' },
  heroDescription: {
    marginTop: 12,
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: theme.spacing.lg,
  },
  quickActionItem: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 4,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  quickActionIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${theme.colors.primary}14`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  quickActionLabel: { fontSize: 11, fontWeight: '600', color: theme.colors.text, textAlign: 'center' },
  facilitiesRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    gap: 12,
    paddingRight: theme.spacing.xl,
  },
  facilityChip: {
    width: 88,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  facilityIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: `${theme.colors.primary}12`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  facilityChipName: { fontSize: 11, fontWeight: '600', color: theme.colors.text, textAlign: 'center', lineHeight: 14 },
  sectionTitleAfterHero: { marginTop: theme.spacing.sm },
  feedSectionHeading: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.2,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    letterSpacing: 0.3,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    marginTop: theme.spacing.xl,
    marginBottom: theme.spacing.md,
    letterSpacing: 0.2,
  },
  storyScroll: { marginHorizontal: -theme.spacing.lg },
  storyRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    gap: 16,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  storyItem: { alignItems: 'center', width: 80 },
  storyRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    overflow: 'hidden',
  },
  storyAvatar: { width: 72, height: 72, borderRadius: 36 },
  storyAvatarPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: theme.colors.primaryLight + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  storyAvatarLetter: { fontSize: 28, fontWeight: '700', color: theme.colors.primary },
  staffCardsRow: {
    flexDirection: 'row',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    gap: 24,
    paddingRight: theme.spacing.xl,
  },
  staffCard: { width: 80, alignItems: 'center' },
  staffCardInner: { alignItems: 'center' },
  staffCardRing: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 2.5,
    borderColor: theme.colors.success,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  staffCardAvatar: { width: 68, height: 68, borderRadius: 34, backgroundColor: theme.colors.borderLight },
  staffCardPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primaryLight + '50',
  },
  staffCardPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  staffCardLetter: { fontSize: 26, fontWeight: '700', color: theme.colors.primary },
  staffCardLetterGuest: { fontSize: 26, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  staffCardTextBlock: { minHeight: 36, alignItems: 'center', justifyContent: 'flex-start' },
  staffCardName: { fontWeight: '600', fontSize: 13, color: theme.colors.text, textAlign: 'center' },
  staffCardDept: { fontSize: 11, color: theme.colors.textMuted, marginTop: 4, textAlign: 'center' },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  statusDotOnline: {},
  messageAvatarWrap: { position: 'relative', marginRight: 12 },
  messageOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: theme.colors.success,
    borderWidth: 2,
    borderColor: theme.colors.surface,
  },
  storyTextBlock: {
    width: '100%',
    minHeight: 36,
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  storyName: { fontWeight: '600', fontSize: 12, color: theme.colors.text, textAlign: 'center' },
  storyDept: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2, textAlign: 'center' },
  hotelCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
    position: 'relative',
  },
  hotelCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.lg,
  },
  hotelCardInner: { padding: theme.spacing.lg, paddingLeft: theme.spacing.lg + 4 },
  hotelCardTop: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  hotelIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: `${theme.colors.primary}18`,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  hotelCardHead: { flex: 1 },
  hotelCardTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 4 },
  hotelStarsPill: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: theme.radius.full,
    backgroundColor: `${theme.colors.primary}20`,
  },
  hotelStarsText: { fontSize: 12, fontWeight: '600', color: theme.colors.primaryDark },
  hotelFacilities: { fontSize: 13, color: theme.colors.textMuted, marginBottom: 14, lineHeight: 20 },
  hotelCardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  hotelCardLink: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  hotelQuickLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  quickLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  quickLinkText: { fontSize: 14, color: theme.colors.text, fontWeight: '600' },
  roomCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    overflow: 'hidden',
    ...theme.shadows.md,
    position: 'relative',
  },
  roomCardAccent: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: theme.colors.primary,
    borderTopLeftRadius: theme.radius.lg,
    borderBottomLeftRadius: theme.radius.lg,
  },
  roomCardInner: { padding: theme.spacing.lg, paddingLeft: theme.spacing.lg + 4 },
  roomCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  roomNumberBadge: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  roomTitle: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  roomViewChip: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderLight,
  },
  roomViewChipText: { fontSize: 12, fontWeight: '600', color: theme.colors.textSecondary },
  roomDatesRow: { gap: 8, marginBottom: 4 },
  roomDateItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  roomMeta: { fontSize: 13, color: theme.colors.textSecondary },
  roomActions: { flexDirection: 'row', gap: 10, marginTop: 16 },
  roomBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: theme.radius.md,
    backgroundColor: `${theme.colors.primary}14`,
    borderWidth: 1,
    borderColor: `${theme.colors.primary}30`,
  },
  roomBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  messageList: { gap: 8 },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  messageAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.borderLight },
  messageAvatarPlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primaryLight + '40',
    justifyContent: 'center',
    alignItems: 'center',
  },
  messageAvatarLetter: { fontSize: 18, fontWeight: '700', color: theme.colors.primary },
  messageBody: { flex: 1 },
  messageLabel: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  messageDept: { fontSize: 13, color: theme.colors.textMuted, marginTop: 2 },
  collapseSection: { marginBottom: 4 },
  feedBlockTop: { marginTop: theme.spacing.xs },
  collapseHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  collapseLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  feedTagFilters: { marginBottom: 12 },
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
  feedList: { gap: 14 },
  feedItem: {
    flexDirection: 'column',
    backgroundColor: theme.colors.surface,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: theme.colors.primary + '22',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 14,
    elevation: 8,
  },
  feedItemAccent: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    backgroundColor: theme.colors.primaryLight,
    zIndex: 2,
  },
  feedLocationBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
  },
  feedLocationText: {
    fontSize: 12,
    color: theme.colors.primary,
    fontWeight: '600',
    flex: 1,
  },
  feedItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  feedAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.borderLight,
  },
  feedAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '20',
  },
  feedAvatarPlaceholderGuest: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.guestAvatarBg,
  },
  feedAvatarLetter: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.primary,
  },
  feedAvatarLetterGuest: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.guestAvatarLetter,
  },
  feedItemHeaderText: { flex: 1, minWidth: 0 },
  feedHeaderActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  feedDeleteHeaderBtn: { padding: 8 },
  feedMenuBtn: { padding: 8 },
  feedAuthorName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  menuModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  menuModalBox: {
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    minWidth: 200,
    overflow: 'hidden',
  },
  menuModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  menuModalItemText: { fontSize: 16, fontWeight: '500', color: theme.colors.text },
  reportModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  reportModalContent: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 34,
  },
  reportModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  reportModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  reportModalScroll: { paddingHorizontal: 20, paddingTop: 16 },
  reportModalSubtitle: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 10 },
  reportReasonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 4,
  },
  reportReasonRowSelected: { backgroundColor: theme.colors.primaryLight + '30', borderRadius: 10 },
  reportReasonLabel: { fontSize: 15, color: theme.colors.text },
  reportDetailsInput: {
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: theme.colors.text,
    minHeight: 80,
    textAlignVertical: 'top',
    marginBottom: 20,
  },
  reportSubmitBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  reportSubmitBtnDisabled: { opacity: 0.5 },
  reportSubmitBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  postMediaTouchable: { width: '100%', paddingHorizontal: 12 },
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
  feedItemBody: { padding: 12, paddingTop: 4 },
  feedItemTitle: { fontWeight: '600', fontSize: 15, color: theme.colors.text },
  feedItemTitleTextOnly: { fontSize: 16, lineHeight: 24, marginBottom: 0 },
  feedItemMetaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginTop: 2 },
  feedItemMeta: { fontSize: 12, color: theme.colors.textMuted },
  feedItemDate: { fontSize: 12, color: theme.colors.textMuted },
  feedActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.borderLight },
  feedActionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  feedActionCount: { fontSize: 13, color: theme.colors.textSecondary },
  feedDetailLink: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  commentSheetOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  commentSheetKeyboard: { maxHeight: '80%' },
  commentSheetCard: { backgroundColor: theme.colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 24, maxHeight: '100%' },
  commentSheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  commentSheetTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
  commentSheetScroll: { maxHeight: 280 },
  commentSheetScrollContent: { padding: 20, paddingBottom: 16 },
  commentSheetRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12, gap: 10 },
  commentSheetAvatar: { width: 36, height: 36, borderRadius: 18 },
  commentSheetAvatarPlaceholder: { width: 36, height: 36, borderRadius: 18, backgroundColor: theme.colors.borderLight, justifyContent: 'center', alignItems: 'center' },
  commentSheetAvatarPlaceholderGuest: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: theme.colors.guestAvatarBg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentSheetAvatarInitial: { fontSize: 16, fontWeight: '700', color: theme.colors.textSecondary },
  commentSheetAvatarInitialGuest: { fontSize: 16, fontWeight: '700', color: theme.colors.guestAvatarLetter },
  commentSheetRowBody: { flex: 1, minWidth: 0 },
  commentSheetAuthor: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  commentSheetText: { fontSize: 14, color: theme.colors.text, marginTop: 2 },
  commentSheetMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 2 },
  commentSheetTime: { fontSize: 11, color: theme.colors.textMuted, marginTop: 2 },
  commentDeleteText: { fontSize: 12, color: theme.colors.error, fontWeight: '700' },
  commentSheetEmpty: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', paddingVertical: 24 },
  commentSheetInputRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 10, paddingHorizontal: 20, paddingTop: 12 },
  commentSheetInput: { flex: 1, borderWidth: 1, borderColor: theme.colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: theme.colors.text, maxHeight: 100 },
  commentSendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: theme.colors.primary, justifyContent: 'center', alignItems: 'center' },
  commentSendBtnDisabled: { opacity: 0.5 },
  emptyFeed: {
    padding: theme.spacing.xl,
    paddingVertical: theme.spacing.xxl,
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    marginBottom: theme.spacing.md,
  },
  emptyFeedIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: `${theme.colors.primary}16`,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  emptyFeedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: theme.colors.text,
    textAlign: 'center',
    marginBottom: 8,
  },
  emptyFeedText: {
    fontSize: 14,
    lineHeight: 21,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.lg,
  },
  emptyFeedCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: theme.radius.md,
  },
  emptyFeedCtaText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emptyFeedCtaSecondary: {
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  emptyFeedCtaSecondaryText: { color: theme.colors.primary, fontWeight: '700', fontSize: 15 },
  showAllBtn: { padding: theme.spacing.md, alignItems: 'center' },
  showAllText: { color: theme.colors.primary, fontWeight: '600', fontSize: 14 },
  fullscreenOverlay: {
    flex: 1,
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImageWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
  },
  fullscreenImage: { backgroundColor: '#000' },
  fullscreenCloseBtn: {
    position: 'absolute',
    top: 48,
    right: 16,
    zIndex: 10,
  },
});
