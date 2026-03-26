import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, RefreshControl } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminButton, AdminCard } from '@/components/admin';
import type { Camera } from '@/lib/cameras';

export default function AdminCamerasIndex() {
  const router = useRouter();
  const [cameras, setCameras] = useState<Camera[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from('cameras')
      .select('*')
      .order('name');
    if (!error) setCameras(data ?? []);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <AdminButton
          title="Yeni kamera ekle"
          onPress={() => router.push('/admin/cameras/new')}
          variant="accent"
          size="md"
          leftIcon={<Ionicons name="add" size={20} color="#fff" />}
          fullWidth
        />
        <TouchableOpacity
          style={styles.logsBtn}
          onPress={() => router.push('/admin/cameras/logs')}
        >
          <Ionicons name="document-text-outline" size={22} color={adminTheme.colors.primary} />
          <Text style={styles.logsBtnText}>Loglar</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <Text style={styles.loadingText}>Yükleniyor...</Text>
        </View>
      ) : (
        <FlatList
          data={cameras}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />
          }
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.card}
              onPress={() => router.push(`/admin/cameras/${item.id}`)}
              activeOpacity={0.8}
            >
              <View style={styles.cardRow}>
                <View style={styles.cardLeft}>
                  <Ionicons
                    name={item.is_active ? 'videocam' : 'videocam-outline'}
                    size={24}
                    color={item.is_active ? adminTheme.colors.primary : adminTheme.colors.textMuted}
                  />
                  <View style={styles.cardInfo}>
                    <Text style={styles.cardName}>{item.name}</Text>
                    {item.location ? (
                      <Text style={styles.cardLocation}>{item.location}</Text>
                    ) : null}
                    <Text style={styles.cardIp}>{item.ip_address}</Text>
                  </View>
                </View>
                <Ionicons name="chevron-forward" size={20} color={adminTheme.colors.textMuted} />
              </View>
              <View style={styles.cardBadge}>
                <View style={[styles.badge, !item.is_active && styles.badgeInactive]}>
                  <Text style={styles.badgeText}>{item.is_active ? 'Aktif' : 'Pasif'}</Text>
                </View>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <AdminCard>
              <Text style={styles.emptyText}>Henüz kamera eklenmemiş.</Text>
              <AdminButton
                title="İlk kamerayı ekle"
                onPress={() => router.push('/admin/cameras/new')}
                variant="accent"
                size="md"
                style={{ marginTop: 12 }}
              />
            </AdminCard>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  topBar: { padding: 16, gap: 12 },
  logsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  logsBtnText: {
    fontSize: 15,
    fontWeight: '600',
    color: adminTheme.colors.primary,
  },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  loadingText: { fontSize: 15, color: adminTheme.colors.textMuted },
  list: { padding: 16, paddingBottom: 32 },
  card: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.lg,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardLeft: { flexDirection: 'row', alignItems: 'center', gap: 14, flex: 1 },
  cardInfo: { flex: 1 },
  cardName: { fontSize: 16, fontWeight: '700', color: adminTheme.colors.text },
  cardLocation: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  cardIp: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  cardBadge: { marginTop: 12, flexDirection: 'row' },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: adminTheme.colors.successLight,
  },
  badgeInactive: { backgroundColor: adminTheme.colors.border },
  badgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: adminTheme.colors.success,
  },
  emptyText: {
    fontSize: 15,
    color: adminTheme.colors.textSecondary,
    textAlign: 'center',
  },
});
