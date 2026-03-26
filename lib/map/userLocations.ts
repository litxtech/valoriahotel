/**
 * Haritada kullanıcı avatarı: Konum paylaşan kullanıcılar avatar ile gösterilir.
 * Opt-in: upsertMyLocation çağrıldığında konum kaydedilir.
 */

import { supabase } from '@/lib/supabase';

export type MapUserMarker = {
  id: string;
  userId: string;
  userType: 'guest' | 'staff';
  lat: number;
  lng: number;
  displayName: string | null;
  avatarUrl: string | null;
  updatedAt: string;
};

const HAVERSINE_APPROX_1KM_LAT = 0.009;
const HAVERSINE_APPROX_1KM_LNG = 0.012;

/**
 * Yakındaki kullanıcıları getir (lat,lng merkez, radius ~3.5km).
 */
export async function fetchNearbyMapUsers(
  lat: number,
  lng: number,
  radiusKm = 3.5
): Promise<MapUserMarker[]> {
  const latDelta = HAVERSINE_APPROX_1KM_LAT * radiusKm;
  const lngDelta = HAVERSINE_APPROX_1KM_LNG * radiusKm;
  const latMin = lat - latDelta;
  const latMax = lat + latDelta;
  const lngMin = lng - lngDelta;
  const lngMax = lng + lngDelta;

  const { data, error } = await supabase
    .from('map_user_locations')
    .select('id, user_id, user_type, lat, lng, display_name, avatar_url, updated_at')
    .gte('lat', latMin)
    .lte('lat', latMax)
    .gte('lng', lngMin)
    .lte('lng', lngMax)
    .gte('updated_at', new Date(Date.now() - 30 * 60 * 1000).toISOString()); // Son 30 dk aktif

  if (error) return [];

  return (data ?? []).map((r) => ({
    id: r.id,
    userId: r.user_id,
    userType: r.user_type as 'guest' | 'staff',
    lat: Number(r.lat),
    lng: Number(r.lng),
    displayName: r.display_name ?? null,
    avatarUrl: r.avatar_url ?? null,
    updatedAt: r.updated_at,
  }));
}

/**
 * Kendi konumunu kaydet (opt-in). Harita açıkken periyodik çağrılabilir.
 */
export async function upsertMyLocation(params: {
  lat: number;
  lng: number;
  userType: 'guest' | 'staff';
  userId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
}): Promise<boolean> {
  const { data, error } = await supabase
    .from('map_user_locations')
    .upsert(
      {
        user_id: params.userId,
        user_type: params.userType,
        lat: params.lat,
        lng: params.lng,
        display_name: params.displayName ?? null,
        avatar_url: params.avatarUrl ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,user_type' }
    )
    .select('id')
    .maybeSingle();

  return !error && !!data;
}

/**
 * Konum paylaşımını kapat (kaydı sil).
 */
export async function removeMyLocation(userType: 'guest' | 'staff', userId: string): Promise<void> {
  await supabase
    .from('map_user_locations')
    .delete()
    .eq('user_type', userType)
    .eq('user_id', userId);
}
