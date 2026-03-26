import { useCallback, useEffect } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, AppState } from 'react-native';
import { Tabs, useRouter, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useGuestMessagingStore } from '@/stores/guestMessagingStore';
import { useGuestNotificationStore } from '@/stores/guestNotificationStore';
import { useScrollToTopStore } from '@/stores/scrollToTopStore';
import { guestListConversations } from '@/lib/messagingApi';
import { savePushTokenForGuest } from '@/lib/notificationsPush';
import { theme } from '@/constants/theme';
import { CachedImage } from '@/components/CachedImage';

const TAB_ICON_SIZE = 24;
const PROFILE_TAB_AVATAR_SIZE = 26;

function CustomerProfileTabIcon({ color, focused }: { color: string; focused: boolean }) {
  const user = useAuthStore((s) => s.user);
  const avatarUri = (user?.user_metadata?.avatar_url as string) || null;
  if (avatarUri) {
    return (
      <View style={[tabAvatarStyles.tabAvatarWrap, { borderColor: focused ? theme.colors.primary : theme.colors.borderLight }]}>
        <CachedImage uri={avatarUri} style={tabAvatarStyles.tabAvatar} contentFit="cover" />
      </View>
    );
  }
  return <Ionicons name={focused ? 'person' : 'person-outline'} size={TAB_ICON_SIZE} color={color} />;
}

const tabAvatarStyles = StyleSheet.create({
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

function AdminPanelHeaderButton() {
  const router = useRouter();
  const { t } = useTranslation();
  const staff = useAuthStore((s) => s.staff);
  if (staff?.role !== 'admin') return null;
  return (
    <TouchableOpacity onPress={() => router.push('/admin')} style={{ marginRight: 12 }} activeOpacity={0.8}>
      <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 14 }}>{t('panel')}</Text>
    </TouchableOpacity>
  );
}

function NotificationBellHeaderButton() {
  const router = useRouter();
  const unreadCount = useGuestNotificationStore((s) => s.unreadCount);
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer/notifications')}
      style={{ marginRight: 12, padding: 4 }}
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

function NewChatHeaderButton() {
  const router = useRouter();
  const { t } = useTranslation();
  return (
    <TouchableOpacity
      onPress={() => router.push('/customer/new-chat')}
      style={{ marginRight: 16, paddingVertical: 6, paddingHorizontal: 12 }}
      activeOpacity={0.8}
    >
      <Text style={{ color: theme.colors.primary, fontWeight: '600', fontSize: 15 }}>{t('newBtn')}</Text>
    </TouchableOpacity>
  );
}

export default function CustomerTabsLayout() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const tabBarHeight = 56 + insets.bottom;
  const tabBarPaddingBottom = Math.max(insets.bottom, 8);
  const staff = useAuthStore((s) => s.staff);
  const { unreadCount, appToken, setUnreadCount, loadStoredToken } = useGuestMessagingStore();
  const refreshNotifications = useGuestNotificationStore((s) => s.refresh);

  // Misafir push token: appToken varsa kaydet (iOS beğeni/yorum bildirimi; sadece Bildirimler sekmesine bağlı kalmasın)
  useEffect(() => {
    loadStoredToken();
  }, [loadStoredToken]);
  useEffect(() => {
    if (!appToken) return;
    savePushTokenForGuest(appToken).catch(() => {});
  }, [appToken]);

  // iOS: token gecikmeli gelirse uygulama ön plana gelince tekrar kaydet
  useEffect(() => {
    if (!appToken) return;
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') savePushTokenForGuest(appToken).catch(() => {});
    });
    return () => sub.remove();
  }, [appToken]);

  useFocusEffect(
    useCallback(() => {
      if (!appToken) return () => {};
      let cancelled = false;
      const refresh = async () => {
        if (cancelled) return;
        const list = await guestListConversations(appToken);
        const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
        setUnreadCount(total);
      };
      refresh();
      const interval = setInterval(refresh, 90000);
      return () => {
        cancelled = true;
        clearInterval(interval);
      };
    }, [appToken, setUnreadCount])
  );

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
      const interval = setInterval(refreshNotifications, 180000);
      return () => clearInterval(interval);
    }, [refreshNotifications])
  );

  // Android: uygulama ön plana gelince tab rozetleri hemen güncellensin (ilgili sekmeye girmeden)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      refreshNotifications();
      if (appToken) {
        guestListConversations(appToken).then((list) => {
          const total = list.reduce((s, c) => s + (c.unread_count ?? 0), 0);
          setUnreadCount(total);
        });
      }
    });
    return () => sub.remove();
  }, [appToken, refreshNotifications, setUnreadCount]);

  return (
    <Tabs
      screenOptions={{
        tabBarHideOnKeyboard: true,
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
          shadowOpacity: 0,
          elevation: 0,
        },
        headerShadowVisible: false,
        headerTintColor: theme.colors.text,
        headerTitleStyle: { fontSize: 18, fontWeight: '700', color: theme.colors.text },
        headerRight: () => (
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <NotificationBellHeaderButton />
            <AdminPanelHeaderButton />
          </View>
        ),
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('home'),
          headerTitle: 'Valoria',
          headerShown: true,
          tabBarLabel: t('home'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'home' : 'home-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
          tabBarButton: (props) => (
            <TouchableOpacity
              {...props}
              onPress={() => {
                props.onPress?.();
                useScrollToTopStore.getState().scrollToTop?.();
              }}
              activeOpacity={0.7}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="map"
        options={{
          title: t('mapTab'),
          headerShown: false,
          tabBarLabel: t('mapTab'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'map' : 'map-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
          tabBarStyle: { display: 'none', height: 0 },
        }}
      />
      <Tabs.Screen
        name="rooms"
        options={{
          title: t('rooms'),
          tabBarLabel: t('rooms'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'bed' : 'bed-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="messages"
        options={{
          title: t('messages'),
          headerTitle: t('messages'),
          headerShown: true,
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <NotificationBellHeaderButton />
              <NewChatHeaderButton />
            </View>
          ),
          tabBarLabel: t('messages'),
          tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? '99+' : unreadCount) : undefined,
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'chatbubbles' : 'chatbubbles-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('notifications'),
          href: null,
        }}
      />
      <Tabs.Screen
        name="personel"
        options={{
          title: t('staffTab'),
          headerTitle: t('staffAppTitle'),
          tabBarLabel: t('staffTab'),
          tabBarIcon: ({ color, focused }) => (
            <Ionicons name={focused ? 'people' : 'people-outline'} size={TAB_ICON_SIZE} color={color} />
          ),
          href: staff?.role === 'admin' ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('profileTab'),
          headerTitle: t('profileTab'),
          tabBarShowLabel: false,
          tabBarIcon: ({ color, focused }) => <CustomerProfileTabIcon color={color} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="key"
        options={{
          href: null,
          title: t('digitalKey'),
        }}
      />
    </Tabs>
  );
}
