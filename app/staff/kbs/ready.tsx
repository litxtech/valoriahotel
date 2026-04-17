import { View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, RefreshControl } from 'react-native';
import { theme } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/kbsApi';

export default function ReadyToSubmitScreen() {
  const roomsQ = useQuery({
    queryKey: ['kbs', 'rooms'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/rooms');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
  });

  const q = useQuery({
    queryKey: ['kbs', 'ready_to_submit'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/ready-to-submit');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
  });

  const assignRoom = async (guestDocumentId: string) => {
    const rooms = roomsQ.data ?? [];
    if (rooms.length === 0) {
      Alert.alert('Oda yok', 'Önce odaları tanımlayın.');
      return;
    }
    const actions = rooms.slice(0, 30).map((r) => ({
      text: String(r.room_number),
      onPress: async () => {
        const res = await apiPost('/stay/assign-room', { guestDocumentId, roomId: r.id });
        if (!res.ok) Alert.alert('Oda atama', res.error.message);
        else Alert.alert('Oda atandı', `Oda: ${r.room_number}`);
      },
    }));
    Alert.alert('Oda seç', 'Misafiri hangi odaya atayalım?', [
      ...actions,
      { text: 'İptal', style: 'cancel' },
    ]);
  };

  const submit = async (guestDocumentId: string) => {
    const res = await apiPost<{ transactionId: string; idempotent?: boolean }>('/submissions/check-in', { guestDocumentId });
    if (!res.ok) {
      Alert.alert('Bildir', res.error.message);
      return;
    }
    Alert.alert('Bildir', `İşlem alındı. Tx: ${String(res.data.transactionId).slice(0, 8)}${res.data.idempotent ? ' (idempotent)' : ''}`);
    q.refetch();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bildirime Hazır</Text>
      <Text style={styles.p}>Ready kayıtlar. Önce oda ata, sonra bildir.</Text>

      <FlatList
        data={q.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.nameMono}>Doc: {item.document_number ?? '-'}</Text>
            <Text style={styles.meta}>Nation: {item.nationality_code ?? '-'}</Text>
            <Text style={styles.meta}>Status: {item.scan_status}</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              <TouchableOpacity style={[styles.btn, { flex: 1, backgroundColor: '#374151' }]} onPress={() => assignRoom(item.id)}>
                <Text style={styles.btnText}>Oda ata</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.btn, { flex: 1 }]}
                onPress={() => submit(item.id)}
              >
                <Text style={styles.btnText}>Bildir</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={
          <Text style={styles.empty}>{q.isLoading ? 'Yükleniyor…' : 'Hazır kayıt yok.'}</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 4 },
  nameMono: { fontFamily: 'monospace', color: theme.colors.text, fontWeight: '800' },
  meta: { color: theme.colors.textSecondary },
  btn: { marginTop: 8, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900' },
});

