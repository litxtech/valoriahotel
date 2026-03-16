import { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';

const DEFAULT_LAT = 40.6144;
const DEFAULT_LON = 40.31188;

type HotelMapProps = {
  latitude?: number;
  longitude?: number;
  title?: string;
  style?: object;
};

export default function HotelMap({
  latitude = DEFAULT_LAT,
  longitude = DEFAULT_LON,
  title = 'Valoria Hotel',
  style,
}: HotelMapProps) {
  const mapboxToken =
    typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
      ? process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN
      : '';

  const mapboxHtml = useMemo(() => {
    const token = (mapboxToken || '').replace(/"/g, '');
    if (!token) {
      return `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;background:#e5e7eb;color:#666;">Harita yüklenemedi</div>`;
    }
    const safeTitle = (title || 'Valoria Hotel').replace(/'/g, "\\'");
    return `<!DOCTYPE html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <script src="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.js"></script>
  <link href="https://api.mapbox.com/mapbox-gl-js/v3.0.1/mapbox-gl.css" rel="stylesheet"/>
  <style>body{margin:0;} #map{width:100%;height:100%;}</style>
</head>
<body>
  <div id="map"></div>
  <script>
    mapboxgl.accessToken = '${token}';
    var map = new mapboxgl.Map({ container: 'map', style: 'mapbox://styles/mapbox/streets-v12', center: [${longitude}, ${latitude}], zoom: 15 });
    new mapboxgl.Marker().setLngLat([${longitude}, ${latitude}]).setPopup(new mapboxgl.Popup().setHTML('<b>${safeTitle}</b>')).addTo(map);
  </script>
</body>
</html>`;
  }, [latitude, longitude, title, mapboxToken]);

  return (
    <View style={[styles.wrap, style]}>
      <iframe
        srcDoc={mapboxHtml}
        title={title || 'Harita'}
        style={{ width: '100%', height: '100%', border: 0, borderRadius: 12 }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: '100%', height: 220, borderRadius: 12, overflow: 'hidden' },
});
