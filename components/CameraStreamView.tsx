/**
 * Tapo kamera RTSP akışı - VLC (react-native-vlc-media-player) veya fallback
 * RTSP için VLC kullanılır; yoksa placeholder.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Video, ResizeMode, AVPlaybackStatus } from 'expo-av';
import { CameraStreamVlc } from './CameraStreamVlc';
import { buildRtspUrl, buildRtspInitOptions } from '@/lib/cameras';
import type { Camera } from '@/lib/cameras';

type CameraStreamViewProps = {
  /** Kamera nesnesi - URL encodeURIComponent ile oluşturulur (e-posta @ -> %40) */
  camera?: Pick<Camera, 'ip_address' | 'username' | 'password'>;
  /** URL string. camera verilirse kullanılmaz. */
  rtspUrl?: string;
  style?: object;
  useSubstream?: boolean;
  onLoad?: () => void;
  onError?: (err: string) => void;
};

export function CameraStreamView({ camera, rtspUrl, style, useSubstream, onLoad, onError }: CameraStreamViewProps) {
  // URL'de kimlik (encodeURIComponent ile) - VLC'nin en güvenilir yöntemi
  const effectiveUrl = camera
    ? buildRtspUrl(camera, useSubstream)
    : (rtspUrl ?? '');
  const initOptions = camera ? buildRtspInitOptions() : undefined;
  const videoRef = useRef<Video>(null);
  const [status, setStatus] = useState<'loading' | 'playing' | 'error'>('loading');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const isRtsp = effectiveUrl?.startsWith('rtsp://');

  useEffect(() => {
    if (!effectiveUrl) {
      setStatus('error');
      setErrorMsg('Akış URL\'si yok');
      onError?.('Akış URL\'si yok');
      return;
    }

    if (isRtsp) {
      // RTSP: CameraStreamVlc kullan (VLC varsa oynatır, yoksa kendi placeholder'ını gösterir)
      return;
    }

    setStatus('loading');
  }, [effectiveUrl, isRtsp, onError]);

  const onPlaybackStatusUpdate = useCallback(
    (playbackStatus: AVPlaybackStatus) => {
      if (!playbackStatus.isLoaded) return;
      if (playbackStatus.error) {
        setStatus('error');
        const err = (playbackStatus as { error?: unknown }).error;
        const msg =
          typeof err === 'string' ? err : err != null && typeof err === 'object' && 'message' in err ? String((err as { message?: unknown }).message) : 'Yükleme hatası';
        setErrorMsg(msg);
        onError?.(msg);
      } else if (playbackStatus.isPlaying) {
        setStatus('playing');
        onLoad?.();
      }
    },
    [onLoad, onError]
  );

  // RTSP: VLC - kimlik bilgisi initOptions + LoginDialog fallback
  if (isRtsp) {
    return (
      <CameraStreamVlc
        rtspUrl={effectiveUrl}
        initOptions={initOptions}
        style={style}
      />
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Video
        ref={videoRef}
        source={{ uri: effectiveUrl }}
        style={StyleSheet.absoluteFill}
        useNativeControls={false}
        resizeMode={ResizeMode.CONTAIN}
        isLooping
        shouldPlay
        onPlaybackStatusUpdate={onPlaybackStatusUpdate}
      />
      {status === 'loading' && (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      )}
      {status === 'error' && (
        <View style={styles.overlay}>
          <Ionicons name="alert-circle-outline" size={40} color="#fff" />
          <Text style={styles.errorText}>{errorMsg ?? 'Akış yüklenemedi'}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0a0a',
    overflow: 'hidden',
    minHeight: 120,
  },
  placeholder: {
    flex: 1,
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  placeholderTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: 'rgba(255,255,255,0.9)',
    marginTop: 12,
  },
  placeholderSub: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  placeholderHint: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.4)',
    marginTop: 12,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 14,
  },
  errorText: {
    color: '#fff',
    marginTop: 8,
    fontSize: 12,
    textAlign: 'center',
    paddingHorizontal: 16,
  },
});
