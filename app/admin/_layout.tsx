import { useEffect, useCallback } from 'react';
import { View, TouchableOpacity, Platform, StyleSheet, Text } from 'react-native';
import { Stack, useRouter, useNavigation, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { adminTheme } from '@/constants/adminTheme';
import { Ionicons } from '@expo/vector-icons';

export default function AdminLayout() {
  const { t } = useTranslation();
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();

  const handleAdminBack = () => {
    if (navigation.canGoBack()) {
      router.back();
    } else {
      // Admin giriş yapmış kullanıcı; lobi yerine doğrudan personel paneline dön
      router.replace('/staff');
    }
  };
  const { staff, loading, loadSession } = useAuthStore();

  const refreshNotifications = useStaffNotificationStore((s) => s.refresh);

  useFocusEffect(
    useCallback(() => {
      refreshNotifications();
    }, [refreshNotifications])
  );

  const renderHeaderRight = () => (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <TouchableOpacity
        onPress={() => router.push('/admin/map')}
        style={{ marginRight: 12, padding: 6 }}
        activeOpacity={0.8}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        accessibilityLabel="Harita"
      >
        <Ionicons name="map-outline" size={22} color={adminTheme.colors.text} />
      </TouchableOpacity>
    </View>
  );

  useEffect(() => {
    loadSession();
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!staff || staff.role !== 'admin') {
      router.replace('/');
      return;
    }
  }, [loading, staff]);

  const headerOpts = {
    headerStyle: {
      backgroundColor: '#fff',
    },
    headerTintColor: adminTheme.colors.text,
    headerTitleStyle: {
      fontWeight: '700' as const,
      fontSize: 17,
    },
    headerShadowVisible: true,
    contentStyle: { paddingBottom: insets.bottom + 16 },
    ...(Platform.OS === 'android' && {
      statusBarColor: '#fff',
    }),
  };

  return (
    <View style={styles.wrapper}>
      <Stack screenOptions={{ headerShown: true, ...headerOpts }}>
        <Stack.Screen
          name="index"
          options={{
            title: t('managementPanel'),
            headerLeft: () => (
              <TouchableOpacity
                onPress={handleAdminBack}
                style={{ marginLeft: 8, padding: 8 }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="arrow-back" size={24} color={adminTheme.colors.text} />
              </TouchableOpacity>
            ),
            headerRight: renderHeaderRight,
          }}
        />
      <Stack.Screen name="rooms/index" options={{ title: t('adminRooms'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/[id]" options={{ title: t('adminRoomDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="rooms/new" options={{ title: t('adminRoomNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="guests/index" options={{ title: t('adminGuests'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="guests/[id]" options={{ title: t('adminGuestDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="checkin" options={{ title: t('adminCheckin'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="housekeeping" options={{ title: t('adminHousekeeping'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="report" options={{ title: t('adminReport'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stays/index" options={{ title: 'Konaklama geçmişi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="hmb-reports/index" options={{ title: t('adminHmbReports'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="contracts" options={{ title: t('adminContracts'), headerShown: false }} />
      <Stack.Screen name="stock/index" options={{ headerShown: false }} />
      <Stack.Screen name="stock/all" options={{ title: 'Tüm stoklar', headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/product/[id]" options={{ title: t('adminProductDetail'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/movement" options={{ title: t('adminStockMovement'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/approvals" options={{ title: t('adminStockApprovals'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="stock/scan" options={{ title: t('adminScanBarcode'), headerShown: false }} />
      <Stack.Screen name="expenses/index" options={{ title: 'Harcama yönetimi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/all" options={{ title: 'Tüm harcamalar', headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/by-category" options={{ title: 'Kategori bazlı harcama', headerRight: renderHeaderRight }} />
      <Stack.Screen name="expenses/by-staff" options={{ title: 'Personel bazlı harcama', headerRight: renderHeaderRight }} />
      <Stack.Screen name="carbon/index" options={{ title: 'Karbon ayak izi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="carbon/report" options={{ title: 'Karbon raporu', headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/index" options={{ title: 'Maaş yönetimi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/all" options={{ title: 'Tüm ödemeler', headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/new" options={{ title: 'Yeni maaş ödemesi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/history/[id]" options={{ title: 'Maaş geçmişi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="salary/edit/[paymentId]" options={{ title: 'Maaş düzenle', headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/index" options={{ title: t('adminAccess'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors" options={{ title: t('adminDoors'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors/new" options={{ title: t('adminDoorNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/doors/[id]" options={{ title: t('adminDoorEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards" options={{ title: t('adminCards'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards/new" options={{ title: t('adminCardNew'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/cards/[id]" options={{ title: t('adminCardEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/staff-permissions" options={{ title: t('adminStaffPermissions'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="access/logs" options={{ title: t('adminAccessLogs'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="permissions" options={{ title: t('adminPermissions'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/index" options={{ title: t('adminNotifications'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/bulk" options={{ title: t('adminBulkNotification'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="reports/index" options={{ title: t('adminReports'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/templates" options={{ title: t('adminNotificationTemplates'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="notifications/emergency" options={{ title: t('adminEmergency'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/index" options={{ title: t('adminMessages'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/chat/[id]" options={{ title: t('adminChat'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/new" options={{ title: t('adminNewChat'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="messages/bulk" options={{ title: t('adminBulkMessage'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/index" options={{ title: t('adminStaffCreate'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/list" options={{ title: t('adminUserList'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/[id]" options={{ title: t('adminStaffEdit'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/add" options={{ title: t('adminStaffAdd'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/pending" options={{ title: t('adminStaffPending'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="staff/approve/[id]" options={{ title: t('adminStaffApprove'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="qr-designs/index" options={{ title: t('adminQrDesigns'), headerRight: renderHeaderRight }} />
      <Stack.Screen name="feed/index" options={{ title: 'Paylaşımlar', headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/index" options={{ title: 'Kamera yönetimi', headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/new" options={{ title: 'Yeni kamera', headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/[id]" options={{ title: 'Kamera düzenle', headerRight: renderHeaderRight }} />
      <Stack.Screen name="cameras/logs" options={{ title: 'Kamera logları', headerRight: renderHeaderRight }} />
      <Stack.Screen name="profile" options={{ title: 'Profilim', headerRight: renderHeaderRight }} />
      <Stack.Screen name="app-links" options={{ title: 'Uygulamalar & Web Siteleri', headerRight: renderHeaderRight }} />
      <Stack.Screen name="settings/printer" options={{ title: 'Yazici ayarlari', headerRight: renderHeaderRight }} />
      <Stack.Screen name="map" options={{ headerShown: false }} />
      </Stack>

      {/* Tab menü: Admin, Personel, Misafir — hepsi tab’ta, ayrı yerde olmayacak */}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { flex: 1 },
});
