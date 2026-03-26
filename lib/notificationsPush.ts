/**
 * Valoria Hotel - Expo Push Notifications
 * Token alma, backend'e kaydetme, bildirim tıklama yönlendirmesi.
 * Expo Go'da push desteklenmediği için (SDK 53+) bu modül Expo Go'da no-op çalışır.
 */
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { emitPermissionLiveChange } from '@/lib/permissionLive';

const EXPO_PUSH_TOKEN_KEY = 'valoria_expo_push_token';

/** Expo Go içinde çalışıyoruz; push bildirimleri dev build'de çalışır */
export const isExpoGo = Constants.appOwnership === 'expo';

async function getNotifications() {
  if (isExpoGo) return null;
  const Notifications = await import('expo-notifications');
  return Notifications.default;
}

/** Uygulama açıkken gelen bildirimi nasıl göstereceğiz (sadece dev/build'de); sesli + öncelikli */
const VALORIA_CHANNEL_ID = 'valoria_urgent';
if (!isExpoGo) {
  import('expo-notifications').then(async (Notifications) => {
    Notifications.default.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
    if (Platform.OS === 'android') {
      try {
        // valoria_urgent: Yeni kanal - eski valoria kanalı kullanıcı ayarlarında sessize alınmış olabilir (Android kanal ayarları güncellenemez)
        await Notifications.default.setNotificationChannelAsync(VALORIA_CHANNEL_ID, {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Mesajlar, beğeniler ve duyurular',
        });

        await Notifications.default.setNotificationChannelAsync('valoria', {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });

        await Notifications.default.setNotificationChannelAsync('default', {
          name: 'Bildirimler',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
      } catch (e) {
        log.warn('notificationsPush', 'Android kanal ayarı', e);
      }
    }
  }).catch(() => {});
}

/** iOS: getExpoPushTokenAsync bazen asla resolve etmez (SDK 53+). Listener'ın uygulama başında kayıtlı olması gerekir. */
const IOS_TOKEN_TIMEOUT_MS = 14000;

/** iOS'ta push token'ın alınabilmesi için listener'ı uygulama başında kaydet. Root _layout'ta bir kez çağrılmalı. */
export function registerIOSPushTokenListener(): () => void {
  if (Platform.OS !== 'ios' || isExpoGo) return () => {};
  let removed = false;
  import('expo-notifications').then((Notifications) => {
    if (removed) return;
    const addListener = (Notifications.default as { addPushTokenListener?: (cb: (token: unknown) => void) => { remove: () => void } }).addPushTokenListener;
    if (typeof addListener !== 'function') return;
    addListener((payload: unknown) => {
      const data = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: string }).data : payload;
      const t = typeof data === 'string' ? data : null;
      if (t && t.startsWith('ExponentPushToken')) {
        AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, t).catch(() => {});
        log.info('notificationsPush', 'iOS push token listener ile alındı');
      }
    });
  }).catch(() => {});
  return () => { removed = true; };
}

/** İzin iste, Expo push token al; yoksa null (web, Expo Go veya izin reddi). */
/** Android 13+: Kanal token isteğinden önce oluşturulmalı; sesli bildirim için default kanal. */
/** iOS: İzin için açık seçenekler + token için listener/timeout workaround kullanılır. */
export async function getExpoPushTokenAsync(): Promise<string | null> {
  if (Platform.OS === 'web' || isExpoGo) return null;
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    if (Platform.OS === 'android') {
      try {
        await Notifications.setNotificationChannelAsync(VALORIA_CHANNEL_ID, {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
          description: 'Mesajlar, beğeniler ve duyurular',
        });
        await Notifications.setNotificationChannelAsync('valoria', {
          name: 'Valoria Bildirimleri',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Bildirimler',
          importance: Notifications.AndroidImportance.MAX,
          enableVibrate: true,
          enableLights: true,
          lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
          sound: 'default',
          vibrationPattern: [0, 250, 250, 250],
          showBadge: true,
        });
      } catch (e) {
        log.warn('notificationsPush', 'Android kanal (token öncesi)', e);
      }
    }
    const { status: existing } = await Notifications.getPermissionsAsync();
    let final = existing;
    if (existing !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      final = status;
      emitPermissionLiveChange();
    }
    if (existing === 'granted') emitPermissionLiveChange();
    if (final !== 'granted') {
      log.warn('notificationsPush', 'Push izni verilmedi');
      return null;
    }
    const projectId = (Constants.expoConfig as { extra?: { eas?: { projectId?: string } } } | null)?.extra?.eas?.projectId;

    if (Platform.OS === 'ios') {
      // iOS'ta getExpoPushTokenAsync bazen hiç dönmüyor (SDK 53+). Listener + timeout ile token al.
      let listenerResolve: (t: string | null) => void = () => {};
      const listenerPromise = new Promise<string | null>((resolve) => {
        listenerResolve = resolve;
      });
      let listenerRemover: (() => void) | undefined;
      try {
        const addListener = (Notifications as { addPushTokenListener?: (cb: (token: unknown) => void) => { remove: () => void } }).addPushTokenListener;
        if (typeof addListener === 'function') {
          const sub = addListener((payload: unknown) => {
            const data = payload && typeof payload === 'object' && 'data' in payload ? (payload as { data: string }).data : payload;
            const t = typeof data === 'string' ? data : null;
            if (t && t.startsWith('ExponentPushToken')) {
              AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, t).catch(() => {});
              listenerResolve(t);
              listenerRemover?.();
            }
          });
          if (sub?.remove) listenerRemover = sub.remove;
        }
      } catch (e) {
        log.warn('notificationsPush', 'addPushTokenListener', e);
      }
      const tokenPromise = projectId
        ? Notifications.getExpoPushTokenAsync({ projectId }).then((d) => d?.data ?? null)
        : Notifications.getExpoPushTokenAsync().then((d) => d?.data ?? null);
      const timeoutPromise = new Promise<string | null>((resolve) =>
        setTimeout(() => resolve(null), IOS_TOKEN_TIMEOUT_MS)
      );
      const token = await Promise.race([tokenPromise, listenerPromise, timeoutPromise]);
      listenerRemover?.();
      if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
      if (!token) log.warn('notificationsPush', 'iOS push token zaman aşımı veya henüz gelmedi');
      return token;
    }

    if (!projectId) {
      const tokenData = await Notifications.getExpoPushTokenAsync();
      const token = tokenData?.data ?? null;
      if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
      return token;
    }
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData?.data ?? null;
    if (token) await AsyncStorage.setItem(EXPO_PUSH_TOKEN_KEY, token);
    return token;
  } catch (e) {
    log.error('notificationsPush', 'getExpoPushTokenAsync', e);
    return null;
  }
}

/** Cihazda kayıtlı Expo push token */
export async function getStoredExpoPushToken(): Promise<string | null> {
  return AsyncStorage.getItem(EXPO_PUSH_TOKEN_KEY);
}

/** Personel giriş yaptığında: push token'ı backend'e kaydet (push_tokens.staff_id). Token yoksa önce izin isteyip alır. */
export async function savePushTokenForStaff(staffId: string): Promise<void> {
  if (isExpoGo) return;
  let token = await getStoredExpoPushToken();
  if (!token) token = await getExpoPushTokenAsync();
  if (!token) return;
  try {
    await supabase.from('push_tokens').upsert(
      {
        token,
        staff_id: staffId,
        guest_id: null,
        device_info: { platform: Platform.OS },
      },
      { onConflict: 'token' }
    );
    log.info('notificationsPush', 'Staff push token kaydedildi', { staffId: staffId.slice(0, 8) });
  } catch (e) {
    log.error('notificationsPush', 'savePushTokenForStaff', e);
  }
}

/** Misafir app_token ile: push token'ı backend'e kaydet (RPC ile push_tokens.guest_id). Token yoksa önce izin isteyip alır. */
export async function savePushTokenForGuest(appToken: string): Promise<void> {
  if (isExpoGo) return;
  if (!appToken) return;
  let token = await getStoredExpoPushToken();
  if (!token) token = await getExpoPushTokenAsync();
  if (!token) return;
  try {
    const { error } = await supabase.rpc('upsert_guest_push_token', {
      p_app_token: appToken,
      p_token: token,
    });
    if (error) log.error('notificationsPush', 'savePushTokenForGuest RPC', error);
    else log.info('notificationsPush', 'Guest push token kaydedildi');
  } catch (e) {
    log.error('notificationsPush', 'savePushTokenForGuest', e);
  }
}

/** Uygulama bildirime tıklanarak açıldıysa (cold start) son yanıtı döndürür. Expo Go'da null. */
export async function getLastNotificationResponseAsync(): Promise<{
  notification: { request: { content: { data?: Record<string, unknown> } } };
} | null> {
  if (isExpoGo) return null;
  try {
    const Notifications = await getNotifications();
    if (!Notifications) return null;
    const response = await Notifications.getLastNotificationResponseAsync();
    if (!response) return null;
    return response as unknown as { notification: { request: { content: { data?: Record<string, unknown> } } } };
  } catch (e) {
    log.warn('notificationsPush', 'getLastNotificationResponseAsync', e);
    return null;
  }
}

/** Bildirime tıklandığında çağrılacak (root layout'ta listener ile bağlanır). Expo Go'da no-op. */
export function addNotificationResponseListener(
  handler: (response: { notification: { request: { content: { data?: Record<string, unknown> } } } }) => void
): () => void {
  if (isExpoGo) return () => {};
  const noop = (): void => {};
  const cleanup = { remove: noop };
  import('expo-notifications').then((Notifications) => {
    const sub = Notifications.default.addNotificationResponseReceivedListener(
      handler as (r: import('expo-notifications').NotificationResponse) => void
    );
    cleanup.remove = () => sub.remove();
  }).catch(() => {});
  return () => cleanup.remove();
}

/** Uygulama öndeyken bildirim geldiğinde çağrılır (uyarı göstermek için). Expo Go'da no-op. */
export function addNotificationReceivedListener(
  handler: (notification: { request: { content: { title?: string; body?: string; data?: Record<string, unknown> } } }) => void
): () => void {
  if (isExpoGo) return () => {};
  const noop = (): void => {};
  const cleanup = { remove: noop };
  import('expo-notifications').then((Notifications) => {
    const sub = Notifications.default.addNotificationReceivedListener(
      handler as (n: import('expo-notifications').Notification) => void
    );
    cleanup.remove = () => sub.remove();
  }).catch(() => {});
  return () => cleanup.remove();
}
