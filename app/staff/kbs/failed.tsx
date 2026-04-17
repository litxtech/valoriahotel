import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function FailedTransactionsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Hatalar & Retry</Text>
      <Text style={styles.p}>
        TODO: Railway API ile failed transaction listesi + retry butonu + retry count + son hata özeti.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
});

