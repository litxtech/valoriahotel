import { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Dimensions,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import { ImagePreviewModal } from '@/components/ImagePreviewModal';

const CARD_GAP = 12;
const { width: SCREEN_WIDTH } = Dimensions.get('window');

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()} ${h}:${min}`;
}

type MovementRow = {
  id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  notes: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  photo_proof: string | null;
  product: { id: string; name: string; unit: string | null } | null;
};

type FilterType = 'all' | 'in' | 'out';

export default function StaffMyMovementsScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterType>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    if (!staff?.id) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, notes, created_at, status, photo_proof, product:stock_products(id, name, unit)')
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(200);
    if (error) {
      setMovements([]);
    } else {
      setMovements((data ?? []) as MovementRow[]);
    }
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, [staff?.id]);

  const onRefresh = () => {
    setRefreshing(true);
    load();
  };

  const handleDeleteMovement = (m: MovementRow) => {
    if (m.status === 'approved') {
      Alert.alert('Silinemez', 'Onaylanmış hareket silinemez. Stoğa işlenmiş kayıtları admin panelinden yönetin.');
      return;
    }
    const typeLabel = m.movement_type === 'in' ? 'giriş' : 'çıkış';
    const productName = (m.product as { name?: string })?.name ?? 'ürün';
    Alert.alert(
      'Hareketi sil',
      `"${productName}" ${typeLabel} hareketini silmek istediğinize emin misiniz?`,
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingId(m.id);
            try {
              const { error } = await supabase.from('stock_movements').delete().eq('id', m.id);
              if (error) throw error;
              setMovements((prev) => prev.filter((x) => x.id !== m.id));
            } catch (e) {
              Alert.alert('Hata', (e as Error)?.message ?? 'Silinemedi.');
            } finally {
              setDeletingId(null);
            }
          },
        },
      ]
    );
  };

  const filtered = useMemo(() => {
    let list = movements;
    if (filter === 'in') list = list.filter((m) => m.movement_type === 'in');
    else if (filter === 'out') list = list.filter((m) => m.movement_type === 'out');
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((m) => (m.product as { name?: string })?.name?.toLowerCase().includes(q));
    }
    return list;
  }, [movements, filter, search]);

  const stats = useMemo(() => {
    const inCount = movements.filter((m) => m.movement_type === 'in').length;
    const outCount = movements.filter((m) => m.movement_type === 'out').length;
    const inQty = movements.filter((m) => m.movement_type === 'in').reduce((s, m) => s + m.quantity, 0);
    const outQty = movements.filter((m) => m.movement_type === 'out').reduce((s, m) => s + m.quantity, 0);
    return { inCount, outCount, inQty, outQty };
  }, [movements]);

  const getStatusLabel = (s: string) => {
    if (s === 'pending') return 'Onay bekliyor';
    if (s === 'approved') return 'Onaylandı';
    return 'Reddedildi';
  };

  const getStatusColor = (s: string) => {
    if (s === 'approved') return theme.colors.success;
    if (s === 'rejected') return theme.colors.error;
    return '#eab308';
  };

  if (!staff?.id) {
    return (
      <View style={styles.centered}>
        <Text style={styles.emptyText}>Oturum gerekli.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Yükleniyor...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.statsRow}>
        <View style={[styles.statCard, styles.statCardIn]}>
          <Ionicons name="arrow-down-circle" size={28} color={theme.colors.success} />
          <View style={styles.statTextWrap}>
            <Text style={styles.statValue}>+{stats.inQty}</Text>
            <Text style={styles.statLabel}>Eklenen ({stats.inCount})</Text>
          </View>
        </View>
        <View style={[styles.statCard, styles.statCardOut]}>
          <Ionicons name="arrow-up-circle" size={28} color={theme.colors.error} />
          <View style={styles.statTextWrap}>
            <Text style={styles.statValue}>-{stats.outQty}</Text>
            <Text style={styles.statLabel}>Çıkarılan ({stats.outCount})</Text>
          </View>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Ionicons name="search" size={18} color={theme.colors.textMuted} />
        <TextInput
          style={styles.search}
          placeholder="Ürün ara..."
          placeholderTextColor={theme.colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 ? (
          <TouchableOpacity onPress={() => setSearch('')} hitSlop={12}>
            <Ionicons name="close-circle" size={18} color={theme.colors.textMuted} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.filterRow}>
        {[
          { value: 'all' as FilterType, label: 'Tümü', icon: 'list' as const },
          { value: 'in' as FilterType, label: 'Eklediğim', icon: 'download' as const },
          { value: 'out' as FilterType, label: 'Çıkardığım', icon: 'log-out' as const },
        ].map((opt) => (
          <TouchableOpacity
            key={opt.value}
            style={[styles.filterChip, filter === opt.value && styles.filterChipActive]}
            onPress={() => setFilter(opt.value)}
            activeOpacity={0.8}
          >
            <Ionicons
              name={`${opt.icon}-outline`}
              size={16}
              color={filter === opt.value ? '#fff' : theme.colors.textSecondary}
            />
            <Text style={[styles.filterChipText, filter === opt.value && styles.filterChipTextActive]}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>📋 Hareketlerim ({filtered.length})</Text>

        {filtered.length === 0 ? (
          <View style={styles.emptyCard}>
            <Ionicons name="cube-outline" size={48} color={theme.colors.textMuted} />
            <Text style={styles.emptyText}>
              {movements.length === 0
                ? 'Henüz stok girişi veya çıkışı yapmadınız.'
                : 'Arama veya filtreye uygun hareket yok.'}
            </Text>
            {movements.length === 0 && (
              <TouchableOpacity
                style={styles.emptyBtn}
                onPress={() => router.push('/staff/stock/entry')}
                activeOpacity={0.8}
              >
                <Text style={styles.emptyBtnText}>Stok Girişi Yap</Text>
              </TouchableOpacity>
            )}
          </View>
        ) : (
          filtered.map((m) => {
            const productName = (m.product as { name?: string })?.name ?? '—';
            const unit = (m.product as { unit?: string })?.unit ?? 'adet';
            const isIn = m.movement_type === 'in';
            return (
              <View key={m.id} style={[styles.card, isIn ? styles.cardIn : styles.cardOut]}>
                <View style={styles.cardMain}>
                  <View style={styles.cardContent}>
                    <View style={styles.cardHeader}>
                      <View style={[styles.typeBadge, isIn ? styles.typeBadgeIn : styles.typeBadgeOut]}>
                        <Ionicons name={isIn ? 'download' : 'log-out'} size={14} color="#fff" />
                        <Text style={styles.typeBadgeText}>
                          {isIn ? `+${m.quantity}` : `-${m.quantity}`} {unit}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: getStatusColor(m.status) + '22' }]}>
                        <Text style={[styles.statusText, { color: getStatusColor(m.status) }]}>
                          {getStatusLabel(m.status)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.productName} numberOfLines={2}>
                      {productName}
                    </Text>
                    <Text style={styles.dateText}>{formatShortDateTime(m.created_at)}</Text>
                    {m.notes ? (
                      <Text style={styles.notesText} numberOfLines={2}>
                        {m.notes}
                      </Text>
                    ) : null}
                  </View>
                  <View style={styles.photoWrap}>
                    {m.photo_proof ? (
                      <TouchableOpacity
                        style={styles.photoTouch}
                        onPress={() => setPreviewUri(m.photo_proof)}
                        activeOpacity={0.9}
                      >
                        <CachedImage uri={m.photo_proof} style={styles.photo} contentFit="cover" />
                      </TouchableOpacity>
                    ) : (
                      <View style={styles.photoPlaceholder}>
                        <Ionicons name="image-outline" size={28} color={theme.colors.textMuted} />
                      </View>
                    )}
                  </View>
                </View>
                <View style={styles.cardActions}>
                  {(m.product as { id?: string })?.id && (
                    <TouchableOpacity
                      style={styles.detailBtn}
                      onPress={() => router.push(`/staff/stock/product/${(m.product as { id: string }).id}`)}
                      activeOpacity={0.7}
                    >
                      <Ionicons name="open-outline" size={16} color={theme.colors.primary} />
                      <Text style={styles.detailBtnText}>Ürün detayı</Text>
                    </TouchableOpacity>
                  )}
                  {m.status !== 'approved' && (
                    <TouchableOpacity
                      style={styles.deleteBtn}
                      onPress={() => handleDeleteMovement(m)}
                      disabled={deletingId === m.id}
                      activeOpacity={0.7}
                    >
                      {deletingId === m.id ? (
                        <ActivityIndicator size="small" color={theme.colors.error} />
                      ) : (
                        <>
                          <Ionicons name="trash-outline" size={16} color={theme.colors.error} />
                          <Text style={styles.deleteBtnText}>Sil</Text>
                        </>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })
        )}
      </ScrollView>

      <ImagePreviewModal visible={!!previewUri} uri={previewUri} onClose={() => setPreviewUri(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, color: theme.colors.textSecondary },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  statCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
  },
  statCardIn: { borderColor: theme.colors.success + '44', backgroundColor: theme.colors.success + '0c' },
  statCardOut: { borderColor: theme.colors.error + '44', backgroundColor: theme.colors.error + '0c' },
  statTextWrap: {},
  statValue: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
  statLabel: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  search: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    color: theme.colors.text,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    padding: 16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.full,
    backgroundColor: theme.colors.borderLight,
  },
  filterChipActive: { backgroundColor: theme.colors.primary },
  filterChipText: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary },
  filterChipTextActive: { color: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 100 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 14 },
  emptyCard: {
    alignItems: 'center',
    padding: 32,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, textAlign: 'center', marginTop: 12 },
  emptyBtn: {
    marginTop: 16,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
  },
  emptyBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderLeftWidth: 4,
  },
  cardIn: { borderColor: theme.colors.borderLight, borderLeftColor: theme.colors.success },
  cardOut: { borderColor: theme.colors.borderLight, borderLeftColor: theme.colors.error },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  cardContent: { flex: 1, minWidth: 0 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  typeBadgeIn: { backgroundColor: theme.colors.success },
  typeBadgeOut: { backgroundColor: theme.colors.error },
  typeBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: theme.radius.sm,
  },
  statusText: { fontSize: 11, fontWeight: '700' },
  productName: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  dateText: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  notesText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6, fontStyle: 'italic' },
  photoWrap: { width: 80, height: 80, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.borderLight },
  photoTouch: { width: '100%', height: '100%' },
  photo: { width: '100%', height: '100%' },
  photoPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: theme.colors.borderLight,
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.primary },
  deleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  deleteBtnText: { fontSize: 13, fontWeight: '600', color: theme.colors.error },
});
