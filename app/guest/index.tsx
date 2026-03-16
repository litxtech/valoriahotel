import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';
import { useTranslation } from 'react-i18next';

export default function GuestScanScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { setQR, reset } = useGuestFlowStore();
  const { t } = useTranslation();

  useEffect(() => {
    reset();
  }, []);

  const handleBarCodeScanned = async ({ data }: { type: string; data: string }) => {
    if (scanned) return;
    setScanned(true);
    setError(null);
    try {
      const url = data.startsWith('http') ? data : `https://${data}`;
      const u = new URL(url);
      const token = u.searchParams.get('token') ?? u.pathname.split('/').pop();
      if (!token) {
        setError(t('invalidQR'));
        setScanned(false);
        return;
      }
      const { data: qrRow, error: e } = await supabase
        .from('room_qr_codes')
        .select('room_id, rooms(room_number)')
        .eq('token', token)
        .gt('expires_at', new Date().toISOString())
        .single();

      if (e || !qrRow) {
        setError(t('invalidQR'));
        setScanned(false);
        return;
      }

      const roomId = (qrRow as { room_id: string }).room_id;
      const roomNumber = (qrRow as { rooms: { room_number: string } | null })?.rooms?.room_number ?? '';
      setQR(token, roomId, roomNumber);
      router.replace('/guest/language');
    } catch {
      setError(t('invalidQR'));
      setScanned(false);
    }
  };

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>{t('loading')}</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.title}>{t('scanQR')}</Text>
        <Text style={styles.subtitle}>{t('scanQRDesc')}</Text>
        <TouchableOpacity style={styles.button} onPress={requestPermission}>
          <Text style={styles.buttonText}>Kamera İzni Ver</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>QR kodu çerçeve içine getirin</Text>
        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {scanned ? (
          <TouchableOpacity style={styles.retryBtn} onPress={() => setScanned(false)}>
            <Text style={styles.retryBtnText}>Tekrar Dene</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a365d',
    padding: 24,
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 24, textAlign: 'center' },
  message: { color: '#fff' },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  frame: {
    width: 240,
    height: 240,
    borderWidth: 2,
    borderColor: 'rgba(237,137,54,0.9)',
    borderRadius: 16,
    backgroundColor: 'transparent',
  },
  hint: {
    color: '#fff',
    marginTop: 24,
    fontSize: 16,
  },
  errorText: {
    color: '#fc8181',
    marginTop: 12,
    paddingHorizontal: 24,
    textAlign: 'center',
  },
  retryBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 8,
  },
  retryBtnText: { color: '#fff', fontWeight: '600' },
});
