import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

export default function RoomsLiveViewScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Canlı Oda Görünümü</Text>
      <Text style={styles.p}>
        TODO: Railway API + Supabase Realtime ile oda kartları (aktif kişi sayısı, ready/submitted/failed), hızlı aksiyonlar.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
});

