import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '@/constants/theme';

function Tile(props: { title: string; subtitle: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void }) {
  return (
    <TouchableOpacity style={styles.tile} onPress={props.onPress} activeOpacity={0.9}>
      <View style={styles.tileIcon}>
        <Ionicons name={props.icon} size={22} color={theme.colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tileTitle}>{props.title}</Text>
        <Text style={styles.tileSub}>{props.subtitle}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
    </TouchableOpacity>
  );
}

export default function StaffKbsTab() {
  const router = useRouter();
  return (
    <View style={styles.container}>
      <Text style={styles.h1}>KBS Operasyon</Text>
      <Text style={styles.p}>Seri tarama → oda atama → tekli/toplu bildirim → çıkış. Yetki bazlıdır.</Text>

      <Tile title="Seri Tarama" subtitle="Pasaport/ID MRZ oku, draft oluştur" icon="scan-outline" onPress={() => router.push('/staff/kbs/scan')} />
      <Tile title="Bildirime Hazır" subtitle="Tekli/toplu/oda/grup bazlı submit" icon="paper-plane-outline" onPress={() => router.push('/staff/kbs/ready')} />
      <Tile title="Bildirilenler" subtitle="Submitted/checkout durumlarını izle" icon="list-outline" onPress={() => router.push('/staff/kbs/submitted')} />
      <Tile title="Canlı Odalar" subtitle="Oda bazlı hızlı aksiyonlar" icon="bed-outline" onPress={() => router.push('/staff/kbs/rooms')} />
      <Tile title="Hatalar" subtitle="Failed işlemler + retry" icon="alert-circle-outline" onPress={() => router.push('/staff/kbs/failed')} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, padding: 16, gap: 12 },
  h1: { fontSize: 22, fontWeight: '800', color: theme.colors.text },
  p: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: 8 },
  tile: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  tileIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tileTitle: { fontSize: 16, fontWeight: '800', color: theme.colors.text },
  tileSub: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 2 },
});

