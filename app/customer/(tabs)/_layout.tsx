import { Tabs } from 'expo-router';
import { theme } from '@/constants/theme';

export default function CustomerTabsLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderLight,
          borderTopWidth: 1,
          paddingTop: 8,
          height: 64,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '500' },
        headerStyle: { backgroundColor: theme.colors.surface, shadowOpacity: 0 },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Ana Sayfa',
          headerTitle: 'Valoria',
          headerShown: true,
          tabBarLabel: 'Ana Sayfa',
        }}
      />
      <Tabs.Screen name="messages" options={{ title: 'Mesajlar', tabBarLabel: 'Mesajlar' }} />
      <Tabs.Screen name="rooms" options={{ title: 'Odalar', tabBarLabel: 'Odalar' }} />
      <Tabs.Screen name="notifications" options={{ title: 'Bildirimler', tabBarLabel: 'Bildirimler' }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarLabel: 'Profil' }} />
      <Tabs.Screen
        name="key"
        options={{
          href: null,
          title: 'Dijital Anahtar',
        }}
      />
    </Tabs>
  );
}
