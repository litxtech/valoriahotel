import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function ReadyToSubmitScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bildirime Hazır</Text>
      <Text style={styles.p}>
        TODO: Railway API ile ops.guest_documents scan_status=ready_to_submit listesi, filtreler, bulk selection, tekli/toplu/oda/grup bazlı submit.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
});

