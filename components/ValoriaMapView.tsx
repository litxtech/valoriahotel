/**
 * Valoria harita - Uygulama içi, Google Maps'e yönlendirme yok.
 * Mapbox token varsa Mapbox GL JS, yoksa Leaflet + OSM tile.
 * POI marker'ları, rota çizgisi, otel konumu.
 */

import { useMemo, useRef, useCallback } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { WebView } from 'react-native-webview';
import type { Poi } from '@/lib/map/pois';
import { getPoiIcon } from '@/lib/map/pois';
import type { MapUserMarker, MapPostMarker } from '@/lib/map/types';

const DEFAULT_LAT = 40.6144;
const DEFAULT_LON = 40.31188;

export type ValoriaMapViewProps = {
  latitude?: number;
  longitude?: number;
  zoom?: number;
  pois?: Poi[];
  routeCoordinates?: { lat: number; lng: number }[];
  hotelMarker?: { lat: number; lng: number; title: string };
  userMarkers?: MapUserMarker[];
  postMarkers?: MapPostMarker[];
  onPoiPress?: (poi: Poi) => void;
  onHotelPress?: () => void;
  onPostPress?: (postId: string) => void;
  onRegionChange?: (center: { lat: number; lng: number }) => void;
  style?: object;
};

const mapboxToken =
  typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
    ? String(process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN).replace(/"/g, '')
    : '';

function buildMapboxHtml(props: ValoriaMapViewProps): string {
  const lat = props.latitude ?? DEFAULT_LAT;
  const lon = props.longitude ?? DEFAULT_LON;
  const zoom = props.zoom ?? 15;
  const pois = props.pois ?? [];
  const routeCoords = props.routeCoordinates ?? [];
  const hotel = props.hotelMarker;
  const userMarkers = props.userMarkers ?? [];
  const postMarkers = props.postMarkers ?? [];

  const usersJson = JSON.stringify(
    userMarkers.map((u) => ({
      id: u.id,
      lat: u.lat,
      lng: u.lng,
      displayName: u.displayName ?? null,
      avatarUrl: u.avatarUrl ?? null,
      isMe: !!u.isMe,
    }))
  );

  const poisJson = JSON.stringify(
    pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      icon: getPoiIcon(p.type),
      rating: p.rating,
    }))
  );
  const postsJson = JSON.stringify(
    postMarkers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
    }))
  );
  const routeJson = JSON.stringify(routeCoords.map((c) => [c.lng, c.lat]));
  const hotelJson = hotel ? JSON.stringify([hotel.lng, hotel.lat, hotel.title]) : 'null';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet"/>
  <style>
    html,body{margin:0;padding:0;width:100%;height:100%;background:#e8eaed;}
    #map{width:100%;height:100%;min-height:200px;}
    .mapboxgl-marker.poi { cursor: pointer; }
    .mapboxgl-popup-content { padding: 8px 12px; font-size: 13px; min-width: 120px; }
  </style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = '${mapboxToken}';
    var center = [${lon}, ${lat}];
    var zoomLevel = ${zoom};
    var map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: center, zoom: zoomLevel });
    var markers = [];
    var routeCoords = ${routeJson};
    var hotel = ${hotelJson};

    map.on('load', function() {
      // Hotel marker
      if (hotel) {
        var el = document.createElement('div');
        el.className = 'hotel-marker';
        el.innerHTML = '🏨';
        el.style.fontSize = '24px';
        el.style.cursor = 'pointer';
        new mapboxgl.Marker(el).setLngLat([hotel[0], hotel[1]]).setPopup(new mapboxgl.Popup().setHTML('<b>' + hotel[2] + '</b>')).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hotel' }));
        });
      }
      // POI markers
      var pois = ${poisJson};
      pois.forEach(function(p) {
        var el = document.createElement('div');
        el.className = 'poi';
        el.innerHTML = p.icon;
        el.style.fontSize = '22px';
        el.style.cursor = 'pointer';
        var m = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'poi', poi: p }));
        });
        markers.push(m);
      });
      // User avatar markers
      var users = ${usersJson};
      users.forEach(function(u) {
        var el = document.createElement('div');
        el.style.width = '40px';
        el.style.height = '40px';
        el.style.borderRadius = '20px';
        el.style.overflow = 'hidden';
        el.style.border = u.isMe ? '4px solid #b8860b' : '3px solid rgba(255,255,255,0.9)';
        el.style.backgroundColor = '#e0e0e0';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        if (u.avatarUrl) {
          var img = document.createElement('img');
          img.src = u.avatarUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          el.appendChild(img);
        } else {
          el.innerHTML = '<span style="font-size:20px;color:#666;line-height:40px;text-align:center">👤</span>';
        }
        var m = new mapboxgl.Marker(el).setLngLat([u.lng, u.lat]).setPopup(u.displayName ? new mapboxgl.Popup().setHTML('<b>' + (u.displayName || '').replace(/</g, '&lt;') + '</b>') : null).addTo(map);
        markers.push(m);
      });
      // Post markers (avatar style)
      var posts = ${postsJson};
      posts.forEach(function(p) {
        var el = document.createElement('div');
        el.style.width = '36px';
        el.style.height = '36px';
        el.style.borderRadius = '18px';
        el.style.overflow = 'hidden';
        el.style.border = '3px solid #0d9488';
        el.style.backgroundColor = '#e0e0e0';
        el.style.boxShadow = '0 2px 4px rgba(0,0,0,0.3)';
        el.style.cursor = 'pointer';
        if (p.avatarUrl) {
          var img = document.createElement('img');
          img.src = p.avatarUrl;
          img.style.width = '100%';
          img.style.height = '100%';
          img.style.objectFit = 'cover';
          el.appendChild(img);
        } else {
          el.innerHTML = '<span style="font-size:16px;color:#666;line-height:36px;text-align:center;display:block">📷</span>';
        }
        var m = new mapboxgl.Marker(el).setLngLat([p.lng, p.lat]).setPopup(p.displayName ? new mapboxgl.Popup().setHTML('<b>' + (p.displayName || '').replace(/</g, '&lt;') + '</b>') : null).addTo(map);
        el.addEventListener('click', function() {
          if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'post', postId: p.id }));
        });
        markers.push(m);
      });
      // Route line
      if (routeCoords.length >= 2) {
        map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: routeCoords } } });
        map.addLayer({ id: 'route', type: 'line', source: 'route', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#b8860b', 'line-width': 4 } });
      }
      // Notify initial load
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
    });

    map.on('moveend', function() {
      var c = map.getCenter();
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng }));
    });
  </script>
</body>
</html>`;
}

function buildOsmLeafletHtml(props: ValoriaMapViewProps): string {
  const lat = props.latitude ?? DEFAULT_LAT;
  const lon = props.longitude ?? DEFAULT_LON;
  const zoom = props.zoom ?? 15;
  const pois = props.pois ?? [];
  const routeCoords = props.routeCoordinates ?? [];
  const hotel = props.hotelMarker;
  const userMarkers = props.userMarkers ?? [];
  const postMarkers = props.postMarkers ?? [];

  const usersJson = JSON.stringify(
    userMarkers.map((u) => ({
      id: u.id,
      lat: u.lat,
      lng: u.lng,
      displayName: u.displayName ?? null,
      avatarUrl: u.avatarUrl ?? null,
      isMe: !!u.isMe,
    }))
  );

  const poisJson = JSON.stringify(
    pois.map((p) => ({
      id: p.id,
      name: p.name,
      type: p.type,
      lat: p.lat,
      lng: p.lng,
      icon: getPoiIcon(p.type),
    }))
  );
  const postsJson = JSON.stringify(
    postMarkers.map((p) => ({
      id: p.id,
      lat: p.lat,
      lng: p.lng,
      displayName: p.displayName ?? null,
      avatarUrl: p.avatarUrl ?? null,
    }))
  );
  const routeJson = JSON.stringify(routeCoords.map((c) => [c.lat, c.lng]));
  const hotelJson = hotel ? JSON.stringify({ lat: hotel.lat, lng: hotel.lng, title: hotel.title }) : 'null';

  return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no"/>
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"/>
  <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
  <style>html,body{margin:0;padding:0;width:100%;height:100%;}#map{width:100%;height:100%;min-height:200px;}.leaflet-div-icon.user-avatar-marker{background:none;border:none;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    var map = L.map('map').setView([${lat}, ${lon}], ${zoom});
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OSM' }).addTo(map);
    var pois = ${poisJson};
    var route = ${routeJson};
    var hotel = ${hotelJson};
    if (hotel) {
      var h = L.marker([hotel.lat, hotel.lng]).addTo(map).bindPopup(hotel.title);
      h.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'hotel' }));
      });
    }
    pois.forEach(function(p) {
      var m = L.marker([p.lat, p.lng]).addTo(map).bindPopup(p.name);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'poi', poi: p }));
      });
    });
    var users = ${usersJson};
    users.forEach(function(u) {
      var html = u.avatarUrl ? '<img src="' + u.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:20px;color:#666;line-height:40px;text-align:center;display:block">👤</span>';
      var icon = L.divIcon({
        className: 'user-avatar-marker',
        html: '<div style="width:40px;height:40px;border-radius:20px;overflow:hidden;border:' + (u.isMe ? '4px solid #b8860b' : '3px solid rgba(255,255,255,0.9)') + ';background:#e0e0e0;box-shadow:0 2px 4px rgba(0,0,0,0.3)">' + html + '</div>',
        iconSize: [40, 40],
        iconAnchor: [20, 20]
      });
      var m = L.marker([u.lat, u.lng], { icon: icon }).addTo(map);
      if (u.displayName) m.bindPopup(u.displayName);
    });
    var posts = ${postsJson};
    posts.forEach(function(p) {
      var html = p.avatarUrl ? '<img src="' + p.avatarUrl.replace(/"/g, '&quot;') + '" style="width:100%;height:100%;object-fit:cover" />' : '<span style="font-size:16px;color:#666;line-height:36px;text-align:center;display:block">📷</span>';
      var icon = L.divIcon({
        className: 'user-avatar-marker',
        html: '<div style="width:36px;height:36px;border-radius:18px;overflow:hidden;border:3px solid #0d9488;background:#e0e0e0;box-shadow:0 2px 4px rgba(0,0,0,0.3);cursor:pointer">' + html + '</div>',
        iconSize: [36, 36],
        iconAnchor: [18, 18]
      });
      var m = L.marker([p.lat, p.lng], { icon: icon }).addTo(map);
      if (p.displayName) m.bindPopup(p.displayName);
      m.on('click', function() {
        if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'post', postId: p.id }));
      });
    });
    if (route.length >= 2) {
      L.polyline(route, { color: '#b8860b', weight: 4 }).addTo(map);
    }
    map.on('moveend', function() {
      var c = map.getCenter();
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'region', lat: c.lat, lng: c.lng }));
    });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'ready' }));
  </script>
</body>
</html>`;
}

export default function ValoriaMapView({
  latitude = DEFAULT_LAT,
  longitude = DEFAULT_LON,
  zoom = 15,
  pois = [],
  routeCoordinates = [],
  hotelMarker,
  userMarkers = [],
  postMarkers = [],
  onPoiPress,
  onHotelPress,
  onPostPress,
  onRegionChange,
  style,
}: ValoriaMapViewProps) {
  const webRef = useRef<WebView>(null);

  const html = useMemo(() => {
    const props: ValoriaMapViewProps = {
      latitude,
      longitude,
      zoom,
      pois,
      routeCoordinates,
      hotelMarker,
      userMarkers,
      postMarkers,
    };
    return mapboxToken ? buildMapboxHtml(props) : buildOsmLeafletHtml(props);
  }, [latitude, longitude, zoom, pois, routeCoordinates, hotelMarker, userMarkers, postMarkers]);

  const onMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (data.type === 'poi' && data.poi && onPoiPress) {
          const p = pois.find((x) => x.id === data.poi.id);
          if (p) onPoiPress(p);
        } else if (data.type === 'hotel' && onHotelPress) {
          onHotelPress();
        } else if (data.type === 'post' && data.postId && onPostPress) {
          onPostPress(data.postId);
        } else if (data.type === 'region' && onRegionChange) {
          onRegionChange({ lat: data.lat, lng: data.lng });
        }
      } catch (_) {}
    },
    [onPoiPress, onHotelPress, onPostPress, onRegionChange, pois]
  );

  const flatStyle = StyleSheet.flatten(style ?? {}) as Record<string, unknown>;
  const width = typeof flatStyle?.width === 'number' ? flatStyle.width : undefined;
  const height = typeof flatStyle?.height === 'number' ? flatStyle.height : undefined;
  const webViewStyle = width != null && height != null
    ? { width, height }
    : styles.map;

  return (
    <View style={[styles.wrap, style]}>
      <WebView
        ref={webRef}
        source={{ html }}
        style={webViewStyle}
        scrollEnabled={false}
        bounces={false}
        nestedScrollEnabled={true}
        onMessage={onMessage}
        javaScriptEnabled={true}
        originWhitelist={['*']}
        mixedContentMode="compatibility"
        androidLayerType="hardware"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 0, overflow: 'hidden' },
  map: { flex: 1, width: '100%', height: '100%' },
});
