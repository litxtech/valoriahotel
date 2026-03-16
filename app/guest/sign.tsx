import { useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import SignatureCanvas from 'react-native-signature-canvas';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';

export default function SignScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { guestId, setStep } = useGuestFlowStore();
  const ref = useRef<SignatureCanvas>(null);
  const [loading, setLoading] = useState(false);

  const clear = () => ref.current?.clearSignature();

  const submit = async () => {
    ref.current?.readSignature();
  };

  const handleOK = async (signature: string) => {
    if (!guestId || !signature) {
      Alert.alert(t('error'), t('signBelow'));
      return;
    }
    setLoading(true);
    try {
      await supabase.from('guests').update({ signature_data: signature }).eq('id', guestId);
      setStep('done');
      router.replace('/guest/success');
    } catch (e: unknown) {
      Alert.alert(t('error'), (e as Error)?.message ?? 'İmza kaydedilemedi.');
    }
    setLoading(false);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('signContract')}</Text>
      <Text style={styles.subtitle}>{t('signBelow')}</Text>
      <View style={styles.canvasWrap}>
        <SignatureCanvas
          ref={ref}
          onOK={handleOK}
          onEmpty={() => Alert.alert(t('error'), t('signBelow'))}
          descriptionText=""
          clearText={t('clear')}
          confirmText={t('submit')}
          webStyle={webStyle}
          backgroundColor="rgba(255,255,255,0.05)"
          penColor="#fff"
        />
      </View>
      <TouchableOpacity style={styles.clearBtn} onPress={clear}>
        <Text style={styles.clearBtnText}>{t('clear')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const webStyle = `
  .m-signature-pad { box-shadow: none; border: 2px solid rgba(255,255,255,0.3); border-radius: 12px; }
  .m-signature-pad--body { border: none; }
`;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d', padding: 24, paddingTop: 56 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff', marginBottom: 8 },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.8)', marginBottom: 16 },
  canvasWrap: { height: 220, borderRadius: 12, overflow: 'hidden', marginBottom: 16 },
  clearBtn: {
    alignSelf: 'center',
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 8,
  },
  clearBtnText: { color: '#fff', fontWeight: '600' },
});
