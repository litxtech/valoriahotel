import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import QRCode from 'react-native-qrcode-svg';

type Room = {
  id: string;
  room_number: string;
  floor: number | null;
  status: string;
  view_type: string | null;
  area_sqm: number | null;
  bed_type: string | null;
  price_per_night: number | null;
};

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [qrValue, setQrValue] = useState<string>('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const { data } = await supabase.from('rooms').select('*').eq('id', id).single();
      setRoom(data ?? null);
      const { data: qr } = await supabase.from('room_qr_codes').select('token').eq('room_id', id).gt('expires_at', new Date().toISOString()).order('created_at', { ascending: false }).limit(1).single();
      if (qr?.token) setQrValue(`${process.env.EXPO_PUBLIC_APP_URL ?? 'https://valoria.app'}/guest?token=${qr.token}`);
      setLoading(false);
    })();
  }, [id]);

  const refreshQR = async () => {
    if (!id) return;
    const { data, error } = await supabase.rpc('generate_room_qr_token', { p_room_id: id });
    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }
    setQrValue(`${process.env.EXPO_PUBLIC_APP_URL ?? 'https://valoria.app'}/guest?token=${data}`);
  };

  if (loading || !room) return <Text style={styles.loading}>Yükleniyor...</Text>;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Oda {room.room_number}</Text>
      <View style={styles.section}>
        <Text style={styles.label}>Durum</Text>
        <Text style={styles.value}>{room.status}</Text>
      </View>
      {room.floor != null && (
        <View style={styles.section}>
          <Text style={styles.label}>Kat</Text>
          <Text style={styles.value}>{room.floor}</Text>
        </View>
      )}
      {room.view_type && (
        <View style={styles.section}>
          <Text style={styles.label}>Manzara</Text>
          <Text style={styles.value}>{room.view_type}</Text>
        </View>
      )}
      {room.bed_type && (
        <View style={styles.section}>
          <Text style={styles.label}>Yatak</Text>
          <Text style={styles.value}>{room.bed_type}</Text>
        </View>
      )}
      {room.price_per_night != null && (
        <View style={styles.section}>
          <Text style={styles.label}>Gece fiyatı</Text>
          <Text style={styles.value}>₺{room.price_per_night}</Text>
        </View>
      )}
      <View style={styles.section}>
        <Text style={styles.label}>QR Kod</Text>
        {qrValue ? (
          <View style={styles.qrWrap}>
            <QRCode value={qrValue} size={180} />
            <Text style={styles.qrRoom}>Oda {room.room_number}</Text>
            <TouchableOpacity style={styles.qrBtn} onPress={refreshQR}>
              <Text style={styles.qrBtnText}>QR Kodu Yenile</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.qrBtn} onPress={refreshQR}>
            <Text style={styles.qrBtnText}>QR Kod Oluştur</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24 },
  loading: { padding: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#1a202c', marginBottom: 24 },
  section: { marginBottom: 20 },
  label: { fontSize: 12, color: '#718096', marginBottom: 4 },
  value: { fontSize: 16, color: '#1a202c', fontWeight: '500' },
  qrWrap: { alignItems: 'center', marginTop: 8 },
  qrRoom: { marginTop: 8, fontSize: 16, fontWeight: '600', color: '#1a202c' },
  qrBtn: { marginTop: 12, padding: 12, backgroundColor: '#ed8936', borderRadius: 8, alignSelf: 'center' },
  qrBtnText: { color: '#fff', fontWeight: '600' },
});
