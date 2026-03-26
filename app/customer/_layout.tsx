import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

type GuestStatusRow = { guest_id: string; deleted_at: string | null; banned_until: string | null };

export default function CustomerLayout() {
  const router = useRouter();
  const { user, staff, loading, signOut } = useAuthStore();
  const [guestStatus, setGuestStatus] = useState<GuestStatusRow | null | undefined>(undefined);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (staff) {
      router.replace('/staff');
      return;
    }
    if (!user) {
      Alert.alert(
        'Kayıt olmanız gerekmektedir',
        'Bu işlemi yapmak için lobiye kayıt olmanız gerekiyor. Kayıt ekranına yönlendiriliyorsunuz.',
        [{ text: 'Tamam', onPress: () => router.replace('/') }]
      );
      return;
    }
  }, [loading, user, staff]);

  useEffect(() => {
    if (!user || staff) {
      setGuestStatus(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc('get_my_guest_status');
      if (error || !data?.length) {
        setGuestStatus(null);
        return;
      }
      const row = Array.isArray(data) ? data[0] : data;
      setGuestStatus({
        guest_id: row?.guest_id,
        deleted_at: row?.deleted_at ?? null,
        banned_until: row?.banned_until ?? null,
      });
    })();
  }, [user?.id, staff]);

  const guestDeleted = !!guestStatus && !!guestStatus.deleted_at;
  const guestBanned = !!(guestStatus && guestStatus.banned_until && new Date(guestStatus.banned_until) > new Date());

  useEffect(() => {
    if (!guestDeleted) return;
    const doConfirm = async () => {
      setConfirmingLogout(true);
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.access_token) {
          await supabase.functions.invoke('confirm-deleted-logout', {
            body: {},
            headers: { Authorization: `Bearer ${session.access_token}` },
          });
        }
      } catch (_) {}
      await signOut();
      setConfirmingLogout(false);
      router.replace('/');
    };
    doConfirm();
  }, [guestDeleted]);

  // null döndürmek Stack'te arkadaki lobiyi gösteriyordu; aynı arka planla dolu ekran göster
  if (loading && !user) return <View style={[styles.blockScreen, { flex: 1 }]} />;
  if (staff) return <View style={[styles.blockScreen, { flex: 1 }]} />;
  if (!user) return <View style={[styles.blockScreen, { flex: 1 }]} />;

  if (guestDeleted) {
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>🚫</Text>
          <Text style={styles.blockTitle}>Hesabınız silindi</Text>
          <Text style={styles.blockMessage}>Hesabınız platform tarafından silindi. Lobiye yönlendiriliyorsunuz. Aynı hesapla tekrar giriş yapamazsınız.</Text>
          {confirmingLogout ? <Text style={styles.blockSub}>Çıkış yapılıyor...</Text> : (
            <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
              <Text style={styles.blockBtnText}>Lobiye dön</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    );
  }

  if (guestBanned) {
    const until = guestStatus?.banned_until ? new Date(guestStatus.banned_until).toLocaleString('tr-TR') : '';
    return (
      <View style={styles.blockScreen}>
        <View style={styles.blockCard}>
          <Text style={styles.blockEmoji}>⛔</Text>
          <Text style={styles.blockTitle}>Banlandınız</Text>
          <Text style={styles.blockMessage}>Hesabınız {until} tarihine kadar erişime kapatıldı.</Text>
          <TouchableOpacity style={styles.blockBtn} onPress={() => router.replace('/')}>
            <Text style={styles.blockBtnText}>Lobiye dön</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

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
      <Stack.Screen name="staff/[id]" options={{ headerShown: false }} />
      <Stack.Screen
        name="hotel/index"
        options={{
          headerShown: true,
          title: 'Otel',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="hotel/map"
        options={{
          headerShown: true,
          title: 'Otel içi harita',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="surroundings"
        options={{
          headerShown: true,
          title: 'Çevre rehberi',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="emergency"
        options={{
          headerShown: true,
          title: 'Acil durum',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="room-service/index"
        options={{
          headerShown: true,
          title: 'Oda servisi',
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
      <Stack.Screen
        name="map/poi/[id]"
        options={{
          headerShown: true,
          title: 'İşletme',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="map/directions"
        options={{
          headerShown: true,
          title: 'Yol tarifi',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="feed/new"
        options={{
          headerShown: true,
          title: 'Yeni paylaşım',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="feed/[id]"
        options={{
          headerShown: true,
          title: 'Paylaşım',
          headerBackTitle: 'Geri',
        }}
      />
      <Stack.Screen
        name="carbon/index"
        options={{
          headerShown: true,
          title: 'Karbon ayak izim',
          headerBackTitle: 'Geri',
        }}
      />
    </Stack>
  );
}

const styles = StyleSheet.create({
  blockScreen: {
    flex: 1,
    backgroundColor: theme.colors.backgroundSecondary,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  blockCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: 24,
    maxWidth: 360,
    width: '100%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
  },
  blockEmoji: { fontSize: 48, marginBottom: 16 },
  blockTitle: { fontSize: 20, fontWeight: '700', color: theme.colors.text, marginBottom: 12, textAlign: 'center' },
  blockMessage: { fontSize: 15, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: 20, lineHeight: 22 },
  blockSub: { fontSize: 14, color: theme.colors.textMuted, marginBottom: 16 },
  blockBtn: {
    backgroundColor: theme.colors.primary,
    paddingVertical: 14,
    paddingHorizontal: 28,
    borderRadius: 12,
  },
  blockBtnText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
