import '@/lib/cryptoPolyfill';
import i18n, { LANG_STORAGE_KEY, LANGUAGES } from '../i18n';
import { getDeviceLanguageCode } from '@/lib/deviceLocale';
import { Stack, useRouter, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import { AppState, Alert, View, Image, Animated, StyleSheet, Platform, LayoutAnimation } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SplashScreen from 'expo-splash-screen';
import * as Linking from 'expo-linking';
import { saveLastRoute } from '@/lib/lastRoutePersistence';
import { log } from '@/lib/logger';
import { parseCheckinUrl } from '@/lib/checkinDeepLink';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';
import { initAuthListener } from '@/stores/authStore';
import { hasPolicyConsent, setPendingGuest } from '@/lib/policyConsent';
import { useAuthStore } from '@/stores/authStore';
import { useCustomerRoomStore } from '@/stores/customerRoomStore';
import { linkGuestToRoom } from '@/lib/linkGuestToRoom';
import {
  getExpoPushTokenAsync,
  getLastNotificationResponseAsync,
  addNotificationResponseListener,
  addNotificationReceivedListener,
  savePushTokenForStaff,
} from '@/lib/notificationsPush';
import { OfflineBanner } from '@/components/OfflineBanner';
import { ErrorBoundary } from '@/components/ErrorBoundary';

if (Platform.OS !== 'web') {
  SplashScreen.preventAutoHideAsync();
}
log.info('RootLayout', 'app başlatılıyor');

const splashLogoSource = require('../assets/valoria-splash-logo.png');

const WEB_BG = '#1a365d';

export default function RootLayout() {
  const [showSplashLogo, setShowSplashLogo] = useState(true);
  const splashOpacity = useRef(new Animated.Value(0)).current;

  // LayoutAnimation.configureNext native callback sızıntısını önle (yazarken donma / 501 pending callbacks)
  useEffect(() => {
    if (typeof LayoutAnimation?.configureNext === 'function') {
      const noop = () => {};
      LayoutAnimation.configureNext = noop;
    }
  }, []);

  // Web: body arka planı (beyaz ekran önleme) ve splash atla
  useEffect(() => {
    if (Platform.OS === 'web') {
      if (typeof document !== 'undefined') document.body.style.backgroundColor = WEB_BG;
      setShowSplashLogo(false);
      return () => {
        if (typeof document !== 'undefined') document.body.style.backgroundColor = '';
      };
    }
  }, []);
  // Açılış logosu: çok kısa göster (sadece native)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    const t = setTimeout(() => {
      Animated.sequence([
        Animated.timing(splashOpacity, { toValue: 1, duration: 120, useNativeDriver: true }),
        Animated.delay(140),
        Animated.timing(splashOpacity, { toValue: 0, duration: 120, useNativeDriver: true }),
      ]).start(() => setShowSplashLogo(false));
    }, 20);
    return () => clearTimeout(t);
  }, [splashOpacity]);

  // Dil: Önce kaydedilmiş tercih, yoksa cihaz dili; böylece uygulama tam seçilen dilde açılır
  useEffect(() => {
    const supportedCodes = new Set(LANGUAGES.map((l) => l.code));
    AsyncStorage.getItem(LANG_STORAGE_KEY).then((saved) => {
      const lang =
        saved && supportedCodes.has(saved as (typeof LANGUAGES)[number]['code'])
          ? saved
          : getDeviceLanguageCode();
      if (i18n.language !== lang) i18n.changeLanguage(lang);
      if (!saved) AsyncStorage.setItem(LANG_STORAGE_KEY, lang);
    });
  }, []);
  // Splash'ı hemen gizle, anasayfa/redirect görünsün (web'de native splash yok)
  useEffect(() => {
    if (Platform.OS === 'web') return;
    SplashScreen.hideAsync()
      .then(() => log.info('RootLayout', 'SplashScreen gizlendi'))
      .catch((e) => log.error('RootLayout', 'SplashScreen hatası', e));
  }, []);
  const router = useRouter();
  const pathname = usePathname();
  const setQR = useGuestFlowStore((s) => s.setQR);
  const staff = useAuthStore((s) => s.staff);

  // Uygulama arka plana gidince / tekrar açılınca son ekrana dönmek için rotayı sakla
  useEffect(() => {
    saveLastRoute(pathname);
  }, [pathname]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background') saveLastRoute(pathname);
    });
    return () => sub.remove();
  }, [pathname]);

  useEffect(() => {
    const sub = initAuthListener();
    return () => {
      sub?.data?.subscription?.unsubscribe?.();
    };
  }, []);

  // Staff giriş yaptıysa push token al ve kaydet (beğeni/yorum push’u iOS dahil çalışsın)
  useEffect(() => {
    if (!staff) return;
    getExpoPushTokenAsync()
      .then((token) => {
        if (token) savePushTokenForStaff(staff.id).catch((e) => log.warn('RootLayout', 'push token kayıt', e));
      })
      .catch((e) => log.warn('RootLayout', 'push token', e));
  }, [staff?.id]);

  // Bildirime tıklandığında yönlendir (aynı mantık hem listener hem cold start için)
  const handleNotificationResponse = (data: Record<string, unknown> | undefined) => {
    if (!data) return;
    const { staff } = useAuthStore.getState();
    const url = data?.url && typeof data.url === 'string' ? (data.url as string) : '';
    const isInternalPath = url.startsWith('/');
    if (isInternalPath) {
      const postId = data.postId && typeof data.postId === 'string' ? data.postId : undefined;
      if (postId) {
        router.push({ pathname: url, params: { openPostId: postId } });
      } else {
        router.push(url);
      }
    } else if (data?.screen === 'admin' || (staff?.role === 'admin' && data?.screen === 'notifications')) {
      router.push('/admin');
    } else if (data?.screen === 'notifications') {
      const goToNotifications = () => router.push('/go-to-notifications');
      requestAnimationFrame(() => setTimeout(goToNotifications, 100));
    }
  };

  // Uygulama bildirime tıklanarak açıldıysa (kapalıyken tıklandı) ilgili sayfaya git
  const coldStartHandled = useRef(false);
  useEffect(() => {
    if (coldStartHandled.current) return;
    coldStartHandled.current = true;
    const t = setTimeout(() => {
      getLastNotificationResponseAsync().then((response) => {
        if (response?.notification?.request?.content?.data) {
          handleNotificationResponse(response.notification.request.content.data as Record<string, unknown>);
        }
      });
    }, 600);
    return () => clearTimeout(t);
  }, [router]);

  useEffect(() => {
    const remove = addNotificationResponseListener((response) => {
      const data = response.notification.request.content.data as Record<string, unknown> | undefined;
      handleNotificationResponse(data);
    });
    return remove;
  }, [router]);

  // Uygulama öndeyken bildirim gelince badge hemen güncellensin, sonra uyarı göster
  useEffect(() => {
    const remove = addNotificationReceivedListener((notification) => {
      const { staff } = useAuthStore.getState();
      if (staff) {
        import('@/stores/staffNotificationStore').then(({ useStaffNotificationStore }) =>
          useStaffNotificationStore.getState().refresh()
        );
      } else {
        import('@/stores/guestNotificationStore').then(({ useGuestNotificationStore }) =>
          useGuestNotificationStore.getState().refresh()
        );
      }
      const content = notification.request.content;
      const title = (content.title as string) || 'Bildirim';
      const body = (content.body as string) || '';
      Alert.alert(title, body, [
        { text: 'Tamam' },
        {
          text: 'Bildirimlere git',
          onPress: () => {
            requestAnimationFrame(() => setTimeout(() => router.push('/go-to-notifications'), 100));
          },
        },
      ]);
    });
    return remove;
  }, [router]);

  // Deep link: auth/callback (magic link) veya guest (QR/NFC)
  useEffect(() => {
    const handleUrl = async (url: string) => {
      if (url.includes('auth/callback') && url.includes('#')) {
        const hashStart = url.indexOf('#') + 1;
        const hash = url.slice(hashStart);
        const params: Record<string, string> = {};
        hash.split('&').forEach((part) => {
          const [k, v] = part.split('=');
          if (k && v) params[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' '));
        });
        const access_token = params.access_token;
        const refresh_token = params.refresh_token;
        if (access_token && refresh_token) {
          try {
            await supabase.auth.setSession({ access_token, refresh_token });
            await useAuthStore.getState().loadSession();
            const { user, staff } = useAuthStore.getState();
            const { pendingRoom, clearPendingRoom } = useCustomerRoomStore.getState();
            if (pendingRoom && user?.email) {
              await linkGuestToRoom(user.email, pendingRoom.roomId, user.user_metadata?.full_name);
              clearPendingRoom();
            }
            router.replace('/');
          } catch (e) {
            log.error('RootLayout', 'auth/callback setSession', e);
            router.replace('/auth/callback');
          }
        } else {
          router.replace('/auth/callback');
        }
        return;
      }
      const parsed = parseCheckinUrl(url);
      if (!parsed) return;
      log.info('RootLayout', 'Deep link', parsed);

      // Tek sayfa sözleşme onayı: doğrudan /guest/sign-one
      if (parsed.type === 'sign-one') {
        if (parsed.token) {
          const { data } = await supabase
            .from('room_qr_codes')
            .select('room_id, rooms(room_number)')
            .eq('token', parsed.token)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
          const roomId = (data as { room_id?: string })?.room_id ?? '';
          const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
          setQR(parsed.token, roomId, roomNumber);
        }
        // Web: QR ile açılan sayfada gizlilik ekranına yönlendirme; doğrudan sözleşme formunu göster
        if (Platform.OS === 'web') {
          router.replace({ pathname: '/guest/sign-one', params: { t: parsed.token ?? '', l: parsed.lang ?? 'tr' } });
          return;
        }
        const accepted = await hasPolicyConsent();
        if (accepted) {
          router.replace({ pathname: '/guest/sign-one', params: { token: parsed.token ?? '', lang: parsed.lang ?? '' } });
        } else {
          await setPendingGuest({
            token: parsed.token ?? '',
            roomId: useGuestFlowStore.getState().roomId ?? '',
            roomNumber: useGuestFlowStore.getState().roomNumber ?? '',
          });
          router.replace({ pathname: '/policies', params: { next: 'guest_sign_one' } });
        }
        return;
      }

      const goToGuestFlow = (token: string, roomId: string, roomNumber: string) => {
        setQR(token, roomId, roomNumber);
        router.replace('/guest/language');
      };
      if (parsed.type === 'contract') {
        useGuestFlowStore.getState().setStep('contract');
        if (parsed.token) {
          const { data } = await supabase
            .from('room_qr_codes')
            .select('room_id, rooms(room_number)')
            .eq('token', parsed.token)
            .gt('expires_at', new Date().toISOString())
            .maybeSingle();
          const roomId = (data as { room_id?: string })?.room_id ?? '';
          const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
          useGuestFlowStore.getState().setQR(parsed.token, roomId, roomNumber);
        }
        const accepted = await hasPolicyConsent();
        if (accepted) {
          router.replace('/guest/contract');
        } else {
          useGuestFlowStore.getState().setStep('contract');
          router.replace({ pathname: '/policies', params: { next: 'guest_contract' } });
        }
        return;
      }
      if (parsed.type === 'token' && parsed.token) {
        const { data } = await supabase
          .from('room_qr_codes')
          .select('room_id, rooms(room_number)')
          .eq('token', parsed.token)
          .gt('expires_at', new Date().toISOString())
          .maybeSingle();
        const roomId = (data as { room_id?: string })?.room_id ?? '';
        const roomNumber = (data as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
        const accepted = await hasPolicyConsent();
        if (accepted) {
          goToGuestFlow(parsed.token!, roomId, roomNumber);
        } else {
          await setPendingGuest({ token: parsed.token!, roomId, roomNumber });
          router.replace({ pathname: '/policies', params: { next: 'guest' } });
        }
      } else if (parsed.type === 'room' && parsed.roomId) {
        const { data: qrData } = await supabase
          .from('room_qr_codes')
          .select('token, rooms(room_number)')
          .eq('room_id', parsed.roomId)
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        const token = (qrData as { token?: string })?.token ?? parsed.roomId;
        const roomNumber = (qrData as { rooms?: { room_number?: string } })?.rooms?.room_number ?? '';
        const accepted = await hasPolicyConsent();
        if (accepted) {
          goToGuestFlow(token, parsed.roomId!, roomNumber);
        } else {
          await setPendingGuest({ token, roomId: parsed.roomId!, roomNumber });
          router.replace({ pathname: '/policies', params: { next: 'guest' } });
        }
      }
    };
    Linking.getInitialURL().then((url) => {
      if (url) handleUrl(url);
    });
    const sub = Linking.addEventListener('url', ({ url }) => handleUrl(url));
    return () => sub.remove();
  }, []);

  return (
    <ErrorBoundary>
      <StatusBar style="auto" />
      <OfflineBanner />
      {showSplashLogo ? (
        <Animated.View style={[styles.splashLogoOverlay, { opacity: splashOpacity }]} pointerEvents="none">
          <View style={styles.splashLogoBg}>
            <Image source={splashLogoSource} style={styles.splashLogoImage} resizeMode="contain" />
          </View>
        </Animated.View>
      ) : null}
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="room-select" options={{ headerShown: false }} />
        <Stack.Screen name="policies" />
        <Stack.Screen name="legal/[type]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="permissions" options={{ headerShown: true, title: 'İzinler' }} />
        <Stack.Screen name="auth" options={{ headerShown: false }} />
        <Stack.Screen name="guest" options={{ headerShown: false }} />
        <Stack.Screen name="customer" options={{ headerShown: false }} />
        <Stack.Screen name="admin" options={{ headerShown: false }} />
        <Stack.Screen name="staff" options={{ headerShown: false }} />
        <Stack.Screen name="join" options={{ headerShown: true, title: 'Personel Başvurusu' }} />
        <Stack.Screen name="go-to-notifications" options={{ headerShown: false }} />
      </Stack>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  splashLogoOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogoBg: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  splashLogoImage: {
    width: '100%',
    maxWidth: 460,
    aspectRatio: 1,
  },
});
