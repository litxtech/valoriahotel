import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert, AppState, ActivityIndicator, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';
import { Camera, CameraView } from 'expo-camera';
import { parseMrzToNormalized } from '@/lib/scanner/mrzParser';
import { apiPost } from '@/lib/kbsApi';

export default function KbsScanScreen() {
  type PermStatus = 'granted' | 'denied' | 'undetermined';
  const [permStatus, setPermStatus] = useState<PermStatus | null>(null);
  const [canAskAgain, setCanAskAgain] = useState(true);
  const [requesting, setRequesting] = useState(false);
  const [serialMode, setSerialMode] = useState(true);

  const cameraRef = useRef<CameraView | null>(null);
  const [cameraMounted, setCameraMounted] = useState(false);
  const [autoScanOn, setAutoScanOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [lastMrz, setLastMrz] = useState<string | null>(null);
  const [lastParsed, setLastParsed] = useState<any>(null);
  const [lastOcrPreview, setLastOcrPreview] = useState<string | null>(null);

  const refreshPermission = useCallback(async () => {
    try {
      const p = await Camera.getCameraPermissionsAsync();
      setPermStatus(p.status as PermStatus);
      setCanAskAgain(p.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
      setCanAskAgain(true);
    }
  }, []);

  useEffect(() => {
    refreshPermission();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refreshPermission();
    });
    return () => sub.remove();
  }, [refreshPermission]);

  useEffect(() => {
    if (permStatus !== 'granted') {
      setCameraMounted(false);
      return;
    }
    const delay = Platform.OS === 'android' ? 680 : 160;
    const t = setTimeout(() => setCameraMounted(true), delay);
    return () => clearTimeout(t);
  }, [permStatus]);

  const handleRequestPermission = useCallback(async () => {
    setRequesting(true);
    try {
      const result = await Camera.requestCameraPermissionsAsync();
      setPermStatus(result.status as PermStatus);
      setCanAskAgain(result.canAskAgain ?? true);
    } catch {
      setPermStatus('undetermined');
    } finally {
      setRequesting(false);
    }
  }, []);

  const extractMrzFromLines = useCallback((lines: string[]): string | null => {
    const cleaned = lines
      .map((l) => String(l || '').trim().toUpperCase().replace(/\s+/g, ''))
      .filter(Boolean);
    const candidates = cleaned.filter((l) => l.includes('<') && l.length >= 25);
    for (let i = 0; i < candidates.length - 1; i++) {
      const a = candidates[i];
      const b = candidates[i + 1];
      if (a.length === 44 && b.length === 44) return `${a}\n${b}`;
    }
    for (let i = 0; i < candidates.length - 2; i++) {
      const a = candidates[i];
      const b = candidates[i + 1];
      const c = candidates[i + 2];
      if (a.length === 30 && b.length === 30 && c.length === 30) return `${a}\n${b}\n${c}`;
    }
    const mrzLike = candidates.sort((x, y) => y.length - x.length).slice(0, 3);
    if (mrzLike.length >= 2 && mrzLike[0].length >= 40) return `${mrzLike[0]}\n${mrzLike[1]}`;
    return null;
  }, []);

  const ocrExtractText = useCallback(async (uri: string): Promise<string[]> => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('expo-text-extractor') as {
      extractTextFromImage: (u: string) => Promise<string[]>;
      isSupported?: boolean;
    };
    if (mod?.isSupported === false) throw new Error('OCR_NOT_SUPPORTED');
    return await mod.extractTextFromImage(uri);
  }, []);

  const runOneAutoScan = useCallback(async () => {
    if (busy) return;
    if (!cameraMounted) return;
    if (!autoScanOn) return;
    setBusy(true);
    try {
      const camAny = cameraRef.current as any;
      if (!camAny?.takePictureAsync) return;
      const photo = await camAny.takePictureAsync({ quality: 0.6, skipProcessing: true });
      const uri = photo?.uri as string | undefined;
      if (!uri) return;

      const lines = await ocrExtractText(uri);
      setLastOcrPreview(lines.slice(0, 8).join(' | ') || null);

      const mrz = extractMrzFromLines(lines);
      if (!mrz) return;
      if (mrz === lastMrz) return;

      setLastMrz(mrz);
      const parsed = parseMrzToNormalized(mrz);
      setLastParsed(parsed);

      // Create draft guest + document in DB via Railway (service-role) to keep RLS strict.
      await apiPost('/documents/upsert', {
        arrivalGroupId: null,
        parsed,
        scanConfidence: parsed.confidence,
        rawMrz: parsed.rawMrz
      });

      // TODO: create guest draft card + upsert document via Railway (/documents/upsert)
      if (!serialMode) setAutoScanOn(false);
    } catch {
      // silent in auto mode
    } finally {
      setBusy(false);
    }
  }, [autoScanOn, busy, cameraMounted, extractMrzFromLines, lastMrz, ocrExtractText, serialMode]);

  useEffect(() => {
    if (!autoScanOn) return;
    if (permStatus !== 'granted') return;
    const t = setInterval(() => {
      runOneAutoScan();
    }, 1200);
    return () => clearInterval(t);
  }, [autoScanOn, permStatus, runOneAutoScan]);

  if (permStatus === null) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.message}>Kamera izni kontrol ediliyor...</Text>
      </View>
    );
  }

  if (permStatus !== 'granted') {
    return (
      <View style={styles.centered}>
        <View style={styles.permCard}>
          <Text style={styles.permTitle}>MRZ Tarama</Text>
          <Text style={styles.permSub}>Pasaport/ID MRZ okumak için kamera izni gerekiyor.</Text>
          <TouchableOpacity
            style={[styles.permBtn, requesting && { opacity: 0.75 }]}
            onPress={canAskAgain ? handleRequestPermission : () => Camera.requestCameraPermissionsAsync()}
            disabled={requesting}
            activeOpacity={0.85}
          >
            {requesting ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.permBtnText}>{canAskAgain ? 'Devam' : 'Ayarları aç'}</Text>}
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <View style={styles.topBar}>
        <Text style={styles.title}>Seri Tarama</Text>
        <View style={styles.topActions}>
          <TouchableOpacity style={styles.toggle} onPress={() => setSerialMode((v) => !v)} activeOpacity={0.85}>
            <Ionicons
              name={serialMode ? 'toggle' : 'toggle-outline'}
              size={28}
              color={serialMode ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text style={styles.toggleLabel}>Seri</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.toggle} onPress={() => setAutoScanOn((v) => !v)} activeOpacity={0.85}>
            <Ionicons
              name={autoScanOn ? 'radio-button-on' : 'radio-button-off'}
              size={22}
              color={autoScanOn ? theme.colors.primary : theme.colors.textMuted}
            />
            <Text style={styles.toggleLabel}>Oto</Text>
          </TouchableOpacity>
        </View>
      </View>

      {!cameraMounted ? (
        <View style={styles.centered}>
          <Text style={styles.message}>Kamera hazırlanıyor...</Text>
        </View>
      ) : (
        <View style={styles.cameraWrap}>
          <CameraView ref={(r) => (cameraRef.current = r)} style={StyleSheet.absoluteFillObject} facing="back" />
          <View style={styles.overlay}>
            <View style={styles.frame} />
            <Text style={styles.hint}>MRZ’yi çerçeveye getirin. Sistem otomatik okuyacaktır.</Text>
            <View style={styles.controls}>
              <TouchableOpacity
                style={[styles.btnPrimary, busy && { opacity: 0.75 }]}
                onPress={() => runOneAutoScan().catch(() => Alert.alert('Tarama hatası', 'Tekrar deneyin.'))}
                activeOpacity={0.9}
                disabled={busy}
              >
                <Ionicons name="scan-outline" size={18} color="#fff" />
                <Text style={styles.btnPrimaryText}>{busy ? 'Okunuyor…' : 'Şimdi Oku'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      <View style={styles.resultPanel}>
        <Text style={styles.cardTitle}>Son okuma</Text>
        <Text style={styles.mono}>{lastParsed?.fullName ?? '-'}</Text>
        <Text style={styles.mono}>DocNo: {lastParsed?.documentNumber ?? '-'}</Text>
        <Text style={styles.mono}>Nation: {lastParsed?.nationalityCode ?? '-'}</Text>
        {lastMrz ? (
          <>
            <Text style={styles.mono}>Raw MRZ:</Text>
            <Text style={styles.monoSmall}>{String(lastMrz)}</Text>
          </>
        ) : (
          <Text style={styles.monoSmall}>{lastOcrPreview ? `OCR: ${lastOcrPreview}` : 'Henüz MRZ yakalanmadı.'}</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  topBar: { padding: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  topActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '800', color: theme.colors.text },
  toggle: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 8 },
  toggleLabel: { color: theme.colors.textSecondary, fontWeight: '700' },
  cameraWrap: { height: 360, marginHorizontal: 16, borderRadius: 16, overflow: 'hidden', backgroundColor: '#000' },
  overlay: { ...StyleSheet.absoluteFillObject, padding: 14, justifyContent: 'flex-end' },
  frame: { alignSelf: 'center', width: '92%', height: 140, borderWidth: 2, borderColor: 'rgba(255,255,255,0.75)', borderRadius: 14 },
  hint: { marginTop: 10, color: '#fff', textAlign: 'center', fontWeight: '800' },
  controls: { alignItems: 'center', marginTop: 12 },
  btnPrimary: {
    backgroundColor: theme.colors.primary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  btnPrimaryText: { color: '#fff', fontWeight: '800', fontSize: 16 },
  resultPanel: { margin: 16, marginTop: 12, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 14, gap: 6 },
  cardTitle: { fontWeight: '800', color: theme.colors.text, marginBottom: 4 },
  mono: { fontFamily: 'monospace', color: theme.colors.text },
  monoSmall: { fontFamily: 'monospace', color: theme.colors.textSecondary, fontSize: 12 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: theme.colors.backgroundSecondary },
  message: { color: theme.colors.textSecondary, marginTop: 12 },
  permCard: { backgroundColor: theme.colors.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: theme.colors.borderLight, width: '100%', maxWidth: 360 },
  permTitle: { fontSize: 18, fontWeight: '900', color: theme.colors.text, marginBottom: 6 },
  permSub: { color: theme.colors.textSecondary, lineHeight: 20, marginBottom: 12 },
  permBtn: { backgroundColor: theme.colors.primary, borderRadius: 14, paddingVertical: 12, alignItems: 'center' },
  permBtnText: { color: '#fff', fontWeight: '900' },
});

