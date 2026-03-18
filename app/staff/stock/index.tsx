import { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  TextInput,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Modal,
  Pressable,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

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
  created_by: string | null;
  category: { name: string } | null;
  creator: { full_name: string | null } | null;
};

type MovementRow = {
  id: string;
  movement_type: 'in' | 'out';
  quantity: number;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  product: { name: string } | null;
  staff: { full_name: string | null } | null;
};

export default function StaffStockListScreen() {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [recent, setRecent] = useState<MovementRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [productModalProduct, setProductModalProduct] = useState<Product | null>(null);
  const [recentModalVisible, setRecentModalVisible] = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from('stock_products')
      .select('id, name, unit, current_stock, min_stock, image_url, created_at, created_by, category:stock_categories(name), creator:created_by(full_name)')
      .order('name');
    setProducts((data ?? []) as Product[]);
  };

  const loadRecent = async () => {
    setLoadingRecent(true);
    const { data } = await supabase
      .from('stock_movements')
      .select('id, movement_type, quantity, created_at, status, product:stock_products(name), staff:staff_id(full_name)')
      .order('created_at', { ascending: false })
      .limit(15);
    setRecent((data ?? []) as MovementRow[]);
    setLoadingRecent(false);
  };

  useEffect(() => {
    load();
    loadRecent();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([load(), loadRecent()]);
    setRefreshing(false);
  };

  const filtered = products.filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  const openRecentModal = () => {
    setRecentModalVisible(true);
    loadRecent();
  };

  return (
    <View style={styles.container}>
      <View style={styles.topActions}>
        <TouchableOpacity style={styles.smallBtn} onPress={() => router.push('/staff/stock/scan')} activeOpacity={0.8}>
          <Ionicons name="barcode-outline" size={18} color="#fff" />
          <Text style={styles.smallBtnText}>Barkod</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallBtn} onPress={() => router.push('/staff/stock/entry')} activeOpacity={0.8}>
          <Ionicons name="download-outline" size={18} color="#fff" />
          <Text style={styles.smallBtnText}>Stok Girişi</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.smallBtn} onPress={() => router.push('/staff/stock/exit')} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={18} color="#fff" />
          <Text style={styles.smallBtnText}>Stok Çıkışı</Text>
        </TouchableOpacity>
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

      <ScrollView
        style={styles.list}
        contentContainerStyle={styles.listContent}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 TÜM ÜRÜNLER ({filtered.length})</Text>
          {filtered.length === 0 && (
            <Text style={styles.emptyText}>Ürün yok veya arama sonucu yok.</Text>
          )}
          {filtered.map((p) => {
            const cur = p.current_stock ?? 0;
            const min = p.min_stock ?? 0;
            const isLow = min > 0 && cur <= min;
            const addedBy = p.creator?.full_name ?? '—';
            const addedAt = p.created_at ? formatShortDateTime(p.created_at) : '—';
            return (
              <TouchableOpacity
                key={p.id}
                style={[styles.productCard, isLow && styles.productCardLow]}
                onPress={() => setProductModalProduct(p)}
                activeOpacity={0.85}
              >
                <Text style={styles.cardName}>{p.name}</Text>
                <Text style={styles.cardStock}>Stok: {cur} {p.unit ?? 'adet'}{isLow ? '  ⚠️ Kritik' : ''}</Text>
                <View style={styles.cardImageWrap}>
                  <CachedImage
                    uri={p.image_url || 'https://via.placeholder.com/400x200'}
                    style={styles.cardImage}
                    contentFit="cover"
                  />
                </View>
                <Text style={styles.cardMeta}>📦 Ekleyen: {addedBy}</Text>
                <Text style={styles.cardMeta}>📅 {addedAt}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity style={styles.sonIslemlerBtn} onPress={openRecentModal} activeOpacity={0.8}>
          <Ionicons name="time-outline" size={22} color={theme.colors.primary} />
          <Text style={styles.sonIslemlerBtnText}>Son İşlemler</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Ürün aksiyon modalı: boşluğa tıklayınca kapanır, büyük resim yok */}
      <Modal
        visible={!!productModalProduct}
        transparent
        animationType="fade"
        onRequestClose={() => setProductModalProduct(null)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setProductModalProduct(null)}>
          <Pressable style={styles.productModalBox} onPress={(e) => e.stopPropagation()}>
            {productModalProduct && (
              <>
                <Text style={styles.productModalTitle} numberOfLines={2}>{productModalProduct.name}</Text>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => { setProductModalProduct(null); router.push(`/staff/stock/product/${productModalProduct.id}`); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnText}>🔍 Detay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.productModalBtn, styles.productModalBtnPrimary]}
                  onPress={() => { setProductModalProduct(null); router.push({ pathname: '/staff/stock/entry', params: { productId: productModalProduct.id } }); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnTextWhite}>📥 Stok Girişi</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.productModalBtn}
                  onPress={() => { setProductModalProduct(null); router.push({ pathname: '/staff/stock/exit', params: { productId: productModalProduct.id } }); }}
                  activeOpacity={0.8}
                >
                  <Text style={styles.productModalBtnText}>📤 Stok Çıkışı</Text>
                </TouchableOpacity>
              </>
            )}
          </Pressable>
        </Pressable>
      </Modal>

      {/* Son işlemler modalı */}
      <Modal
        visible={recentModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setRecentModalVisible(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setRecentModalVisible(false)}>
          <Pressable style={styles.recentModalBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.recentModalTitle}>⚡ Son işlemler</Text>
            {loadingRecent ? (
              <ActivityIndicator size="small" color={theme.colors.primary} style={{ marginVertical: 20 }} />
            ) : recent.length === 0 ? (
              <Text style={styles.emptyText}>Henüz işlem yok.</Text>
            ) : (
              <ScrollView style={styles.recentModalScroll} showsVerticalScrollIndicator={false}>
                {recent.map((m) => {
                  const name = (m.product as { name?: string } | null)?.name ?? '—';
                  const staffName = (m.staff as { full_name?: string } | null)?.full_name ?? '—';
                  const typeLabel = m.movement_type === 'in' ? 'Giriş' : 'Çıkış';
                  const time = new Date(m.created_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
                  const statusLabel = m.status === 'pending' ? 'Onay bekliyor' : (m.status === 'approved' ? 'Onaylandı' : 'Reddedildi');
                  return (
                    <View key={m.id} style={styles.recentRow}>
                      <Text style={styles.recentText}>{typeLabel} · {name} ({m.quantity})</Text>
                      <Text style={styles.recentMeta}>{time} · {statusLabel}</Text>
                      <Text style={styles.recentStaff}>👤 {staffName}</Text>
                    </View>
                  );
                })}
              </ScrollView>
            )}
            <TouchableOpacity style={styles.recentModalClose} onPress={() => setRecentModalVisible(false)} activeOpacity={0.8}>
              <Text style={styles.recentModalCloseText}>Kapat</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  topActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10,
    gap: 8,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderLight,
  },
  smallBtn: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: theme.colors.primary,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  smallBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  sonIslemlerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 16,
    marginTop: 8,
    marginBottom: 24,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  sonIslemlerBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.primary },
  searchWrap: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: theme.colors.surface, borderBottomWidth: 1, borderBottomColor: theme.colors.borderLight, flexDirection: 'row', alignItems: 'center', gap: 10 },
  search: { flex: 1, backgroundColor: theme.colors.backgroundSecondary, borderRadius: theme.radius.md, paddingVertical: 10, paddingHorizontal: 12, fontSize: 15, color: theme.colors.text },
  list: { flex: 1 },
  listContent: { padding: 16, paddingBottom: 24 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: theme.colors.text, marginBottom: 10 },
  productCard: {
    backgroundColor: theme.colors.surface,
    padding: 14,
    borderRadius: theme.radius.lg,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  productCardLow: { borderLeftWidth: 4, borderLeftColor: theme.colors.error },
  cardName: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  cardStock: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  cardImageWrap: { width: '100%', aspectRatio: 2, borderRadius: theme.radius.md, overflow: 'hidden', backgroundColor: theme.colors.borderLight, marginVertical: 10 },
  cardImage: { width: '100%', height: '100%' },
  cardMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  emptyText: { fontSize: 13, color: theme.colors.textMuted, fontStyle: 'italic' },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  productModalBox: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
    gap: 12,
  },
  productModalTitle: { fontSize: 18, fontWeight: '700', color: theme.colors.text, marginBottom: 8 },
  productModalBtn: {
    paddingVertical: 14,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
  },
  productModalBtnPrimary: { backgroundColor: theme.colors.primary, borderColor: theme.colors.primary },
  productModalBtnText: { fontSize: 15, fontWeight: '700', color: theme.colors.text },
  productModalBtnTextWhite: { fontSize: 15, fontWeight: '700', color: '#fff' },
  recentModalBox: {
    width: '100%',
    maxWidth: 360,
    maxHeight: '80%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    padding: 20,
  },
  recentModalTitle: { fontSize: 18, fontWeight: '800', color: theme.colors.text, marginBottom: 16 },
  recentModalScroll: { maxHeight: 400 },
  recentRow: { padding: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: theme.colors.borderLight },
  recentText: { fontSize: 14, fontWeight: '700', color: theme.colors.text },
  recentMeta: { fontSize: 12, color: theme.colors.textMuted, marginTop: 2 },
  recentStaff: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  recentModalClose: {
    marginTop: 16,
    paddingVertical: 14,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radius.md,
    alignItems: 'center',
  },
  recentModalCloseText: { color: '#fff', fontWeight: '800', fontSize: 15 },
});
