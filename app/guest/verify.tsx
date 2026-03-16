import { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';

export default function VerifyScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { guestId, setStep } = useGuestFlowStore();
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!guestId) return;
    setLoading(true);
    try {
      const { data: guest } = await supabase.from('guests').select('phone').eq('id', guestId).single();
      if (!guest?.phone) {
        Alert.alert(t('error'), 'Telefon numarası bulunamadı.');
        setLoading(false);
        return;
      }
      const randomCode = Math.floor(100000 + Math.random() * 900000).toString();
      await supabase.from('verification_codes').insert({
        guest_id: guestId,
        phone: guest.phone,
        code: randomCode,
        channel: 'sms',
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      });
      Alert.alert('Kod Gönderildi', `Test için kod: ${randomCode}`);
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? 'Kod gönderilemedi.');
    }
    setLoading(false);
  };

  const verify = async () => {
    if (!guestId || !code.trim()) {
      Alert.alert(t('error'), t('enterCode'));
      return;
    }
    setLoading(true);
    try {
      const { data: row } = await supabase
        .from('verification_codes')
        .select('id')
        .eq('guest_id', guestId)
        .eq('code', code.trim())
        .is('used_at', null)
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (!row) {
        Alert.alert(t('error'), t('invalidCode'));
        setLoading(false);
        return;
      }

      await supabase.from('verification_codes').update({ used_at: new Date().toISOString() }).eq('id', row.id);
      await supabase
        .from('guests')
        .update({ verified_at: new Date().toISOString(), verification_method: 'sms' })
        .eq('id', guestId);

      setStep('sign');
      router.replace('/guest/sign');
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? t('invalidCode'));
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('verificationCode')}</Text>
      <Text style={styles.subtitle}>{t('enterCode')}</Text>
      <TextInput
        style={styles.input}
        placeholder="000000"
        placeholderTextColor="rgba(255,255,255,0.5)"
        value={code}
        onChangeText={setCode}
        keyboardType="number-pad"
        maxLength={6}
      />
      <TouchableOpacity style={styles.button} onPress={verify} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? t('loading') : t('verify')}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.link} onPress={sendCode} disabled={loading}>
        <Text style={styles.linkText}>{t('sendCode')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d', padding: 24, paddingTop: 80 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 24 },
  input: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 12,
    padding: 16,
    color: '#fff',
    fontSize: 24,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: 24,
  },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
  link: { marginTop: 16, alignItems: 'center' },
  linkText: { color: 'rgba(255,255,255,0.9)', fontSize: 14 },
});
