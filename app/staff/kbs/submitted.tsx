import { View, Text, StyleSheet, FlatList, RefreshControl, TouchableOpacity, Alert } from 'react-native';
import { theme } from '@/constants/theme';
import { useQuery } from '@tanstack/react-query';
import { apiGet, apiPost } from '@/lib/kbsApi';

export default function SubmittedPassportsScreen() {
  const q = useQuery({
    queryKey: ['kbs', 'submitted'],
    queryFn: async () => {
      const res = await apiGet<any[]>('/submitted-passports');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    },
  });

  const checkout = async (guestDocumentId: string) => {
    const res = await apiPost<{ transactionId: string; idempotent?: boolean }>('/submissions/check-out', { guestDocumentId });
    if (!res.ok) {
      Alert.alert('Checkout', res.error.message);
      return;
    }
    Alert.alert('Checkout', `İşlem alındı. Tx: ${String(res.data.transactionId).slice(0, 8)}${res.data.idempotent ? ' (idempotent)' : ''}`);
    q.refetch();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Bildirilen Pasaportlar</Text>
      <Text style={styles.p}>Submitted/checkout durumları.</Text>

      <FlatList
        data={q.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={q.isFetching} onRefresh={() => q.refetch()} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.mono}>Doc: {item.document_number ?? '-'}</Text>
            <Text style={styles.meta}>Status: {item.scan_status}</Text>
            <Text style={styles.meta}>Submitted: {item.submitted_at ?? '-'}</Text>
            {String(item.scan_status) === 'submitted' || String(item.scan_status) === 'checkout_pending' ? (
              <TouchableOpacity style={styles.btn} onPress={() => checkout(item.id)}>
                <Text style={styles.btnText}>Checkout</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{q.isLoading ? 'Yükleniyor…' : 'Kayıt yok.'}</Text>}
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
  mono: { fontFamily: 'monospace', color: theme.colors.text, fontWeight: '800' },
  meta: { color: theme.colors.textSecondary },
  btn: { marginTop: 8, backgroundColor: theme.colors.primary, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
  btnText: { color: '#fff', fontWeight: '900' },
});

