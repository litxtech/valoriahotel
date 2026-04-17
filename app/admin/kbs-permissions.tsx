import { useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, TouchableOpacity, RefreshControl, Alert } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { theme } from '@/constants/theme';
import { apiGet, apiPost } from '@/lib/kbsApi';

type PermissionCatalogItem = { code: string; name: string; description?: string | null };
type UserRow = {
  id: string;
  fullName?: string | null;
  role: string;
  isActive: boolean;
  permissions: Record<string, boolean>;
};

export default function AdminKbsPermissionsScreen() {
  const [savingUserId, setSavingUserId] = useState<string | null>(null);

  const catalogQ = useQuery({
    queryKey: ['kbs', 'admin', 'permission_catalog'],
    queryFn: async () => {
      const res = await apiGet<PermissionCatalogItem[]>('/admin/permission-catalog');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    }
  });

  const usersQ = useQuery({
    queryKey: ['kbs', 'admin', 'users_with_permissions'],
    queryFn: async () => {
      const res = await apiGet<UserRow[]>('/admin/users-with-permissions');
      if (!res.ok) throw new Error(res.error.message);
      return res.data;
    }
  });

  const codes = useMemo(() => (catalogQ.data ?? []).map((p) => p.code), [catalogQ.data]);
  const catalogByCode = useMemo(() => {
    const m = new Map<string, PermissionCatalogItem>();
    for (const p of catalogQ.data ?? []) m.set(p.code, p);
    return m;
  }, [catalogQ.data]);

  const toggle = async (user: UserRow, code: string) => {
    const next = !(user.permissions?.[code] ?? false);
    setSavingUserId(user.id);
    try {
      const res = await apiPost('/admin/users/' + user.id + '/permissions', { permissions: { [code]: next } });
      if (!res.ok) {
        Alert.alert('İzin güncelleme', res.error.message);
        return;
      }
      usersQ.refetch();
    } finally {
      setSavingUserId(null);
    }
  };

  const refreshing = catalogQ.isFetching || usersQ.isFetching;
  const onRefresh = async () => {
    await Promise.all([catalogQ.refetch(), usersQ.refetch()]);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>KBS Yetkileri (OPS)</Text>
      <Text style={styles.p}>Ops personelinin KBS ekranlarına erişimi ve aksiyon yetkileri.</Text>

      <FlatList
        data={usersQ.data ?? []}
        keyExtractor={(it) => it.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <Text style={styles.userTitle}>
              {item.fullName || item.id.slice(0, 8)} • {item.role} {item.isActive ? '' : '(pasif)'}
            </Text>

            {codes.length === 0 ? (
              <Text style={styles.meta}>Permission catalog bulunamadı.</Text>
            ) : (
              <View style={styles.grid}>
                {codes.map((code) => {
                  const allowed = item.permissions?.[code] === true;
                  const meta = catalogByCode.get(code);
                  return (
                    <TouchableOpacity
                      key={code}
                      style={[styles.pill, allowed ? styles.pillOn : styles.pillOff, savingUserId === item.id && { opacity: 0.65 }]}
                      onPress={() => toggle(item, code)}
                      disabled={savingUserId != null}
                      activeOpacity={0.85}
                    >
                      <Text style={[styles.pillText, allowed ? styles.pillTextOn : styles.pillTextOff]} numberOfLines={1}>
                        {meta?.name ?? code}
                      </Text>
                      <Text style={styles.pillSub} numberOfLines={1}>
                        {code}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
        ListEmptyComponent={<Text style={styles.empty}>{usersQ.isLoading ? 'Yükleniyor…' : 'Kullanıcı yok.'}</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: theme.colors.backgroundSecondary, gap: 10 },
  title: { fontSize: 18, fontWeight: '900', color: theme.colors.text },
  p: { color: theme.colors.textSecondary, lineHeight: 20 },
  empty: { color: theme.colors.textSecondary, marginTop: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.borderLight, padding: 12, marginBottom: 10, gap: 10 },
  userTitle: { fontWeight: '900', color: theme.colors.text },
  meta: { color: theme.colors.textSecondary },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  pill: { borderRadius: 12, paddingVertical: 10, paddingHorizontal: 10, borderWidth: 1, width: '48%' },
  pillOn: { backgroundColor: '#e6f7ee', borderColor: '#bde7cf' },
  pillOff: { backgroundColor: '#f6f6f6', borderColor: theme.colors.borderLight },
  pillText: { fontWeight: '900' },
  pillTextOn: { color: '#0f5132' },
  pillTextOff: { color: theme.colors.text },
  pillSub: { marginTop: 2, fontFamily: 'monospace', fontSize: 11, color: theme.colors.textSecondary },
});

