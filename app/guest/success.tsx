import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useGuestFlowStore } from '@/stores/guestFlowStore';

export default function SuccessScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { reset } = useGuestFlowStore();

  const done = () => {
    reset();
    router.replace('/');
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>✓</Text>
      <Text style={styles.title}>{t('success')}</Text>
      <Text style={styles.subtitle}>{t('successDesc')}</Text>
      <TouchableOpacity style={styles.button} onPress={done}>
        <Text style={styles.buttonText}>Tamam</Text>
      </TouchableOpacity>
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
  icon: { fontSize: 64, color: '#48bb78', marginBottom: 24 },
  title: { fontSize: 26, fontWeight: '700', color: '#fff', marginBottom: 12, textAlign: 'center' },
  subtitle: { fontSize: 16, color: 'rgba(255,255,255,0.85)', textAlign: 'center', marginBottom: 48 },
  button: {
    backgroundColor: '#ed8936',
    paddingVertical: 16,
    paddingHorizontal: 48,
    borderRadius: 12,
  },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
