import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { AppState, AppStateStatus } from 'react-native';
import { useRouter, Stack } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';

function useStaffPresence(staffId: string | undefined) {
  const appState = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    if (!staffId) return;

    const setOnline = (online: boolean) => {
      supabase
        .from('staff')
        .update({
          is_online: online,
          last_active: new Date().toISOString(),
        })
        .eq('id', staffId)
        .then(({ error }) => {
          if (error) console.warn('Staff presence update failed', error.message);
        });
    };

    setOnline(true);

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        setOnline(true);
      } else if (nextState === 'background' || nextState === 'inactive') {
        setOnline(false);
      }
      appState.current = nextState;
    });

    return () => {
      sub.remove();
      setOnline(false);
    };
  }, [staffId]);
}

export default function StaffLayout() {
  const router = useRouter();
  const { staff, loading, signOut } = useAuthStore();
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  const isBanned = staff?.banned_until && new Date(staff.banned_until) > new Date();
  const isDeleted = !!staff?.deleted_at;

  useStaffPresence(isBanned || isDeleted ? undefined : staff?.id);

  // Root _layout'ta initAuthListener zaten loadSession çağırıyor; burada tekrar çağırmak
  // loading: true yapıp layout'u null döndürüyor ve arkadaki lobi görünüyordu.
  useEffect(() => {
    if (loading) return;
    if (!staff) {
      router.replace('/');
      return;
    }
  }, [loading, staff]);

  useEffect(() => {
    if (!staff?.id || !isDeleted) return;
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
  }, [staff?.id, isDeleted]);

  // Beğeni/yorum bildirimleri anında badge güncellensin (tüm hook'lar erken return'den önce çağrılmalı)
  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff_notifications_live')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${staff.id}` },
        () => {
          useStaffNotificationStore.getState().refresh();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id]);

  // null döndürmek Stack'te arkadaki lobiyi gösteriyordu; aynı arka planla dolu ekran göster
  if (loading || !staff) {
    return <View style={[styles.blockScreen, { backgroundColor: theme.colors.backgroundSecondary }]} />;
  }

  if (isDeleted) {
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

  if (isBanned) {
    const until = staff.banned_until ? new Date(staff.banned_until).toLocaleString('tr-TR') : '';
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
    <Stack screenOptions={{ headerShown: true, headerStyle: { backgroundColor: '#fff' }, headerTintColor: '#1a1d21' }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="stock" options={{ headerShown: false }} />
      <Stack.Screen name="chat/[id]" options={{ title: 'Sohbet', headerBackTitle: 'Geri' }} />
      <Stack.Screen name="new-group" options={{ title: 'Grup oluştur', headerBackTitle: 'Geri' }} />
      <Stack.Screen name="feed/new" options={{ title: 'Yeni paylaşım' }} />
      <Stack.Screen name="expenses" options={{ headerShown: false }} />
      <Stack.Screen name="profile/[id]" options={{ headerShown: false }} />
      <Stack.Screen name="profile/edit" options={{ title: 'Profil bilgilerini düzenle', headerBackTitle: 'Geri' }} />
      <Stack.Screen name="profile/blocked-users" options={{ headerBackTitle: 'Geri' }} />
      <Stack.Screen name="profile/notifications" options={{ headerBackTitle: 'Geri' }} />
      <Stack.Screen name="evaluation" options={{ headerBackTitle: 'Geri' }} />
      <Stack.Screen name="delete-account" options={{ title: 'Hesabımı sil', headerBackTitle: 'Geri' }} />
      <Stack.Screen name="map" options={{ headerShown: false }} />
      <Stack.Screen name="cameras" options={{ headerShown: false }} />
      <Stack.Screen name="guests/[id]" options={{ title: 'Misafir profili', headerShown: false }} />
      <Stack.Screen name="kbs" options={{ headerShown: false }} />
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
