/** `role === 'admin'` kayıtları her zaman listenin başına (diğerleri `secondary` ile). */
export function sortStaffAdminFirst<T extends { role?: string | null }>(
  list: readonly T[],
  secondary: (a: T, b: T) => number = () => 0
): T[] {
  return [...list].sort((a, b) => {
    const aAd = a.role === 'admin' ? 0 : 1;
    const bAd = b.role === 'admin' ? 0 : 1;
    if (aAd !== bAd) return aAd - bAd;
    return secondary(a, b);
  });
}
