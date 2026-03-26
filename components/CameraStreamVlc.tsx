/**
 * RTSP akışı için VLC tabanlı oynatıcı.
 * react-native-vlc-media-player veya @baronha/react-native-vlc-media-player kuruluysa kullanır.
 *
 * Kurulum:
 *   npm install react-native-vlc-media-player
 *   npx expo prebuild --clean (veya eas build)
 *
 * iOS: Info.plist'e NSLocalNetworkUsageDescription ekleyin (yerel ağ kameraları için)
 */
import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

type CameraStreamVlcProps = {
  rtspUrl: string;
  style?: object;
  initOptions?: string[];
};

let VlcPlayer: React.ComponentType<{
  source: {
    uri: string;
    initType?: number;
    initOptions?: string[];
    isNetwork?: boolean;
  };
  style?: object;
  autoplay?: boolean;
  initOptions?: string[];
  onError?: (e: unknown) => void;
  onLoad?: () => void;
  onPlaying?: () => void;
  onOpen?: () => void;
}> | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const vlc = require('react-native-vlc-media-player');
  VlcPlayer = vlc.VLCPlayer ?? vlc.default?.VLCPlayer ?? vlc.default;
} catch {
  // Paket yüklü değil
}

const BASE_INIT_OPTIONS = ['--rtsp-tcp', '--no-audio', '--network-caching=100'];

export function CameraStreamVlc({ rtspUrl, style, initOptions }: CameraStreamVlcProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const hideLoading = () => setLoading(false);

  useEffect(() => {
    setError(null);
    setLoading(true);
    if (!rtspUrl) {
      setError('URL yok');
      setLoading(false);
      return;
    }
    const t = setTimeout(hideLoading, 12000);
    return () => clearTimeout(t);
  }, [rtspUrl]);

  if (!VlcPlayer) {
    return (
      <View style={[styles.container, style]}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>VLC oynatıcı paketi yüklü değil</Text>
          <Text style={styles.placeholderHint}>
            RTSP için: npm install react-native-vlc-media-player
          </Text>
        </View>
      </View>
    );
  }

  if (error) {
    const isAuthError = /login|password|şifre|kimlik|unauthorized|401|geçersiz/i.test(error);
    return (
      <View style={[styles.container, style]}>
        <View style={styles.placeholder}>
          <Text style={styles.placeholderText}>
            {isAuthError ? 'Kimlik doğrulama hatası' : 'Akış açılamadı'}
          </Text>
          <Text style={styles.errorText} numberOfLines={4}>{error}</Text>
          {isAuthError && (
            <Text style={styles.errorHint}>
              Admin panelden kamera kullanıcı adı ve şifresini kontrol edin.{'\n'}
              Tapo: Ayarlar → Kamera Hesabı
            </Text>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <VlcPlayer
        source={{
          uri: rtspUrl,
          initType: (initOptions?.length ?? 0) > 0 ? 2 : 1,
          initOptions: initOptions ?? BASE_INIT_OPTIONS,
          isNetwork: rtspUrl.startsWith('rtsp://'),
        }}
        style={StyleSheet.absoluteFill}
        autoplay
        onLoad={hideLoading}
        onPlaying={hideLoading}
        onOpen={hideLoading}
        onError={(e: unknown) => {
          let msg = 'Akış yüklenemedi';
          if (typeof e === 'string' && e) msg = e;
          else if (e instanceof Error && e.message) msg = e.message;
          else if (e != null && typeof e === 'object') {
            const o = e as Record<string, unknown>;
            msg =
              (typeof o.errorString === 'string' ? o.errorString : null) ??
              (o.error != null && typeof o.error === 'object' && typeof (o.error as Record<string, unknown>).errorString === 'string'
                ? (o.error as Record<string, unknown>).errorString as string
                : null) ??
              (typeof o.message === 'string' ? o.message : null) ??
              msg;
          }
          if (__DEV__) console.warn('[CameraStreamVlc]', msg);
          setError(msg);
          setLoading(false);
        }}
      />
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#fff" />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000',
    overflow: 'hidden',
    minHeight: 120,
  },
  placeholder: {
    flex: 1,
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
  },
  placeholderHint: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 11,
    marginTop: 8,
  },
  errorText: {
    color: 'rgba(255,150,150,0.95)',
    fontSize: 12,
    marginTop: 8,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
  errorHint: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 11,
    marginTop: 12,
    textAlign: 'center',
    paddingHorizontal: 20,
    lineHeight: 16,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
