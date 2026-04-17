import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function SubmittedPassportsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bildirilen Pasaportlar</Text>
      <Text style={styles.p}>
        TODO: Railway API ile ops.guest_documents scan_status=submitted/checkout_pending/checked_out/failed listesi + kart görünümü.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
});

