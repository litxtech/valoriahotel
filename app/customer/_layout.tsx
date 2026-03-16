import { Stack } from 'expo-router';
import { theme } from '@/constants/theme';

export default function CustomerLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: theme.colors.backgroundSecondary },
        animation: 'slide_from_right',
        fullScreenGestureEnabled: true,
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontSize: 17, fontWeight: '600' },
      }}
    >
      <Stack.Screen name="(tabs)" />
      <Stack.Screen
        name="staff/[id]"
        options={{
          headerShown: true,
          title: 'Çalışan',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="hotel/index"
        options={{
          headerShown: true,
          title: 'Otel',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="chat/[id]"
        options={{
          headerShown: true,
          title: 'Sohbet',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="new-chat"
        options={{
          headerShown: true,
          title: 'Yeni Sohbet',
          headerBackTitle: 'Geri',
        }}
      />
    </Stack>
  );
}
