import { Stack } from 'expo-router';
import { theme } from '@/constants/theme';

export default function StaffSalesLayout() {
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.colors.surface },
        headerShadowVisible: false,
        headerTitleStyle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
        headerTintColor: theme.colors.primary,
        contentStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Satış & Komisyon' }} />
      <Stack.Screen name="new" options={{ title: 'Yeni satış kaydı' }} />
      <Stack.Screen name="[id]" options={{ title: 'Satış detayı' }} />
    </Stack>
  );
}

