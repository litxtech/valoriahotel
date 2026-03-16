import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  view_type: string | null;
  bed_type: string | null;
  price_per_night: number | null;
};

export default function RoomsList() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('rooms').select('id, room_number, floor, status, view_type, bed_type, price_per_night').order('room_number');
      setRooms(data ?? []);
      setLoading(false);
    })();
  }, []);

  const statusColor: Record<string, string> = {
    available: '#48bb78',
    occupied: '#e53e3e',
    cleaning: '#ed8936',
    maintenance: '#805ad5',
    out_of_order: '#718096',
  };

  if (loading) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <View style={styles.container}>
      <Link href="/admin/rooms/new" asChild>
        <TouchableOpacity style={styles.addBtn}>
          <Text style={styles.addBtnText}>+ Oda Ekle</Text>
        </TouchableOpacity>
      </Link>
      <FlatList
        data={rooms}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Link href={`/admin/rooms/${item.id}`} asChild>
            <TouchableOpacity style={styles.card}>
              <View style={styles.cardRow}>
                <Text style={styles.roomNum}>Oda {item.room_number}</Text>
                <View style={[styles.badge, { backgroundColor: statusColor[item.status] || '#718096' }]}>
                  <Text style={styles.badgeText}>{item.status}</Text>
                </View>
              </View>
              {item.floor != null && <Text style={styles.meta}>Kat: {item.floor}</Text>}
              {item.price_per_night != null && <Text style={styles.meta}>₺{item.price_per_night}/gece</Text>}
            </TouchableOpacity>
          </Link>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  loading: { padding: 24 },
  addBtn: {
    margin: 16,
    padding: 16,
    backgroundColor: '#1a365d',
    borderRadius: 12,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  list: { padding: 16, paddingTop: 0 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  roomNum: { fontSize: 18, fontWeight: '700', color: '#1a202c' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  meta: { fontSize: 14, color: '#718096', marginTop: 4 },
});
