import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Linking,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getOrCreateGuestForCaller } from '@/lib/getOrCreateGuestForCaller';
import { getGuestNotificationToken, setGuestNotificationToken } from '@/lib/guestNotificationToken';
import { GUEST_PREF_KEYS } from '@/lib/notifications';
import { getExpoPushTokenAsync, savePushTokenForGuest, isExpoGo } from '@/lib/notificationsPush';
import { useGuestNotificationStore } from '@/stores/guestNotificationStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  data?: Record<string, unknown> | null;
  category?: string | null;
};

const PREF_LABELS: Record<string, string> = {
  [GUEST_PREF_KEYS.service_updates]: 'Hizmet bildirimleri (taleplerim)',
  [GUEST_PREF_KEYS.checkin_checkout_reminders]: 'Check-in/out hatırlatmaları',
  [GUEST_PREF_KEYS.hotel_announcements]: 'Otel duyuruları',
  [GUEST_PREF_KEYS.campaigns]: 'Kampanya ve fırsatlar',
  [GUEST_PREF_KEYS.marketing]: 'Pazarlama mesajları',
};

export default function CustomerNotificationsScreen() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [list, setList] = useState<NotifRow[]>([]);
  const [prefs, setPrefs] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);

  const { refresh: refreshNotificationCount, setUnreadCount, setNotificationsScreenFocused } = useGuestNotificationStore();

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      setNotificationsScreenFocused(true);
      load();
      return () => setNotificationsScreenFocused(false);
    }, [setUnreadCount, setNotificationsScreenFocused, load])
  );

  const load = useCallback(async () => {
    // Push iznini burada otomatik isteme: sadece durum kontrol et.
    if (!isExpoGo) {
      try {
        const Notifications = await import('expo-notifications').then((m) => m.default);
        const { status } = await Notifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      } catch {
        setPushPerm('unknown');
      }
    }
    let t = await getGuestNotificationToken();
    if (!t) {
      const { data: { session: s } } = await supabase.auth.getSession();
      if (s?.user) {
        const row = await getOrCreateGuestForCaller(s.user);
        t = row?.app_token ?? null;
        if (t) {
          await setGuestNotificationToken(t);
          await useGuestMessagingStore.getState().setAppToken(t);
        }
      }
    }
    setToken(t);
    if (!t) {
      setList([]);
      useGuestNotificationStore.getState().setUnreadCount(0);
      setLoading(false);
      return;
    }
    // Push token kaydı kullanıcı izni verdikten sonra yapılır (kart aksiyonu ile).
    const { data } = await supabase.rpc('get_guest_notifications', { p_app_token: t });
    const rows = (data as NotifRow[]) ?? [];
    const unreadIds = rows.filter((n) => !n.read_at).map((n) => n.id);
    await Promise.all(
      unreadIds.map((id) => supabase.rpc('mark_guest_notification_read', { p_app_token: t, p_notification_id: id }))
    );
    const now = new Date().toISOString();
    setList(rows.map((n) => (unreadIds.includes(n.id) ? { ...n, read_at: now } : n)));
    useGuestNotificationStore.getState().setUnreadCount(0);
    const { data: prefsData } = await supabase.rpc('get_guest_notification_preferences', { p_app_token: t });
    const map: Record<string, boolean> = {};
    (prefsData as { pref_key: string; enabled: boolean }[] ?? []).forEach((p) => {
      map[p.pref_key] = p.enabled;
    });
    setPrefs(map);
    setPrefsLoaded(true);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(
        'Push bildirimleri desteklenmiyor',
        'Push bildirimleri Expo Go içinde çalışmaz. Lütfen development build veya yüklenmiş uygulama (App Store / Play Store) ile deneyin.',
        [{ text: 'Tamam' }]
      );
      return;
    }
    if (!token) {
      Alert.alert('Bekleyin', 'Bildirim hesabı hazırlanıyor, lütfen sayfayı yenileyip tekrar deneyin.');
      return;
    }
    setEnablingPush(true);
    try {
      const expoPushToken = await getExpoPushTokenAsync();
      if (expoPushToken) {
        await savePushTokenForGuest(token);
        setPushPerm('granted');
      } else {
        const Notifications = await import('expo-notifications').then((m) => m.default);
        const { status } = await Notifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
        if (status === 'denied') {
          Alert.alert(
            'Bildirim izni reddedildi',
            'Bildirim almak için lütfen ayarlardan izin verin.',
            [
              { text: 'İptal', style: 'cancel' },
              { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
            ]
          );
        }
      }
    } catch (e) {
      Alert.alert('Hata', 'İzin alınırken bir sorun oluştu. Lütfen tekrar deneyin.');
    } finally {
      setEnablingPush(false);
    }
  }, [token, enablingPush]);

  const handleNotificationPress = useCallback(
    async (n: NotifRow) => {
      if (!token) return;
      await supabase.rpc('mark_guest_notification_read', {
        p_app_token: token,
        p_notification_id: n.id,
      });
      setList((prev) =>
        prev.map((item) => (item.id === n.id ? { ...item, read_at: new Date().toISOString() } : item))
      );
      refreshNotificationCount();

      const data = n.data ?? {};
      const url = data.url as string | undefined;
      const postId = data.postId as string | undefined;

      // Sadece uygulama içi path kullan (valoria:/// gibi scheme URL'leri yok say)
      const isInternalPath = url && typeof url === 'string' && url.startsWith('/');
      if (isInternalPath) {
        if (postId) {
          router.push({ pathname: url, params: { openPostId: postId } });
        } else {
          router.push(url);
        }
      } else if (postId) {
        router.push({ pathname: '/customer/feed/[id]', params: { id: postId } });
      }
    },
    [token, refreshNotificationCount, router]
  );

  const togglePref = async (key: string, enabled: boolean) => {
    if (!token) return;
    await supabase.rpc('set_guest_notification_preference', {
      p_app_token: token,
      p_pref_key: key,
      p_enabled: enabled,
    });
    setPrefs((p) => ({ ...p, [key]: enabled }));
  };

  const user = useAuthStore((s) => s.user);
  if (!token && !loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>Bildirimler</Text>
        <View style={styles.emptyCard}>
          {!user ? (
            <>
              <Text style={styles.emptyTitle}>Bildirimleri görmek için giriş yapın</Text>
              <Text style={styles.emptyDesc}>
                Hesap oluşturup giriş yaptığınızda bildirimleriniz burada listelenir. Oda veya sözleşme adımı zorunlu değildir.
              </Text>
              <TouchableOpacity style={styles.btn} onPress={() => router.push('/auth')}>
                <Text style={styles.btnText}>Giriş yap</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text style={styles.emptyTitle}>Bildirim hesabı hazırlanamadı</Text>
              <Text style={styles.emptyDesc}>
                E-posta ile giriş yapıyorsanız tekrar deneyebilirsiniz.
              </Text>
              <TouchableOpacity style={styles.btn} onPress={() => { setLoading(true); load(); }}>
                <Text style={styles.btnText}>Tekrar dene</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </View>
    );
  }

  if (!token && loading) {
    return (
      <View style={[styles.container, styles.centered]}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>Bildirimler</Text>
      {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
        <View style={styles.pushCard}>
          <View style={styles.pushCardRow}>
            <Ionicons name="notifications-outline" size={20} color={theme.colors.primary} />
            <Text style={styles.pushCardTitle}>Bildirim izni gerekli</Text>
          </View>
          <Text style={styles.pushCardDesc}>
            {pushPerm === 'denied'
              ? 'Bildirim izni daha önce reddedildi. Ayarlardan izin verebilirsiniz.'
              : 'Duyurular ve hatırlatmalar için bildirim izni verin. İzni istemek için butona dokunun.'}
          </Text>
          <View style={styles.pushCardBtnRow}>
            <TouchableOpacity
              style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
              onPress={enablePush}
              disabled={enablingPush}
              activeOpacity={0.8}
            >
              {enablingPush ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.pushCardBtnText}>
                  {pushPerm === 'denied' ? 'Tekrar iste' : 'Bildirim izni ver'}
                </Text>
              )}
            </TouchableOpacity>
            {pushPerm === 'denied' && (
              <TouchableOpacity
                style={styles.pushCardBtnSecondary}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={styles.pushCardBtnSecondaryText}>Ayarları aç</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {list.length === 0 && !loading ? (
        <Text style={styles.noList}>Henüz bildirim yok.</Text>
      ) : (
        list.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.row, n.read_at ? styles.rowRead : null]}
            onPress={() => handleNotificationPress(n)}
            activeOpacity={0.8}
          >
            <View style={styles.rowContent}>
              {!n.read_at ? (
                <View style={styles.unreadDot} />
              ) : null}
              <View style={styles.rowTextWrap}>
                <Text style={styles.rowTitle}>{n.title}</Text>
                {n.body ? <Text style={styles.rowBody} numberOfLines={2}>{n.body}</Text> : null}
                <Text style={styles.rowTime}>{new Date(n.created_at).toLocaleString('tr-TR')}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
            </View>
          </TouchableOpacity>
        ))
      )}
      <Text style={styles.sectionTitle}>Bildirim ayarlarım</Text>
      {prefsLoaded &&
        Object.entries(GUEST_PREF_KEYS).map(([k, key]) => (
          <View key={key} style={styles.prefRow}>
            <Text style={styles.prefLabel}>{PREF_LABELS[key] ?? key}</Text>
            <TouchableOpacity
              style={[styles.toggle, prefs[key] !== false && styles.toggleOn]}
              onPress={() => togglePref(key, prefs[key] === false)}
            >
              <Text style={styles.toggleText}>{prefs[key] !== false ? 'Açık' : 'Kapalı'}</Text>
            </TouchableOpacity>
          </View>
        ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { justifyContent: 'center', alignItems: 'center' },
  content: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 16 },
  pushCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  pushCardDesc: { fontSize: 13, color: theme.colors.textSecondary, lineHeight: 18 },
  pushCardBtnRow: { marginTop: 12, gap: 10 },
  pushCardBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  pushCardBtnSecondaryText: { color: theme.colors.primary, fontWeight: '600' },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: theme.colors.text, marginBottom: 8 },
  emptyDesc: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 20 },
  btn: { backgroundColor: theme.colors.primary, padding: 14, borderRadius: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '600' },
  noList: { color: theme.colors.textMuted, fontSize: 14 },
  row: {
    backgroundColor: theme.colors.surface,
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  rowRead: { opacity: 0.85 },
  rowContent: { flexDirection: 'row', alignItems: 'center' },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginRight: 10,
  },
  rowTextWrap: { flex: 1 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginBottom: 4 },
  rowBody: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  rowTime: { fontSize: 12, color: theme.colors.textMuted },
  sectionTitle: { fontSize: 18, fontWeight: '600', color: theme.colors.text, marginTop: 28, marginBottom: 12 },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  prefLabel: { fontSize: 15, color: theme.colors.text },
  toggle: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, backgroundColor: theme.colors.borderLight },
  toggleOn: { backgroundColor: theme.colors.success + '30' },
  toggleText: { fontSize: 13, color: theme.colors.text, fontWeight: '500' },
});
