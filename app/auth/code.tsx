import { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  Keyboard,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { log } from '@/lib/logger';

const CODE_LENGTH = 6;

export default function AuthCodeScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ email: string }>();
  const email = (params.email ?? '').trim().toLowerCase();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<TextInput>(null);

  useEffect(() => {
    if (email) inputRef.current?.focus();
  }, [email]);

  const handleCodeChange = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH) Keyboard.dismiss();
  };

  const verify = async () => {
    if (!email) {
      Alert.alert('Hata', 'E-posta bilgisi eksik. Lütfen baştan başlayın.');
      router.replace('/auth');
      return;
    }
    const trimmed = code.replace(/\D/g, '');
    if (trimmed.length !== CODE_LENGTH) {
      Alert.alert('Hata', '6 haneli kodu girin.');
      return;
    }
    setLoading(true);
    try {
      let err = await supabase.auth.verifyOtp({
        email,
        token: trimmed,
        type: 'email',
      }).then((r) => r.error);
      if (err) {
        const res = await supabase.auth.verifyOtp({
          email,
          token: trimmed,
          type: 'magiclink',
        });
        if (res.error) throw err;
      }
      log.info('AuthCode', 'OTP doğrulandı');
      await useAuthStore.getState().loadSession();
      const { staff } = useAuthStore.getState();
      if (staff) router.replace('/admin');
      else router.replace('/customer');
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? 'Kod geçersiz veya süresi dolmuş.';
      log.error('AuthCode', 'verifyOtp', err, msg);
      Alert.alert('Doğrulama hatası', msg);
    }
    setLoading(false);
  };

  if (!email) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>E-posta bulunamadı.</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
          <Text style={styles.buttonText}>Geri dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>6 haneli kodu girin</Text>
      <Text style={styles.subtitle}>{email}</Text>

      <TextInput
        ref={inputRef}
        style={styles.input}
        value={code}
        onChangeText={handleCodeChange}
        placeholder="000000"
        placeholderTextColor="rgba(255,255,255,0.4)"
        keyboardType="number-pad"
        maxLength={CODE_LENGTH}
        selectTextOnFocus
        editable={!loading}
      />

      <TouchableOpacity
        style={[styles.button, code.length !== CODE_LENGTH && styles.buttonDisabled]}
        onPress={verify}
        disabled={code.length !== CODE_LENGTH || loading}
      >
        <Text style={styles.buttonText}>{loading ? 'Doğrulanıyor...' : 'Giriş yap'}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Farklı e-posta</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a365d',
    padding: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 8 },
  subtitle: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    marginBottom: 24,
  },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 20,
    color: '#fff',
    fontSize: 28,
    letterSpacing: 12,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  backBtn: { marginTop: 16, alignSelf: 'center' },
  backBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 15 },
  errorText: { color: '#fc8181', textAlign: 'center', marginBottom: 24 },
});
