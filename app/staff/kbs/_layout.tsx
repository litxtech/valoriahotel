import { Stack } from 'expo-router';

export default function KbsLayout() {
  return (
    <Stack screenOptions={{ headerShown: true }}>
      <Stack.Screen name="index" options={{ title: 'KBS Operasyon' }} />
      <Stack.Screen name="scan" options={{ title: 'Seri Pasaport/ID Tarama' }} />
      <Stack.Screen name="ready" options={{ title: 'Bildirime Hazır' }} />
      <Stack.Screen name="submitted" options={{ title: 'Bildirilen Pasaportlar' }} />
      <Stack.Screen name="rooms" options={{ title: 'Canlı Oda Görünümü' }} />
      <Stack.Screen name="failed" options={{ title: 'Hatalar & Retry' }} />
    </Stack>
  );
}

