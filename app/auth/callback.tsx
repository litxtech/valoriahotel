import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import * as Linking from 'expo-linking';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { log } from '@/lib/logger';

function parseHashParams(url: string): { access_token?: string; refresh_token?: string } {
  const hashIndex = url.indexOf('#');
  if (hashIndex === -1) return {};
  const hash = url.slice(hashIndex + 1);
  const params: Record<string, string> = {};
  hash.split('&').forEach((part) => {
    const [key, value] = part.split('=');
    if (key && value) params[decodeURIComponent(key)] = decodeURIComponent(value.replace(/\+/g, ' '));
  });
  return {
    access_token: params.access_token,
    refresh_token: params.refresh_token,
  };
}

export default function AuthCallbackScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ok' | 'error'>('loading');
  const [message, setMessage] = useState('Giriş yapılıyor...');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await Linking.getInitialURL();
      if (cancelled) return;
      if (!url || !url.includes('auth/callback')) {
        setStatus('error');
        setMessage('Geçersiz veya eksik bağlantı.');
        return;
      }
      const { access_token, refresh_token } = parseHashParams(url);
      if (!access_token || !refresh_token) {
        setStatus('error');
        setMessage('Oturum bilgisi alınamadı.');
        return;
      }
      try {
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        if (cancelled) return;
        await useAuthStore.getState().loadSession();
        const { staff } = useAuthStore.getState();
        log.info('AuthCallback', 'Magic link girişi tamamlandı', { hasStaff: !!staff });
        if (staff) router.replace('/admin');
        else router.replace('/customer');
        setStatus('ok');
      } catch (err) {
        if (cancelled) return;
        log.error('AuthCallback', 'setSession', err);
        setStatus('error');
        setMessage((err as Error)?.message ?? 'Giriş tamamlanamadı.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (status === 'error') {
    return (
      <View style={styles.container}>
        <Text style={styles.message}>{message}</Text>
        <TouchableOpacity style={styles.button} onPress={() => router.replace('/auth')}>
          <Text style={styles.buttonText}>Giriş sayfasına dön</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ActivityIndicator size="large" color="#ed8936" />
      <Text style={styles.message}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a365d',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  message: { color: '#fff', fontSize: 16, marginTop: 16, textAlign: 'center' },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginTop: 24,
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
