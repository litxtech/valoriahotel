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
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

const CARD_GAP = 10;
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = (SCREEN_WIDTH - 16 * 2 - CARD_GAP) / 2;

function formatShortDateTime(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const h = d.getHours().toString().padStart(2, '0');
  const min = d.getMinutes().toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()} ${h}:${min}`;
}

type Product = {
  id: string;
  name: string;
  unit: string | null;
  current_stock: number | null;
  min_stock: number | null;
  image_url: string | null;
  created_at: string;
  category: { name: string } | null;
};

type MovementRow = {
  id: string;
  product_id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  created_at: string;
  status: string;
  staff: { full_name: string | null } | null;
};

type StockFilter = 'all' | 'in_stock' | 'critical' | 'empty';

export default function StaffAllStocksScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    const [prodRes, movRes] = await Promise.all([
      supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock, image_url, created_at, category:stock_categories(name)')
        .order('name'),
      supabase
        .from('stock_movements')
        .select('id, product_id, movement_type, quantity, created_at, status, staff:staff_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(300),
    ]);
    setProducts((prodRes.data ?? []) as Product[]);
    setMovements((movRes.data ?? []) as MovementRow[]);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

  /** product_id -> en son hareket */
  const lastMovementByProductId = useMemo(() => {
    const map: Record<string, MovementRow> = {};
    for (const m of movements) {
      if (!m.product_id || m.product_id in map) continue;
      map[m.product_id] = m;
    }
    return map;
  }, [movements]);

  const filtered = useMemo(() => {
    let list = products;
    if (nameSearch.trim()) {
      const q = nameSearch.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    switch (stockFilter) {
      case 'in_stock':
        list = list.filter((p) => (p.current_stock ?? 0) > 0);
        break;
      case 'critical': {
        list = list.filter((p) => {
          const min = p.min_stock ?? 0;
          const cur = p.current_stock ?? 0;
          return min > 0 && cur <= min;
        });
        break;
      }
      case 'empty':
        list = list.filter((p) => (p.current_stock ?? 0) <= 0);
        break;
      default:
        break;
    }
    return list;
  }, [products, nameSearch, stockFilter]);

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
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={theme.colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder="İsme göre ara..."
            placeholderTextColor={theme.colors.textMuted}
            value={nameSearch}
            onChangeText={setNameSearch}
          />
        </View>
      </View>
      <View style={styles.filterRow}>
        <Text style={styles.filterLabel}>Stoğa göre:</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChips}>
          {[
            { value: 'all' as StockFilter, label: 'Tümü' },
            { value: 'in_stock' as StockFilter, label: 'Stokta var' },
            { value: 'critical' as StockFilter, label: 'Kritik' },
            { value: 'empty' as StockFilter, label: 'Stoksuz' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.value}
              style={[styles.chip, stockFilter === opt.value && styles.chipActive]}
              onPress={() => setStockFilter(opt.value)}
              activeOpacity={0.8}
            >
              <Text style={[styles.chipText, stockFilter === opt.value && styles.chipTextActive]}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={theme.colors.primary} />}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.sectionTitle}>📦 Tüm stoklar ({filtered.length})</Text>
        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>Ürün bulunamadı veya filtreye uygun kayıt yok.</Text>
        ) : (
          <View style={styles.grid}>
            {filtered.map((p) => {
              const cur = p.current_stock ?? 0;
              const min = p.min_stock ?? 0;
              const isLow = min > 0 && cur <= min;
              const lastMov = lastMovementByProductId[p.id];
              const previewUrl = p.image_url ?? null;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.card, isLow && styles.cardCritical]}
                  onPress={() => router.push(`/staff/stock/product/${p.id}`)}
                  activeOpacity={0.85}
                >
                  <View style={styles.cardImageWrap}>
                    {previewUrl ? (
                      <CachedImage uri={previewUrl} style={styles.cardImage} contentFit="cover" />
                    ) : (
                      <View style={styles.cardImagePlaceholder}>
                        <Ionicons name="cube-outline" size={28} color={theme.colors.textMuted} />
                      </View>
                    )}
                  </View>
                  <Text style={styles.cardName} numberOfLines={2}>{p.name}</Text>
                  <Text style={[styles.cardStock, isLow && styles.cardStockCritical]}>
                    Stok: {cur} {p.unit ?? 'adet'}{isLow ? ' ⚠️' : ''}
                  </Text>
                  {lastMov ? (
                    <View style={styles.lastMovWrap}>
                      <Text style={styles.lastMovLabel}>Son işlem:</Text>
                      <Text style={styles.lastMovText}>
                        {lastMov.movement_type === 'in' ? '📥' : '📤'} {lastMov.movement_type === 'in' ? '+' : '-'}{lastMov.quantity} · {formatShortDateTime(lastMov.created_at)}
                      </Text>
                      {lastMov.staff && (lastMov.staff as { full_name?: string }).full_name ? (
                        <Text style={styles.lastMovStaff}>👤 {(lastMov.staff as { full_name: string }).full_name}</Text>
                      ) : null}
                    </View>
                  ) : (
                    <Text style={styles.lastMovNone}>— Son işlem yok</Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 12, fontSize: 15, color: theme.colors.textSecondary },
  searchRow: { paddingHorizontal: 16, paddingVertical: 10, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },
  filterRow: { paddingVertical: 10, paddingLeft: 16, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight },
  filterLabel: { fontSize: 13, fontWeight: '600', color: theme.colors.textSecondary, marginBottom: 8 },
  filterChips: { flexDirection: 'row', gap: 8, paddingRight: 16 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: theme.radius.full, backgroundColor: theme.colors.borderLight },
  chipActive: { backgroundColor: theme.colors.primary },
  chipText: { fontSize: 13, fontWeight: '600', color: theme.colors.text },
  chipTextActive: { color: '#fff' },
  scroll: { flex: 1 },
  scrollContent: { padding: 16, paddingBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 12 },
  emptyText: { fontSize: 14, color: theme.colors.textMuted, fontStyle: 'italic' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: CARD_GAP },
  card: {
    width: CARD_WIDTH,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  cardCritical: { borderLeftWidth: 4, borderLeftColor: theme.colors.error },
  cardImageWrap: { width: '100%', aspectRatio: 1, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.borderLight },
  cardImage: { width: '100%', height: '100%' },
  cardImagePlaceholder: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 13, fontWeight: '700', color: theme.colors.text, marginTop: 8, minHeight: 36 },
  cardStock: { fontSize: 12, color: theme.colors.textMuted, marginTop: 4 },
  cardStockCritical: { color: theme.colors.error, fontWeight: '600' },
  lastMovWrap: { marginTop: 8, paddingTop: 6, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.borderLight },
  lastMovLabel: { fontSize: 10, fontWeight: '600', color: theme.colors.textMuted },
  lastMovText: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  lastMovStaff: { fontSize: 10, color: theme.colors.textMuted, marginTop: 2 },
  lastMovNone: { fontSize: 11, color: theme.colors.textMuted, marginTop: 8, fontStyle: 'italic' },
});
