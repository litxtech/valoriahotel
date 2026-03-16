import { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';

export default function AdminLayout() {
  const router = useRouter();
  const segments = useSegments();
  const { staff, loading, loadSession } = useAuthStore();

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (loading) return;
    const onLogin = segments[1] === 'login';
    if (!staff && !onLogin) router.replace('/admin/login');
  }, [loading, staff, segments]);

  return (
    <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#1a365d' }, headerTintColor: '#fff' }}>
      <Stack.Screen name="login" options={{ headerShown: false }} />
      <Stack.Screen name="index" options={{ title: 'Panel' }} />
      <Stack.Screen name="rooms/index" options={{ title: 'Odalar' }} />
      <Stack.Screen name="rooms/[id]" options={{ title: 'Oda Detay' }} />
      <Stack.Screen name="guests/index" options={{ title: 'Misafirler' }} />
      <Stack.Screen name="guests/[id]" options={{ title: 'Misafir Detay' }} />
      <Stack.Screen name="checkin" options={{ title: 'Check-in' }} />
      <Stack.Screen name="contracts/index" options={{ title: 'Sözleşmeler' }} />
    </Stack>
  );
}
