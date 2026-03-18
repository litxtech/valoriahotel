import { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Share,
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { supabase, supabaseUrl } from '@/lib/supabase';
import { FIXED_CONTRACT_QR_URL } from '@/constants/contractQr';

const KEYS = {
  contract_qr_base_url: 'Sözleşme onay sayfası base URL (tek ayar – tüm QR\'lar buraya gider)',
  google_play_url: 'Google Play (Android) uygulama URL',
  app_store_url: 'App Store (iOS) uygulama URL',
  checkin_qr_base_url: 'Check-in QR base URL (boş = varsayılan)',
} as const;

const SUPABASE_CONTRACT_PATH = '/functions/v1/public-contract';
const defaultContractBase = supabaseUrl ? `${supabaseUrl.replace(/\/$/, '')}${SUPABASE_CONTRACT_PATH}` : '';

/** Tek tip QR sözleşme URL'si – Vercel/custom domain. valoria.app satılık olduğu için varsayılan hep Vercel. */
const CONTRACT_SIGN_ONE_PATH = '/guest/sign-one';
const VERCEL_CONTRACT_BASE = 'https://valoriahotel-el4r.vercel.app/guest/sign-one';
const recommendedContractBase = (() => {
  const fromContract = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_PUBLIC_CONTRACT_URL
    ? String(process.env.EXPO_PUBLIC_PUBLIC_CONTRACT_URL).replace(/\/$/, '').replace(/\?.*$/, '')
    : '';
  if (fromContract && !fromContract.includes('valoria.app')) return fromContract;
  const fromApp = typeof process !== 'undefined' && process.env?.EXPO_PUBLIC_APP_URL
    ? String(process.env.EXPO_PUBLIC_APP_URL).replace(/\/$/, '')
    : '';
  if (fromApp && !fromApp.includes('valoria.app')) return `${fromApp}${CONTRACT_SIGN_ONE_PATH}`;
  return VERCEL_CONTRACT_BASE;
})();

export default function ContractAppSettings() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);
  const [values, setValues] = useState<Record<string, string>>({
    google_play_url: '',
    app_store_url: '',
    contract_qr_base_url: '',
    checkin_qr_base_url: '',
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [singleQrUrl, setSingleQrUrl] = useState<string>('');
  const [generatingToken, setGeneratingToken] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('app_settings').select('key, value').in('key', Object.keys(KEYS));
      const map: Record<string, string> = {};
      (data ?? []).forEach((r: { key: string; value: unknown }) => {
        const v = r.value;
        map[r.key] = v != null && v !== '' ? String(v) : '';
      });
      setValues((prev) => ({ ...prev, ...map }));

      const { data: lobbyRow } = await supabase
        .from('contract_lobby_tokens')
        .select('token')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      setSingleQrUrl(FIXED_CONTRACT_QR_URL);
      setLoading(false);
    })();
  }, []);

  const setOne = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  let contractBase = (values.contract_qr_base_url || defaultContractBase).replace(/\/$/, '').replace(/\?.*$/, '');
  if (contractBase.includes('valoria.app')) contractBase = VERCEL_CONTRACT_BASE;

  const copyOrShare = async (text: string, label: string) => {
    Keyboard.dismiss();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    try {
      await Share.share({ message: text, title: label });
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Paylaşım açılamadı.');
    }
  };

  const generateLobbyToken = async () => {
    Keyboard.dismiss();
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    setGeneratingToken(true);
    try {
      setSingleQrUrl(FIXED_CONTRACT_QR_URL);
      try {
        await Share.share({ message: FIXED_CONTRACT_QR_URL, title: 'Sözleşme onay sayfası (tek QR)' });
      } catch {
        // paylaşım iptal veya destek yok
      }
      Alert.alert('Hazır', 'Tüm sözleşme QR\'ları bu tek URL\'ye gider. Link kopyalandı / paylaşıldı.');
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Paylaşılamadı');
    }
    setGeneratingToken(false);
  };

  const save = async () => {
    setSaving(true);
    try {
      for (const key of Object.keys(KEYS)) {
        const val = (values[key] ?? '').trim() || null;
        await supabase.from('app_settings').upsert({ key, value: val as string | null, updated_at: new Date().toISOString() }, { onConflict: 'key' });
      }
      Alert.alert('Kaydedildi', 'Ayarlar güncellendi.');
    } catch (e) {
      Alert.alert('Hata', e instanceof Error ? e.message : 'Kaydedilemedi');
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#1a365d" />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={insets.top + 56}>
      <ScrollView ref={scrollRef} style={styles.scroll} contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <Text style={styles.sectionTitle}>Tek tip QR → Sözleşme onayı (tek ayar)</Text>
        <View style={styles.recommendedBox}>
          <Text style={styles.recommendedLabel}>Aşağıdaki ilk alana yapıştırın (Vercel/custom domain siteniz):</Text>
          <View style={styles.copyRow}>
            <TextInput
              style={[styles.recommendedInput, styles.copyInput]}
              value={recommendedContractBase}
              editable={false}
              selectable
            />
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => copyOrShare(recommendedContractBase, 'Sözleşme URL')}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={22} color="#fff" />
              <Text style={styles.copyBtnText}>Paylaş / Kopyala</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={[styles.sectionTitle, { marginTop: 16 }]}>Sözleşme onay sayfası base URL</Text>
        {(Object.keys(KEYS) as (keyof typeof KEYS)[]).map((key) => (
          <View key={key} style={styles.field}>
            <Text style={styles.label}>{KEYS[key]}</Text>
            <TextInput
              style={styles.input}
              value={values[key] ?? ''}
              onChangeText={(t) => setOne(key, t)}
              placeholder={key === 'contract_qr_base_url' ? recommendedContractBase : key.includes('url') ? 'https://...' : ''}
              placeholderTextColor="#94a3b8"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        ))}
        <Text style={styles.hint}>
          Google Play ve App Store URL'lerini girin. Sözleşme onayı tamamlandığında müşteri cihazına göre ilgili mağazaya yönlendirilir. Base URL'ler boş bırakılırsa uygulama varsayılanını kullanır.
        </Text>

        <Text style={[styles.sectionTitle, { marginTop: 24 }]}>Tek QR kodu – sözleşme onay sayfası</Text>
        <Text style={styles.hint}>
          Tek bir QR ile misafir doğrudan sözleşme onay sayfasına gider. Oda seçimi yok; onay sonrası admin çalışan atar, çalışan oda ataması yapar.
        </Text>
        <TouchableOpacity style={styles.tokenBtn} onPress={generateLobbyToken} disabled={generatingToken}>
          {generatingToken ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.tokenBtnText}>Yeni token oluştur (tek QR URL)</Text>}
        </TouchableOpacity>
        <View style={styles.field}>
          <Text style={styles.label}>Tek QR tam URL (tüm sözleşme QR’ları bu adrese gider)</Text>
          <View style={styles.copyRow}>
            <TextInput style={[styles.input, styles.readOnlyInput, styles.copyInput]} value={singleQrUrl || FIXED_CONTRACT_QR_URL} editable={false} selectable />
            <TouchableOpacity
              style={styles.copyBtn}
              onPress={() => copyOrShare(singleQrUrl || FIXED_CONTRACT_QR_URL, 'Tek QR URL')}
              activeOpacity={0.8}
            >
              <Ionicons name="copy-outline" size={22} color="#fff" />
              <Text style={styles.copyBtnText}>Paylaş / Kopyala</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.hint}>Kaydettikten sonra hem "Yeni token oluştur (tek QR URL)" hem oda sözleşme QR’ları bu adresi kullanır. Onaylar Admin → Sözleşme onayları ve Personel uygulamasında görünür.</Text>

        <TouchableOpacity style={[styles.saveBtn, saving && styles.saveBtnDisabled]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>Kaydet</Text>}
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#64748b' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 48 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#1e293b', marginBottom: 12 },
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '600', color: '#475569', marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 10,
    padding: 12,
    fontSize: 15,
    backgroundColor: '#fff',
  },
  hint: { fontSize: 12, color: '#64748b', marginBottom: 20, lineHeight: 18 },
  recommendedBox: { marginBottom: 16 },
  recommendedLabel: { fontSize: 13, fontWeight: '600', color: '#1e293b', marginBottom: 8 },
  recommendedInput: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#86efac', borderRadius: 10, padding: 12, fontSize: 14, color: '#166534' },
  copyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copyInput: { flex: 1 },
  copyBtn: { backgroundColor: '#1a365d', paddingVertical: 12, paddingHorizontal: 16, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  copyBtnText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  readOnlyBox: { backgroundColor: '#f1f5f9', padding: 12, borderRadius: 10, marginBottom: 8 },
  readOnlyLabel: { fontSize: 12, color: '#64748b', marginBottom: 4 },
  readOnlyValue: { fontSize: 13, color: '#1e293b', fontFamily: 'monospace' },
  tokenBtn: { backgroundColor: '#0369a1', paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
  tokenBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  readOnlyInput: { backgroundColor: '#f8fafc' },
  saveBtn: { backgroundColor: '#1a365d', paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  saveBtnDisabled: { opacity: 0.7 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
