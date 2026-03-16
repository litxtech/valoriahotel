import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { log } from '@/lib/logger';

export default function AuthPasswordScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ signUp?: string }>();
  const isSignUp = params.signUp === '1';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    const e = email.trim().toLowerCase();
    if (!e) {
      Alert.alert('Hata', 'E-posta girin.');
      return;
    }
    if (!password || password.length < 6) {
      Alert.alert('Hata', 'Şifre en az 6 karakter olmalıdır.');
      return;
    }
    if (isSignUp && password !== confirmPassword) {
      Alert.alert('Hata', 'Şifreler eşleşmiyor.');
      return;
    }
    setLoading(true);
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email: e, password });
        if (error) throw error;
        Alert.alert(
          'Kayıt başarılı',
          'E-posta adresinize gelen onay linkine tıklayın. Ardından giriş yapabilirsiniz.',
          [{ text: 'Tamam', onPress: () => router.replace('/auth') }]
        );
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email: e, password });
        if (error) throw error;
        if (data.user) {
          await useAuthStore.getState().loadSession();
          const { staff } = useAuthStore.getState();
          if (staff) router.replace('/admin');
          else router.replace('/customer');
        }
      }
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? (isSignUp ? 'Kayıt yapılamadı.' : 'Giriş yapılamadı.');
      log.error('AuthPassword', isSignUp ? 'signUp' : 'signIn', err, msg);
      Alert.alert('Hata', msg);
    }
    setLoading(false);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={60}
    >
      <Text style={styles.title}>{isSignUp ? 'Kayıt ol' : 'Şifre ile giriş'}</Text>

      <TextInput
        style={styles.input}
        placeholder="E-posta"
        placeholderTextColor="rgba(255,255,255,0.5)"
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />
      <TextInput
        style={styles.input}
        placeholder="Şifre (min. 6 karakter)"
        placeholderTextColor="rgba(255,255,255,0.5)"
        value={password}
        onChangeText={setPassword}
        secureTextEntry
      />
      {isSignUp && (
        <TextInput
          style={styles.input}
          placeholder="Şifre tekrar"
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={confirmPassword}
          onChangeText={setConfirmPassword}
          secureTextEntry
        />
      )}

      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        <Text style={styles.buttonText}>
          {loading ? 'İşleniyor...' : isSignUp ? 'Kayıt ol' : 'Giriş yap'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
        <Text style={styles.backBtnText}>← Geri</Text>
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a365d',
    padding: 24,
    justifyContent: 'center',
  },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 24 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 12,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center' },
  backBtn: { marginTop: 24, alignSelf: 'center' },
  backBtnText: { color: 'rgba(255,255,255,0.8)', fontSize: 16 },
});
