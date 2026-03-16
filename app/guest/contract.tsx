import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';
import { supabase } from '@/lib/supabase';

export default function ContractScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const { lang, setStep } = useGuestFlowStore();
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('contract_templates')
        .select('content')
        .eq('lang', i18n.language || lang)
        .eq('is_active', true)
        .order('version', { ascending: false })
        .limit(1)
        .single();
      setContent(data?.content ?? t('contract'));
      setLoading(false);
    })();
  }, [lang, i18n.language]);

  const accept = () => {
    setStep('form');
    router.replace('/guest/form');
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('contract')}</Text>
      </View>
      {loading ? (
        <Text style={styles.loading}>{t('loading')}</Text>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
          <Text style={styles.body}>{content}</Text>
          <TouchableOpacity style={styles.button} onPress={accept}>
            <Text style={styles.buttonText}>{t('acceptContract')} - {t('next')}</Text>
          </TouchableOpacity>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#1a365d' },
  header: { paddingTop: 56, paddingHorizontal: 24, paddingBottom: 16 },
  title: { fontSize: 24, fontWeight: '700', color: '#fff' },
  loading: { color: '#fff', padding: 24 },
  scroll: { flex: 1 },
  scrollContent: { padding: 24, paddingBottom: 48 },
  body: { color: 'rgba(255,255,255,0.95)', fontSize: 15, lineHeight: 24, marginBottom: 32 },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
