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
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';
import {
  buildStockListHtml,
  shareStockListPdf,
  formatShortDateTime as formatShortDateTimeForPdf,
  type StockListPdfRow,
} from '@/lib/stockListPdf';

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
  photo_proof: string | null;
  staff: { full_name: string | null } | null;
};

type StockFilter = 'all' | 'in_stock' | 'critical' | 'empty';

const FILTER_LABELS: Record<StockFilter, string> = {
  all: 'Tümü',
  in_stock: 'Stokta var',
  critical: 'Kritik (≤3)',
  empty: 'Stoksuz',
};

type Props = {
  /** Ürün kartına tıklanınca açılacak ürün detay path öneki, örn. /admin/stock/product veya /staff/stock/product */
  productPathPrefix: string;
};

export function AllStocksOverview({ productPathPrefix }: Props) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [nameSearch, setNameSearch] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastPhotoByProductId, setLastPhotoByProductId] = useState<Record<string, string>>({});
  const [pdfExporting, setPdfExporting] = useState(false);

  const load = async () => {
    const [prodRes, movRes, photoRes] = await Promise.all([
      supabase
        .from('stock_products')
        .select('id, name, unit, current_stock, min_stock, image_url, created_at, category:stock_categories(name)')
        .order('name'),
      supabase
        .from('stock_movements')
        .select('id, product_id, movement_type, quantity, created_at, status, photo_proof, staff:staff_id(full_name)')
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('stock_movements')
        .select('product_id, photo_proof')
        .not('photo_proof', 'is', null)
        .order('created_at', { ascending: false }),
    ]);
    setProducts((prodRes.data ?? []) as Product[]);
    setMovements((movRes.data ?? []) as MovementRow[]);
    const byProduct: Record<string, string> = {};
    for (const m of photoRes.data ?? []) {
      const pid = (m as { product_id: string }).product_id;
      const url = (m as { photo_proof: string }).photo_proof;
      if (pid && url && !(pid in byProduct)) byProduct[pid] = url;
    }
    setLastPhotoByProductId(byProduct);
    setLoading(false);
    setRefreshing(false);
  };

  useEffect(() => {
    load();
  }, []);

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
        list = list.filter((p) => (p.current_stock ?? 0) <= 3);
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

  const productHref = (id: string) => `${productPathPrefix}/${id}`;

  const exportPdf = async () => {
    const list = [...filtered].sort((a, b) => a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' }));
    if (list.length === 0) {
      Alert.alert('Liste boş', 'PDF oluşturmak için en az bir ürün görünmeli; filtreyi veya aramayı gevşetin.');
      return;
    }
    setPdfExporting(true);
    try {
      const rows: StockListPdfRow[] = list.map((p) => {
        const cur = p.current_stock ?? 0;
        const isLow = cur <= 3;
        const lastMov = lastMovementByProductId[p.id];
        let lastMovementLine: string | null = null;
        if (lastMov) {
          const t = lastMov.movement_type === 'in' ? 'Giriş' : 'Çıkış';
          const sign = lastMov.movement_type === 'in' ? '+' : '-';
          const staffName = (lastMov.staff as { full_name?: string } | null)?.full_name?.trim();
          lastMovementLine = `${t} ${sign}${lastMov.quantity} · ${formatShortDateTimeForPdf(lastMov.created_at)}${staffName ? ` · ${staffName}` : ''}`;
        }
        const catObj = Array.isArray(p.category) ? p.category[0] : p.category;
        const categoryName = catObj && typeof catObj === 'object' && 'name' in catObj ? String((catObj as { name: string }).name) : null;
        return {
          name: p.name,
          category: categoryName,
          unit: p.unit,
          current_stock: cur,
          min_stock: p.min_stock,
          lastMovementLine,
          critical: isLow,
        };
      });
      const generatedAtLabel = new Date().toLocaleString('tr-TR');
      const searchHint = nameSearch.trim() ? `"${nameSearch.trim()}"` : 'Yok';
      const html = buildStockListHtml(rows, {
        filterLabel: FILTER_LABELS[stockFilter],
        searchHint,
        generatedAtLabel,
      });
      await shareStockListPdf(html);
    } catch (e) {
      Alert.alert('Hata', (e as Error)?.message ?? 'PDF oluşturulamadı.');
    } finally {
      setPdfExporting(false);
    }
  };

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
        <TouchableOpacity
          style={[styles.pdfBtn, pdfExporting && styles.pdfBtnDisabled]}
          onPress={exportPdf}
          disabled={pdfExporting}
          activeOpacity={0.85}
        >
          {pdfExporting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <>
              <Ionicons name="document-text-outline" size={20} color="#fff" />
              <Text style={styles.pdfBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
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
              const isLow = cur <= 3;
              const lastMov = lastMovementByProductId[p.id];
              const previewUrl = p.image_url ?? lastPhotoByProductId[p.id] ?? null;
              return (
                <TouchableOpacity
                  key={p.id}
                  style={[styles.card, isLow && styles.cardCritical]}
                  onPress={() => router.push(productHref(p.id) as any)}
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
                        {lastMov.movement_type === 'in' ? '📥' : '📤'} {lastMov.movement_type === 'in' ? '+' : '-'}{lastMov.quantity} · {formatShortDateTimeForPdf(lastMov.created_at)}
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: theme.colors.text },
  pdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.colors.primary,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    minWidth: 88,
    justifyContent: 'center',
  },
  pdfBtnDisabled: { opacity: 0.7 },
  pdfBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
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
