import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList } from 'react-native';
import { Link } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Guest = {
  id: string;
  full_name: string;
  status: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
};

export default function CheckInScreen() {
  const [pending, setPending] = useState<Guest[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('guests')
        .select('id, full_name, status, room_id, rooms(room_number)')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });
      setPending(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Onay Bekleyen Misafirler</Text>
      <Text style={styles.subtitle}>Misafire oda atamak için listeden seçin.</Text>
      {loading ? (
        <Text style={styles.loading}>Yükleniyor...</Text>
      ) : (
        <FlatList
          data={pending}
          keyExtractor={(g) => g.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Link href={`/admin/guests/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <Text style={styles.name}>{item.full_name}</Text>
                <Text style={styles.status}>{item.status}</Text>
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
  title: { fontSize: 20, fontWeight: '700', color: '#1a202c', padding: 24, paddingBottom: 4 },
  subtitle: { fontSize: 14, color: '#718096', paddingHorizontal: 24, paddingBottom: 16 },
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
  name: { fontSize: 18, fontWeight: '600', color: '#1a202c' },
  status: { fontSize: 14, color: '#718096', marginTop: 4 },
});
