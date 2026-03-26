import { useCallback, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, AppState } from 'react-native';
import { Tabs, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { theme } from '@/constants/theme';
import { useAuthStore } from '@/stores/authStore';
import { useStaffUnreadMessagesStore } from '@/stores/staffUnreadMessagesStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { useAdminWarningStore } from '@/stores/adminWarningStore';
import { CachedImage } from '@/components/CachedImage';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

function StaffProfileTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const staff = useAuthStore((s) => s.staff);
  const avatarUri = staff?.profile_image ?? null;
  if (avatarUri) {
    return (
      <View style={[styles.tabAvatarWrap, { borderColor: focused ? theme.colors.primary : theme.colors.borderLight }]}>
        <CachedImage uri={avatarUri} style={styles.tabAvatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={TAB_ICON_SIZE} color={color} />;
}

function NotificationBellHeaderButton() {
  const router = useRouter();
  const unreadCount = useStaffNotificationStore((s) => s.unreadCount);
  return (
    <TouchableOpacity
      onPress={() => router.push('/staff/notifications')}
      style={{ marginRight: 16, padding: 4 }}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <View>
        <Ionicons name="notifications-outline" size={24} color={theme.colors.text} />
        {unreadCount > 0 ? (
          <View
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: theme.colors.error,
              justifyContent: 'center',
              alignItems: 'center',
              paddingHorizontal: 4,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
}

function MapHeaderButton({ label }: { label: string }) {
  const router = useRouter();
  return (
    <TouchableOpacity
      onPress={() => router.push('/staff/map')}
      style={{ marginRight: 8, padding: 4 }}
      activeOpacity={0.8}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityLabel={label}
    >
      <Ionicons name="map-outline" size={24} color={theme.colors.text} />
    </TouchableOpacity>
  );
}

export default function StaffTabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  const tabBarPaddingBottom = Math.max(insets.bottom, 8);
  const staff = useAuthStore((s) => s.staff);
  const unreadCount = useStaffUnreadMessagesStore((s) => s.unreadCount);
  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);
  const refreshUnreadMessages = useStaffUnreadMessagesStore((s) => s.refreshUnread);
  const adminWarningCount = useAdminWarningStore((s) => s.count);
  const refreshAdminWarning = useAdminWarningStore((s) => s.refresh);
  useFocusEffect(
    useCallback(() => {
      if (!staff?.id) return () => {};
      refreshNotifications();
      refreshUnreadMessages(staff.id);
      if (staff.role === 'admin') refreshAdminWarning(staff.id);
      const interval = setInterval(() => {
        refreshNotifications();
        refreshUnreadMessages(staff.id);
        if (staff.role === 'admin') refreshAdminWarning(staff.id);
      }, 180000);
      return () => clearInterval(interval);
    }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, refreshAdminWarning])
  );

  // Android: uygulama ön plana gelince tab rozetleri hemen güncellensin (ilgili sekmeye girmeden)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active' || !staff?.id) return;
      refreshNotifications();
      refreshUnreadMessages(staff.id);
      if (staff.role === 'admin')       refreshAdminWarning(staff.id);
    });
    return () => sub.remove();
  }, [staff?.id, staff?.role, refreshNotifications, refreshUnreadMessages, refreshAdminWarning]);

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.borderLight,
          borderTopWidth: 1,
          height: tabBarHeight,
          paddingTop: 6,
          paddingBottom: tabBarPaddingBottom,
          elevation: 0,
          shadowOpacity: 0,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
          marginTop: 2,
        },
        tabBarIconStyle: {
          marginBottom: 0,
        },
        tabBarItemStyle: {
          paddingVertical: 4,
        },
        headerStyle: {
          backgroundColor: theme.colors.surface,
          elevation: 0,
          shadowOpacity: 0,
          borderBottomWidth: 1,
          borderBottomColor: theme.colors.borderLight,
        },
        headerTintColor: theme.colors.primary,
        headerTitleStyle: { fontSize: 18, fontWeight: '800', color: theme.colors.text },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MapHeaderButton label={t('mapTab')} />
            <NotificationBellHeaderButton />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('staffTab'),
          headerTitle: t('staffTab'),
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          headerTitle: t('teamChat'),
          tabBarLabel: t('messages'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="stock"
        options={{
          title: t('stockTab'),
          headerTitle: t('stockManagement'),
          tabBarLabel: t('stockTab'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'cube' : 'cube-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="cameras"
        options={{
          title: 'Kamerlar',
          headerTitle: 'Canlı kameralar',
          href: null,
        }}
      />
      <Tabs.Screen
        name="acceptances"
        options={{
          title: t('acceptances'),
          headerTitle: t('acceptancesHeader'),
          tabBarLabel: t('acceptances'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'document-text' : 'document-text-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications'),
          headerTitle: t('notifications'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="misafir"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="admin"
        options={{
          title: t('adminTab'),
          headerTitle: t('managementPanel'),
          tabBarLabel: t('adminTab'),
          tabBarBadge: staff?.role === 'admin' && adminWarningCount > 0 ? (adminWarningCount > 99 ? '99+' : adminWarningCount) : undefined,
          tabBarBadgeStyle: { backgroundColor: theme.colors.error },
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'shield' : 'shield-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
          href: staff?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('myProfile'),
          headerTitle: t('myProfile'),
          tabBarShowLabel: false,
          tabBarIcon: ({ color, focused }) => <StaffProfileTabIcon color={color} focused={focused} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabAvatarWrap: {
    width: PROFILE_TAB_AVATAR_SIZE,
    height: PROFILE_TAB_AVATAR_SIZE,
    borderRadius: PROFILE_TAB_AVATAR_SIZE / 2,
    borderWidth: 2,
    overflow: 'hidden',
  },
  tabAvatar: {
    width: '100%',
    height: '100%',
  },
});
