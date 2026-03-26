import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

const DEVICE_ID_KEY = '@valoria/device_id';

/** Cihaz için benzersiz ID (ban/deleted takibi için). Kalıcı, uygulama silinene kadar aynı kalır. */
async function getDeviceId(): Promise<string> {
  try {
    if (Platform.OS === 'android') {
      try {
        const { default: Application } = await import('expo-application');
        const id = await Application.getAndroidId();
        if (id) return id;
      } catch (_) {
        /* expo-application yoksa fallback */
      }
    }
    const stored = await AsyncStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const uuid = `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DEVICE_ID_KEY, uuid);
    return uuid;
  } catch (e) {
    log.warn('updateGuestLoginInfo', 'getDeviceId', (e as Error)?.message);
    return `fallback-${Date.now()}`;
  }
}

/** Auth provider adını Supabase formatından Türkçe etiketine çevir */
function getAuthProviderLabel(provider: string | undefined): string {
  if (!provider) return '';
  const map: Record<string, string> = {
    google: 'Google',
    apple: 'Apple',
    email: 'E-posta',
    anonymous: 'Misafir (anonim)',
  };
  return map[provider] ?? provider;
}

/**
 * Misafir giriş bilgilerini backend'e gönderir.
 * getOrCreateGuestForCaller'dan sonra çağrılmalı.
 */
export async function updateGuestLoginInfo(user: { id: string; app_metadata?: { provider?: string }; created_at?: string } | null): Promise<void> {
  if (!user) return;
  try {
    const [deviceId, platform] = await Promise.all([
      getDeviceId(),
      Promise.resolve(Platform.OS === 'web' ? 'web' : Platform.OS),
    ]);
    const provider = (user.app_metadata?.provider as string) ??
      (user as { identities?: { provider?: string }[] }).identities?.[0]?.provider ??
      (Array.isArray(user.app_metadata?.providers) ? (user.app_metadata?.providers as string[])?.[0] : undefined);
    const authCreatedAt = user.created_at ? new Date(user.created_at).toISOString() : null;

    await supabase.rpc('update_guest_login_info', {
      p_device_id: deviceId,
      p_platform: platform,
      p_auth_provider: provider ?? null,
      p_auth_created_at: authCreatedAt,
    });
  } catch (e) {
    log.warn('updateGuestLoginInfo', 'RPC error', (e as Error)?.message);
  }
}

export { getAuthProviderLabel };
