/**
 * Misafir full_name bazen JWT, app_token veya otomatik e-posta öneki gibi okunmaz
 * değerler içerebiliyor; arayüzde "Misafir" gösterilir.
 */

export function isOpaqueGuestDisplayString(s: string): boolean {
  const t = s.trim();
  if (!t) return true;
  if (/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.+-]+$/.test(t)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(t)) return true;
  if (/^guest_[a-f0-9]{8,}$/i.test(t)) return true;
  if (t.length >= 28 && !/\s/.test(t) && /^[A-Za-z0-9+/=_-]+$/.test(t)) return true;
  return false;
}

export function guestDisplayName(fullName: string | null | undefined, fallback = 'Misafir'): string {
  const raw = (fullName ?? '').trim();
  if (!raw) return fallback;
  if (isOpaqueGuestDisplayString(raw)) return fallback;
  return raw;
}
