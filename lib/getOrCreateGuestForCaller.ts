import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';
import { updateGuestLoginInfo } from '@/lib/updateGuestLoginInfo';
import { isOpaqueGuestDisplayString } from '@/lib/guestDisplayName';
import type { User } from '@supabase/supabase-js';

/**
 * Apple/Google dahil tüm giriş türlerinde kullanılacak full_name.
 * user_metadata.full_name, name veya email ön eki.
 */
export function getGuestFullNameFromUser(user: User | null | undefined): string | undefined {
  if (!user) return undefined;
  const meta = user.user_metadata ?? {};
  const full = (meta.full_name ?? meta.name ?? '') as string;
  if (full && String(full).trim()) {
    const t = String(full).trim();
    if (!isOpaqueGuestDisplayString(t)) return t;
  }
  const email = (user.email ?? meta.email ?? '') as string;
  if (email && String(email).trim()) {
    const local = String(email).trim().split('@')[0] || '';
    if (local && !isOpaqueGuestDisplayString(local)) return local;
  }
  return undefined;
}

/**
 * Çağıran kullanıcı (auth.uid()) için misafir getir veya oluştur.
 * Apple/Google girişte JWT'de email olmayabilir; 046 migration auth_user_id ile eşleştirir.
 * is_new: bu oturumda yeni kayıt oluşturulduysa true (misafir hesap bildirimi için).
 * Arka planda cihaz/platform/kayıt bilgisi admin panele gönderilir.
 */
export async function getOrCreateGuestForCaller(user: User | null | undefined): Promise<{ guest_id: string; app_token: string; is_new?: boolean } | null> {
  if (!user) return null;
  const fullName = getGuestFullNameFromUser(user);
  const { data: guestRow, error } = await supabase.rpc('get_or_create_guest_for_caller', {
    p_full_name: fullName ?? undefined,
  });
  if (error) {
    log.warn('getOrCreateGuestForCaller', 'RPC error', error.message, error.code, error.details);
    return null;
  }
  const row = Array.isArray(guestRow) && guestRow[0]
    ? (guestRow[0] as { guest_id: string; app_token: string; is_new?: boolean })
    : null;
  if (row) {
    updateGuestLoginInfo(user).catch((e) => log.warn('getOrCreateGuestForCaller', 'updateGuestLoginInfo', (e as Error)?.message));
  }
  return row ?? null;
}

/**
 * Session'dan kullanıcı alıp misafir getir/oluştur. Store güncel olmasa bile çalışır.
 */
export async function getOrCreateGuestForCurrentSession(): Promise<{ guest_id: string; app_token: string } | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return getOrCreateGuestForCaller(session?.user ?? null);
}
