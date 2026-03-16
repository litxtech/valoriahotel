import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Guest = {
  id: string;
  full_name: string;
  phone: string | null;
  status: string;
  created_at: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
};

export default function GuestsList() {
  const [guests, setGuests] = useState<Guest[]>([]);
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      let q = supabase
        .from('guests')
        .select('id, full_name, phone, status, created_at, room_id, rooms(room_number)')
        .order('created_at', { ascending: false });
      if (filter === 'pending') q = q.eq('status', 'pending');
      const { data } = await q;
      setGuests(data ?? []);
      setLoading(false);
    })();
  }, [filter]);

  const formatDate = (s: string) => new Date(s).toLocaleString('tr-TR');

  return (
    <View style={styles.container}>
      <View style={styles.tabs}>
        <TouchableOpacity style={[styles.tab, filter === 'pending' && styles.tabActive]} onPress={() => setFilter('pending')}>
          <Text style={[styles.tabText, filter === 'pending' && styles.tabTextActive]}>Onay Bekleyen</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.tab, filter === 'all' && styles.tabActive]} onPress={() => setFilter('all')}>
          <Text style={[styles.tabText, filter === 'all' && styles.tabTextActive]}>Tümü</Text>
        </TouchableOpacity>
      </View>
      {loading ? (
        <Text style={styles.loading}>Yükleniyor...</Text>
      ) : (
        <FlatList
          data={guests}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Link href={`/admin/guests/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <Text style={styles.name}>{item.full_name}</Text>
                {item.phone && <Text style={styles.meta}>{item.phone}</Text>}
                <View style={styles.row}>
                  <Text style={styles.date}>{formatDate(item.created_at)}</Text>
                  <View style={[styles.badge, item.status === 'pending' && styles.badgePending]}>
                    <Text style={styles.badgeText}>{item.status}</Text>
                  </View>
                </View>
                {item.rooms?.room_number && <Text style={styles.room}>Oda {item.rooms.room_number}</Text>}
              </TouchableOpacity>
            </Link>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  tabs: { flexDirection: 'row', padding: 16, gap: 8 },
  tab: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#e2e8f0', alignItems: 'center' },
  tabActive: { backgroundColor: '#1a365d' },
  tabText: { color: '#4a5568', fontWeight: '600' },
  tabTextActive: { color: '#fff' },
  loading: { padding: 24 },
  list: { padding: 16 },
  card: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  name: { fontSize: 18, fontWeight: '700', color: '#1a202c' },
  meta: { fontSize: 14, color: '#718096', marginTop: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  date: { fontSize: 12, color: '#a0aec0' },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: '#c6f6d5' },
  badgePending: { backgroundColor: '#feebc8' },
  badgeText: { fontSize: 12, fontWeight: '600', color: '#1a202c' },
  room: { fontSize: 14, color: '#2b6cb0', marginTop: 4 },
});
