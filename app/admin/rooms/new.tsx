import { useState } from 'react';
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';

const STATUS_OPTIONS = ['available', 'cleaning', 'maintenance', 'out_of_order'];

export default function NewRoomScreen() {
  const router = useRouter();
  const [room_number, setRoomNumber] = useState('');
  const [floor, setFloor] = useState('');
  const [view_type, setViewType] = useState('');
  const [area_sqm, setAreaSqm] = useState('');
  const [bed_type, setBedType] = useState('');
  const [price_per_night, setPricePerNight] = useState('');
  const [status, setStatus] = useState('available');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!room_number.trim()) {
      Alert.alert('Hata', 'Oda numarası girin.');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .insert({
          room_number: room_number.trim(),
          floor: floor ? parseInt(floor, 10) : null,
          view_type: view_type.trim() || null,
          area_sqm: area_sqm ? parseFloat(area_sqm) : null,
          bed_type: bed_type.trim() || null,
          price_per_night: price_per_night ? parseFloat(price_per_night) : null,
          status,
        })
        .select('id')
        .single();
      if (error) throw error;
      router.replace(`/admin/rooms/${data.id}`);
    } catch (e: unknown) {
      Alert.alert('Hata', (e as Error)?.message ?? 'Oda eklenemedi.');
    }
    setLoading(false);
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.label}>Oda No *</Text>
      <TextInput
        style={styles.input}
        value={room_number}
        onChangeText={setRoomNumber}
        placeholder="102"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Kat</Text>
      <TextInput
        style={styles.input}
        value={floor}
        onChangeText={setFloor}
        placeholder="1"
        keyboardType="number-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Manzara</Text>
      <TextInput
        style={styles.input}
        value={view_type}
        onChangeText={setViewType}
        placeholder="Deniz / Şehir"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>m²</Text>
      <TextInput
        style={styles.input}
        value={area_sqm}
        onChangeText={setAreaSqm}
        placeholder="25"
        keyboardType="decimal-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Yatak tipi</Text>
      <TextInput
        style={styles.input}
        value={bed_type}
        onChangeText={setBedType}
        placeholder="Çift kişilik"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Gece fiyatı (₺)</Text>
      <TextInput
        style={styles.input}
        value={price_per_night}
        onChangeText={setPricePerNight}
        placeholder="1500"
        keyboardType="decimal-pad"
        placeholderTextColor="#9ca3af"
      />
      <Text style={styles.label}>Durum</Text>
      <View style={styles.chips}>
        {STATUS_OPTIONS.map((s) => (
          <TouchableOpacity
            key={s}
            style={[styles.chip, status === s && styles.chipActive]}
            onPress={() => setStatus(s)}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextActive]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <TouchableOpacity style={styles.button} onPress={submit} disabled={loading}>
        <Text style={styles.buttonText}>{loading ? 'Kaydediliyor...' : 'Oda Ekle'}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 24 },
  label: { fontSize: 14, fontWeight: '600', color: '#4a5568', marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    marginBottom: 16,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 24 },
  chip: { paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8, backgroundColor: '#e2e8f0' },
  chipActive: { backgroundColor: '#1a365d' },
  chipText: { color: '#4a5568', fontWeight: '500' },
  chipTextActive: { color: '#fff' },
  button: { backgroundColor: '#ed8936', paddingVertical: 16, borderRadius: 12, alignItems: 'center' },
  buttonText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
