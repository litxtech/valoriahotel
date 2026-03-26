/**
 * Nominatim (OpenStreetMap) ile serbest metin arama — Apple Maps benzeri entegre arama.
 * Tüm sonuçlar uygulama içi haritada gösterilir, dış uygulama kullanılmaz.
 */

import type { Poi, PoiType } from './pois';

const NOMINATIM_ENDPOINT = 'https://nominatim.openstreetmap.org/search';

const NOMINATIM_TO_POI_TYPE: Record<string, PoiType> = {
  restaurant: 'restaurant',
  cafe: 'cafe',
  fast_food: 'restaurant',
  bar: 'cafe',
  pub: 'cafe',
  hotel: 'hotel',
  hostel: 'hotel',
  pharmacy: 'pharmacy',
  hospital: 'hospital',
  clinic: 'hospital',
  doctors: 'hospital',
  police: 'police',
  bakery: 'cafe',
  supermarket: 'other',
  fuel: 'other',
  bank: 'other',
  atm: 'other',
  other: 'other',
};

function mapNominatimTypeToPoi(classVal: string, typeVal: string): PoiType {
  const key = (typeVal || classVal || 'other').toLowerCase();
  return NOMINATIM_TO_POI_TYPE[key] ?? 'other';
}

export type NominatimResult = {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  type?: string;
  class?: string;
  name?: string;
  address?: Record<string, string>;
  osm_type?: string;
  osm_id?: number;
};

export async function searchPoisByText(
  query: string,
  options?: {
    centerLat?: number;
    centerLng?: number;
    limit?: number;
    countryCodes?: string;
  }
): Promise<Poi[]> {
  const q = query.trim();
  if (!q || q.length < 2) return [];

  const params = new URLSearchParams({
    q,
    format: 'json',
    addressdetails: '1',
    limit: String(options?.limit ?? 15),
    'accept-language': 'tr',
  });

  if (options?.centerLat != null && options?.centerLng != null) {
    const delta = 0.05;
    const viewbox = [
      options.centerLng - delta,
      options.centerLat - delta,
      options.centerLng + delta,
      options.centerLat + delta,
    ].join(',');
    params.set('viewbox', viewbox);
    params.set('bounded', '0');
  }

  if (options?.countryCodes) {
    params.set('countrycodes', options.countryCodes);
  }

  const url = `${NOMINATIM_ENDPOINT}?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'ValoriaHotelApp/1.0 (contact@valoriahotel.com)',
    },
  });

  if (!res.ok) return [];
  const data = (await res.json()) as NominatimResult[];

  return data.map((r) => {
    const lat = parseFloat(r.lat);
    const lng = parseFloat(r.lon);
    const name = r.name ?? r.display_name?.split(',')[0]?.trim() ?? 'İsimsiz';
    const poiType = mapNominatimTypeToPoi(r.class ?? '', r.type ?? '');
    const addr = r.address;
    const address = addr
      ? [addr.road, addr.house_number, addr.city ?? addr.town ?? addr.village].filter(Boolean).join(', ')
      : null;

    return {
      id: `nominatim-${r.place_id}`,
      external_id: `n${r.place_id}`,
      name,
      type: poiType,
      lat,
      lng,
      address: address || null,
      phone: null,
      website: null,
      hours: null,
      rating: null,
      reviews_count: null,
      image_url: null,
      source: 'nominatim',
    } as Poi;
  });
}
