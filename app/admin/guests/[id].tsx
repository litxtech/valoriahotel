import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

type Guest = {
  id: string;
  full_name: string;
  id_number: string | null;
  id_type: string | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  status: string;
  room_id: string | null;
  rooms: { room_number: string } | null;
  created_at: string;
  verified_at: string | null;
  admin_notes: string | null;
};

export default function GuestDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [guest, setGuest] = useState<Guest | null>(null);
  const [rooms, setRooms] = useState<{ id: string; room_number: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data: g } = await supabase.from('guests').select('*, rooms(room_number)').eq('id', id).single();
      setGuest(g ?? null);
      const { data: r } = await supabase.from('rooms').select('id, room_number').eq('status', 'available');
      setRooms(r ?? []);
      setLoading(false);
    })();
  }, [id]);

  const assignRoom = async (roomId: string) => {
    if (!id) return;
    const { error } = await supabase.from('guests').update({ room_id: roomId, status: 'checked_in', check_in_at: new Date().toISOString() }).eq('id', id);
    if (error) Alert.alert('Hata', error.message);
    else {
      await supabase.from('rooms').update({ status: 'occupied' }).eq('id', roomId);
      setGuest((prev) => prev ? { ...prev, room_id: roomId, status: 'checked_in' } : null);
    }
  };

  const checkOut = async () => {
    if (!id || !guest?.room_id) return;
    const { error } = await supabase.from('guests').update({ status: 'checked_out', check_out_at: new Date().toISOString() }).eq('id', id);
    if (error) Alert.alert('Hata', error.message);
    else {
      await supabase.from('rooms').update({ status: 'available' }).eq('id', guest.room_id);
      setGuest((prev) => prev ? { ...prev, status: 'checked_out', room_id: null } : null);
    }
  };

  if (loading || !guest) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{guest.full_name}</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Durum</Text>
        <Text style={styles.value}>{guest.status}</Text>
      </View>
      {guest.phone && (
        <View style={styles.section}>
          <Text style={styles.label}>Telefon</Text>
          <Text style={styles.value}>{guest.phone}</Text>
        </View>
      )}
      {guest.email && (
        <View style={styles.section}>
          <Text style={styles.label}>E-posta</Text>
          <Text style={styles.value}>{guest.email}</Text>
        </View>
      )}
      {guest.id_number && (
        <View style={styles.section}>
          <Text style={styles.label}>Kimlik No</Text>
          <Text style={styles.value}>{guest.id_number}</Text>
        </View>
      )}
      {guest.rooms?.room_number && (
        <View style={styles.section}>
          <Text style={styles.label}>Oda</Text>
          <Text style={styles.value}>{guest.rooms.room_number}</Text>
        </View>
      )}
      {guest.admin_notes && (
        <View style={styles.section}>
          <Text style={styles.label}>Notlar</Text>
          <Text style={styles.value}>{guest.admin_notes}</Text>
        </View>
      )}
      {guest.status === 'pending' && rooms.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Oda Ata</Text>
          {rooms.map((r) => (
            <TouchableOpacity key={r.id} style={styles.roomBtn} onPress={() => assignRoom(r.id)}>
              <Text style={styles.roomBtnText}>Oda {r.room_number}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {guest.status === 'checked_in' && guest.room_id && (
        <TouchableOpacity style={styles.checkOutBtn} onPress={checkOut}>
          <Text style={styles.checkOutBtnText}>Check-out</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24 },
  loading: { padding: 24 },
  name: { fontSize: 22, fontWeight: '700', color: '#1a202c', marginBottom: 24 },
  section: { marginBottom: 20 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4 },
  value: { fontSize: 16, color: '#1a202c' },
  roomBtn: { marginTop: 8, padding: 12, backgroundColor: '#1a365d', borderRadius: 8, alignSelf: 'flex-start' },
  roomBtnText: { color: '#fff', fontWeight: '600' },
  checkOutBtn: { marginTop: 24, padding: 16, backgroundColor: '#e53e3e', borderRadius: 12, alignItems: 'center' },
  checkOutBtnText: { color: '#fff', fontWeight: '600' },
});
