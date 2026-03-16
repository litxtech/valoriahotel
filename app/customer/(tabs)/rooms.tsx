import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, RefreshControl, TouchableOpacity, StyleSheet } from 'react-native';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  view_type: string | null;
  status: string;
  price_per_night: number | null;
};

export default function CustomerRooms() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from('rooms').select('id, room_number, floor, view_type, status, price_per_night').order('room_number');
    setRooms(data ?? []);
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView
      style={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />}
    >
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Odalar</Text>
        <Text style={styles.headerSubtitle}>Konaklama seçenekleri</Text>
      </View>
      {rooms.map((r) => (
        <View key={r.id} style={styles.card}>
          <View style={styles.cardRow}>
            <Text style={styles.roomNumber}>Oda {r.room_number}</Text>
            <View style={[styles.badge, r.status === 'available' ? styles.badgeOk : styles.badgeBusy]}>
              <Text style={styles.badgeText}>{r.status === 'available' ? 'Müsait' : r.status}</Text>
            </View>
          </View>
          {r.floor != null && <Text style={styles.meta}>{r.floor}. kat</Text>}
          {r.view_type && <Text style={styles.meta}>Manzara: {r.view_type}</Text>}
          {r.price_per_night != null && <Text style={styles.price}>{r.price_per_night} ₺/gece</Text>}
        </View>
      ))}
      {rooms.length === 0 && <Text style={styles.empty}>Henüz oda bilgisi yok.</Text>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  header: { padding: 20, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  headerTitle: { fontSize: 22, fontWeight: '700', color: theme.colors.text },
  headerSubtitle: { fontSize: 14, color: theme.colors.textSecondary, marginTop: 4 },
  card: {
    backgroundColor: theme.colors.surface,
    margin: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: theme.radius.md,
    ...theme.shadows.sm,
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomNumber: { fontSize: 18, fontWeight: '700' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
  badgeOk: { backgroundColor: '#dcfce7' },
  badgeBusy: { backgroundColor: '#fee2e2' },
  badgeText: { fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 13, color: '#666', marginTop: 4 },
  price: { fontSize: 14, fontWeight: '600', color: '#b8860b', marginTop: 8 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 32 },
});
