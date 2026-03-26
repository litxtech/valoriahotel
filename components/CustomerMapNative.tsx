/**
 * iOS için native MapKit (react-native-maps).
 * Zoom/pan state'i native tarafta kalır, geri dönmez.
 */

import { useRef, useCallback } from 'react';
import { View, StyleSheet, Platform, Image, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import type { Poi } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker } from '@/lib/map/types';

const DEFAULT_LAT = 40.6144;
const DEFAULT_LON = 40.31188;

const USER_AVATAR_SIZE = 40;

export type CustomerMapNativeProps = {
  initialLat?: number;
  initialLng?: number;
  initialZoom?: number;
  pois?: Poi[];
  routeCoordinates?: { lat: number; lng: number }[];
  hotelMarker?: { lat: number; lng: number; title: string };
  userMarkers?: MapUserMarker[];
  postMarkers?: MapPostMarker[];
  onPoiPress?: (poi: Poi) => void;
  onHotelPress?: () => void;
  onPostPress?: (postId: string) => void;
  onRegionChangeComplete?: (center: { lat: number; lng: number }) => void;
  style?: object;
};

const latLngToDelta = (zoom: number) => {
  const d = 360 / Math.pow(2, zoom);
  return { latitudeDelta: d / 2, longitudeDelta: d };
};

const POST_AVATAR_SIZE = 36;

export default function CustomerMapNative({
  initialLat = DEFAULT_LAT,
  initialLng = DEFAULT_LON,
  initialZoom = 15,
  pois = [],
  routeCoordinates = [],
  hotelMarker,
  userMarkers = [],
  postMarkers = [],
  onPoiPress,
  onHotelPress,
  onPostPress,
  onRegionChangeComplete,
  style,
}: CustomerMapNativeProps) {
  const mapRef = useRef<MapView>(null);
  const { latitudeDelta, longitudeDelta } = latLngToDelta(initialZoom);
  const hasMeMarker = userMarkers.some((m) => m.isMe);

  const initialRegion = {
    latitude: initialLat,
    longitude: initialLng,
    latitudeDelta,
    longitudeDelta,
  };

  const onRegionChangeCompleteHandler = useCallback(
    (e: { latitude: number; longitude: number }) => {
      onRegionChangeComplete?.({ lat: e.latitude, lng: e.longitude });
    },
    [onRegionChangeComplete]
  );

  if (Platform.OS !== 'ios') {
    return null;
  }

  return (
    <View style={[styles.wrap, style]}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        mapType="standard"
        showsUserLocation={!hasMeMarker}
        showsCompass
        onRegionChangeComplete={onRegionChangeCompleteHandler}
        provider={PROVIDER_DEFAULT}
      >
        {hotelMarker && (
          <Marker
            coordinate={{ latitude: hotelMarker.lat, longitude: hotelMarker.lng }}
            title={hotelMarker.title}
            identifier="hotel"
            onPress={() => onHotelPress?.()}
          />
        )}
        {pois.map((poi) => (
          <Marker
            key={poi.id}
            coordinate={{ latitude: poi.lat, longitude: poi.lng }}
            title={poi.name}
            identifier={poi.id}
            onPress={() => onPoiPress?.(poi)}
          />
        ))}
        {userMarkers.map((u) => (
          <Marker
            key={u.id}
            coordinate={{ latitude: u.lat, longitude: u.lng }}
            title={u.displayName ?? undefined}
            identifier={`user-${u.id}`}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
          >
            {u.avatarUrl ? (
              <View style={[styles.userAvatarWrap, u.isMe && styles.userAvatarMe]}>
                <Image source={{ uri: u.avatarUrl }} style={styles.userAvatar} />
              </View>
            ) : (
              <View style={[styles.userAvatarWrap, styles.userAvatarPlaceholder, u.isMe && styles.userAvatarMe]}>
                <Ionicons name="person" size={20} color="#666" />
              </View>
            )}
          </Marker>
        ))}
        {postMarkers.map((p) => (
          <Marker
            key={`post-${p.id}`}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.displayName ?? undefined}
            identifier={`post-${p.id}`}
            tracksViewChanges={false}
            anchor={{ x: 0.5, y: 0.5 }}
            onPress={() => onPostPress?.(p.id)}
          >
            {p.avatarUrl ? (
              <View style={styles.postAvatarWrap}>
                <Image source={{ uri: p.avatarUrl }} style={styles.postAvatar} />
              </View>
            ) : (
              <View style={[styles.postAvatarWrap, styles.postAvatarPlaceholder]}>
                <Ionicons name="image-outline" size={18} color="#666" />
              </View>
            )}
          </Marker>
        ))}
        {routeCoordinates.length >= 2 && (
          <Polyline
            coordinates={routeCoordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
            strokeColor="#b8860b"
            strokeWidth={4}
          />
        )}
      </MapView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: 'hidden' },
  map: { width: '100%', height: '100%' },
  userAvatarWrap: {
    width: USER_AVATAR_SIZE,
    height: USER_AVATAR_SIZE,
    borderRadius: USER_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#e0e0e0',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  userAvatarMe: {
    borderColor: '#b8860b',
    borderWidth: 4,
  },
  userAvatar: {
    width: '100%',
    height: '100%',
  },
  userAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  postAvatarWrap: {
    width: POST_AVATAR_SIZE,
    height: POST_AVATAR_SIZE,
    borderRadius: POST_AVATAR_SIZE / 2,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: '#0d9488',
    backgroundColor: '#e0e0e0',
    ...Platform.select({ ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowRadius: 4, shadowOpacity: 0.3 } }),
  },
  postAvatar: {
    width: '100%',
    height: '100%',
  },
  postAvatarPlaceholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
