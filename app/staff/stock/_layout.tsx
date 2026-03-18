import { Stack } from 'expo-router';

export default function StaffStockLayout() {
  return (
    <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#fff' }, headerTintColor: '#1a1d21' }}>
      <Stack.Screen name="index" options={{ title: 'Stok Listesi' }} />
      <Stack.Screen name="entry" options={{ title: 'Stok Girişi' }} />
      <Stack.Screen name="exit" options={{ title: 'Stok Çıkışı' }} />
      <Stack.Screen name="scan" options={{ title: 'Barkod Okut', headerShown: false }} />
      <Stack.Screen name="product/[id]" options={{ title: 'Ürün Detayı' }} />
      <Stack.Screen name="all" options={{ title: 'Tüm Stoklarım' }} />
    </Stack>
  );
}
