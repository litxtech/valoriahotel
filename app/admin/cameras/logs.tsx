import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  TouchableOpacity,
  Platform,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { adminTheme } from '@/constants/adminTheme';
import { AdminCard } from '@/components/admin';
import { listCameraLogs } from '@/lib/cameras';
import type { CameraLog } from '@/lib/cameras';
import { format, parseISO } from 'date-fns';
import { tr } from 'date-fns/locale';

const ACTION_LABELS: Record<string, string> = {
  izleme_basladi: 'İzleme başladı',
  izleme_bitirdi: 'İzleme bitirdi',
  kayit_baslatti: 'Kayıt başlattı',
  kayit_durdurdu: 'Kayıt durdurdu',
  fotograf_cekti: 'Fotoğraf çekti',
  kayit_indirdi: 'Kayıt indirdi',
};

export default function CameraLogsScreen() {
  const [logs, setLogs] = useState<CameraLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [filterCamera, setFilterCamera] = useState<string | null>(null);
  const [cameras, setCameras] = useState<{ id: string; name: string }[]>([]);
  const [stats, setStats] = useState({ totalViews: 0, totalDuration: 0 });

  const load = useCallback(async () => {
    const data = await listCameraLogs({
      cameraId: filterCamera ?? undefined,
      limit: 100,
      fromDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    });
    setLogs(data);

    let views = 0;
    let duration = 0;
    data.forEach((l) => {
      if (l.action === 'izleme_bitirdi' && l.duration_seconds) {
        views += 1;
        duration += l.duration_seconds;
      }
    });
    setStats({ totalViews: views, totalDuration: duration });
  }, [filterCamera]);

  useEffect(() => {
    supabase
      .from('cameras')
      .select('id, name')
      .order('name')
      .then(({ data }) => setCameras(data ?? []));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const onRefresh = () => {
    setRefreshing(true);
    load().then(() => setRefreshing(false));
  };

  const formatDuration = (sec: number | null) => {
    if (sec == null) return '-';
    if (sec < 60) return `${sec} sn`;
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    if (s) return `${m} dk ${s} sn`;
    return `${m} dk`;
  };

  return (
    <View style={styles.container}>
      <AdminCard style={styles.filters}>
        <Text style={styles.filterLabel}>Kamera</Text>
        <View style={styles.chipRow}>
          <TouchableOpacity
            style={[styles.chip, !filterCamera && styles.chipActive]}
            onPress={() => setFilterCamera(null)}
          >
            <Text style={[styles.chipText, !filterCamera && styles.chipTextActive]}>Tümü</Text>
          </TouchableOpacity>
          {cameras.map((c) => (
            <TouchableOpacity
              key={c.id}
              style={[styles.chip, filterCamera === c.id && styles.chipActive]}
              onPress={() => setFilterCamera(filterCamera === c.id ? null : c.id)}
            >
              <Text style={[styles.chipText, filterCamera === c.id && styles.chipTextActive]}>{c.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </AdminCard>

      <AdminCard style={styles.statsCard}>
        <Text style={styles.statsTitle}>Son 7 gün istatistikleri</Text>
        <View style={styles.statsRow}>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>{stats.totalViews}</Text>
            <Text style={styles.statLabel}>İzlenme</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statValue}>
              {Math.floor(stats.totalDuration / 60)} dk
            </Text>
            <Text style={styles.statLabel}>Toplam süre</Text>
          </View>
        </View>
      </AdminCard>

      <Text style={styles.listTitle}>Son loglar</Text>
      <FlatList
        data={logs}
        keyExtractor={(l) => l.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={adminTheme.colors.accent} />
        }
        renderItem={({ item }) => (
          <View style={styles.logItem}>
            <View style={styles.logHeader}>
              <Text style={styles.logTime}>
                {format(parseISO(item.created_at), 'HH:mm', { locale: tr })}
              </Text>
              <Text style={styles.logDate}>
                {format(parseISO(item.created_at), 'd MMM yyyy', { locale: tr })}
              </Text>
            </View>
            <View style={styles.logBody}>
              <Text style={styles.logStaff}>{item.staff_name ?? 'Bilinmeyen'}</Text>
              <Text style={styles.logCamera}>{item.camera_name ?? '-'}</Text>
              <Text style={styles.logAction}>
                {ACTION_LABELS[item.action] ?? item.action}
                {item.duration_seconds != null && item.action === 'izleme_bitirdi' && (
                  <> · {formatDuration(item.duration_seconds)}</>
                )}
              </Text>
              {item.ip_address ? (
                <Text style={styles.logIp}>📍 {item.ip_address}</Text>
              ) : null}
            </View>
          </View>
        )}
        ListEmptyComponent={
          <AdminCard>
            <Text style={styles.emptyText}>Henüz log kaydı yok.</Text>
          </AdminCard>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: adminTheme.colors.surfaceSecondary },
  filters: { margin: 16, marginBottom: 8 },
  filterLabel: { fontSize: 14, fontWeight: '600', color: adminTheme.colors.textSecondary, marginBottom: 8 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: adminTheme.colors.surfaceTertiary,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  chipActive: {
    backgroundColor: adminTheme.colors.primary,
    borderColor: adminTheme.colors.primary,
  },
  chipText: { fontSize: 13, fontWeight: '600', color: adminTheme.colors.text },
  chipTextActive: { color: '#fff' },
  statsCard: { marginHorizontal: 16, marginBottom: 16 },
  statsTitle: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text, marginBottom: 12 },
  statsRow: { flexDirection: 'row', gap: 24 },
  statItem: {},
  statValue: { fontSize: 20, fontWeight: '800', color: adminTheme.colors.primary },
  statLabel: { fontSize: 12, color: adminTheme.colors.textMuted, marginTop: 2 },
  listTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: adminTheme.colors.text,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  list: { padding: 16, paddingBottom: 48 },
  logItem: {
    backgroundColor: adminTheme.colors.surface,
    borderRadius: adminTheme.radius.md,
    padding: 14,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: adminTheme.colors.border,
  },
  logHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  logTime: { fontSize: 14, fontWeight: '700', color: adminTheme.colors.primary },
  logDate: { fontSize: 12, color: adminTheme.colors.textMuted },
  logBody: {},
  logStaff: { fontSize: 15, fontWeight: '700', color: adminTheme.colors.text },
  logCamera: { fontSize: 13, color: adminTheme.colors.textSecondary, marginTop: 2 },
  logAction: { fontSize: 13, color: adminTheme.colors.text, marginTop: 4 },
  logIp: { fontSize: 11, color: adminTheme.colors.textMuted, marginTop: 4 },
  emptyText: { fontSize: 15, color: adminTheme.colors.textSecondary, textAlign: 'center' },
});
