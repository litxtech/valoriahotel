import { useRouter } from 'expo-router';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { BarcodeScannerView } from '@/components/BarcodeScannerView';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';

export default function AdminStockScanScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();

  const handleScan = async ({ type, data }: { type: string; data: string }) => {
    const barcode = String(data).trim();
    if (!barcode) return;

    const { data: product, error } = await supabase
      .from('stock_products')
      .select('id, name, unit, current_stock, barcode')
      .eq('barcode', barcode)
      .maybeSingle();

    if (error) {
      Alert.alert('Hata', error.message);
      return;
    }

    let productId = product?.id;
    let productName = product?.name ?? null;
    const wasFoundInDb = !!product;

    if (!product) {
      if (!staff?.organization_id) {
        Alert.alert('Hata', 'İşletme bilgisi eksik. Profilinizden işletme atanmış olmalı.');
        return;
      }
      // Barkoda kayıtlı ürün yok: hemen yeni ürün oluştur (barkod eklensin)
      const newName = `Ürün - ${barcode}`;
      const { data: newProduct, error: insertErr } = await supabase
        .from('stock_products')
        .insert({
          name: newName,
          barcode,
          unit: 'adet',
          current_stock: 0,
          organization_id: staff.organization_id,
        })
        .select('id, name')
        .single();

      if (insertErr) {
        if (insertErr.code === '23505') {
          const { data: existing } = await supabase
            .from('stock_products')
            .select('id, name')
            .eq('barcode', barcode)
            .maybeSingle();
          productId = existing?.id ?? null;
          productName = existing?.name ?? newName;
        }
        if (!productId) {
          Alert.alert('Hata', insertErr.message);
          return;
        }
      } else {
        productId = newProduct?.id ?? null;
        productName = newProduct?.name ?? newName;
      }
    }

    try {
      await supabase.from('barcode_scan_history').insert({
        barcode,
        barcode_type: type,
        product_id: productId ?? undefined,
        scanned_by: staff?.id ?? null,
        scan_result: wasFoundInDb ? 'found' : 'not_found',
      });
    } catch (_) {}

    if (productId) {
      const displayName = productName ?? `Barkod: ${barcode}`;
      if (wasFoundInDb) {
        Alert.alert(
          'Ürün bulundu',
          `${displayName}\n\nStok girişi ekranına yönlendiriliyorsunuz.`,
          [{ text: 'Tamam', onPress: () => router.replace({ pathname: '/admin/stock/movement', params: { productId, type: 'in' } }) }]
        );
      } else {
        Alert.alert(
          'Yeni ürün oluşturuldu',
          `${displayName}\n\nStok girişi ekranına yönlendiriliyorsunuz.`,
          [{ text: 'Tamam', onPress: () => router.replace({ pathname: '/admin/stock/movement', params: { productId, type: 'in' } }) }]
        );
      }
    }
  };

  return (
    <View style={styles.container}>
      <BarcodeScannerView
        title="Stok Girişi – Barkod Okut"
        hint="Barkodu çerçeve içine getirin"
        onScan={handleScan}
        onClose={() => router.back()}
        showCloseButton
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
});
