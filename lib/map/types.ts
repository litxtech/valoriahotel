/**
 * Harita bileşenleri için ortak tipler.
 */

export type MapUserMarker = {
  id: string;
  lat: number;
  lng: number;
  displayName?: string | null;
  avatarUrl?: string | null;
  isMe?: boolean;
};

export type MapPostMarker = {
  id: string;
  lat: number;
  lng: number;
  displayName?: string | null;
  avatarUrl?: string | null;
};
