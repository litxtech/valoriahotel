import { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { getExpoPushTokenAsync, savePushTokenForStaff, isExpoGo } from '@/lib/notificationsPush';
import { useAuthStore } from '@/stores/authStore';
import { useStaffNotificationStore } from '@/stores/staffNotificationStore';

type NotifRow = {
  id: string;
  title: string;
  body: string | null;
  category: string | null;
  read_at: string | null;
  created_at: string;
  data?: { postId?: string; url?: string } | null;
};

export default function StaffNotificationsScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [list, setList] = useState<NotifRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingAll, setDeletingAll] = useState(false);
  const [pushPerm, setPushPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unknown'>('unknown');
  const [enablingPush, setEnablingPush] = useState(false);

  const load = useCallback(async () => {
    if (!staff?.id) {
      setLoading(false);
      return;
    }
    // Push iznini otomatik isteme: sadece durum kontrol et.
    if (!isExpoGo) {
      try {
        const Notifications = await import('expo-notifications').then((m) => m.default);
        const { status } = await Notifications.getPermissionsAsync();
        setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
      } catch {
        setPushPerm('unknown');
      }
    }
    const { data } = await supabase
      .from('notifications')
      .select('id, title, body, category, read_at, created_at, data')
      .eq('staff_id', staff.id)
      .order('created_at', { ascending: false })
      .limit(100);
    setList((data as NotifRow[]) ?? []);
    setLoading(false);
  }, [staff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Yeni bildirim gelince listeyi güncelle (beğeni/yorum push’u anında görünsün)
  useEffect(() => {
    if (!staff?.id) return;
    const channel = supabase
      .channel('staff_notifications_list')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `staff_id=eq.${staff.id}` },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [staff?.id]);

  const { refresh: refreshBadge, setUnreadCount, setNotificationsScreenFocused } = useStaffNotificationStore();

  useFocusEffect(
    useCallback(() => {
      setUnreadCount(0);
      setNotificationsScreenFocused(true);
      load();
      return () => setNotificationsScreenFocused(false);
    }, [setUnreadCount, setNotificationsScreenFocused, load])
  );

  const enablePush = useCallback(async () => {
    if (enablingPush) return;
    if (isExpoGo) {
      Alert.alert(
        'Push bildirimleri desteklenmiyor',
        'Push bildirimleri Expo Go içinde çalışmaz. Lütfen development build veya yüklenmiş uygulama (App Store / Play Store) ile deneyin.',
        [{ text: 'Tamam' }]
      );
      return;
    }
    if (!staff?.id) return;
    setEnablingPush(true);
    try {
      const token = await getExpoPushTokenAsync();
      if (token) {
        await savePushTokenForStaff(staff.id);
        setPushPerm('granted');
      } else {
        try {
          const Notifications = await import('expo-notifications').then((m) => m.default);
          const { status } = await Notifications.getPermissionsAsync();
          setPushPerm(status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined');
          if (status === 'denied') {
            Alert.alert(
              'Bildirim izni reddedildi',
              'Bildirim almak için lütfen ayarlardan izin verin.',
              [
                { text: 'İptal', style: 'cancel' },
                { text: 'Ayarları aç', onPress: () => Linking.openSettings() },
              ]
            );
          }
        } catch {
          /* ignore */
        }
      }
    } catch (e) {
      Alert.alert('Hata', 'İzin alınırken bir sorun oluştu. Lütfen tekrar deneyin.');
    } finally {
      setEnablingPush(false);
    }
  }, [staff?.id, enablingPush]);

  const markRead = async (id: string) => {
    if (!staff?.id) return;
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('staff_id', staff.id);
    setList((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)));
    refreshBadge();
  };

  const onNotificationPress = (n: NotifRow) => {
    if (!n.read_at) markRead(n.id);
    if (n.data?.postId) {
      router.push({ pathname: '/staff/feed', params: { openPostId: n.data.postId } });
    }
  };

  const deleteAllNotifications = () => {
    if (!staff?.id || list.length === 0) return;
    Alert.alert(
      'Tüm bildirimleri sil',
      'Tüm bildirimleriniz kalıcı olarak silinecek. Emin misiniz?',
      [
        { text: 'İptal', style: 'cancel' },
        {
          text: 'Sil',
          style: 'destructive',
          onPress: async () => {
            setDeletingAll(true);
            await supabase.from('notifications').delete().eq('staff_id', staff.id);
            setList([]);
            setUnreadCount(0);
            refreshBadge();
            setDeletingAll(false);
          },
        },
      ]
    );
  };

  const categoryLabel = (c: string | null) => {
    const m: Record<string, string> = {
      emergency: 'Acil',
      guest: 'Misafir',
      staff: 'Görev',
      admin: 'Admin',
      bulk: 'Duyuru',
    };
    return c ? m[c] ?? c : '';
  };

  if (!staff) {
    return (
      <View style={styles.centered}>
        <Text style={styles.message}>Oturum gerekli.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
    >
      <Text style={styles.title}>Bildirimlerim</Text>
      <Text style={styles.subtitle}>Yeni görevler, acil durumlar ve duyurular burada.</Text>
      {!isExpoGo && (pushPerm === 'denied' || pushPerm === 'undetermined') && (
        <View style={styles.pushCard}>
          <View style={styles.pushCardRow}>
            <Ionicons name="notifications-outline" size={20} color="#2b6cb0" />
            <Text style={styles.pushCardTitle}>Bildirim izni gerekli</Text>
          </View>
          <Text style={styles.pushCardDesc}>
            {pushPerm === 'denied'
              ? 'Bildirim izni daha önce reddedildi. Ayarlardan izin verebilirsiniz.'
              : 'Görevler ve duyurular için bildirim izni verin. İzni istemek için butona dokunun.'}
          </Text>
          <View style={styles.pushCardBtnRow}>
            <TouchableOpacity
              style={[styles.pushCardBtn, enablingPush && styles.pushCardBtnDisabled]}
              onPress={enablePush}
              disabled={enablingPush}
              activeOpacity={0.8}
            >
              {enablingPush ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.pushCardBtnText}>
                  {pushPerm === 'denied' ? 'Tekrar iste' : 'Bildirim izni ver'}
                </Text>
              )}
            </TouchableOpacity>
            {pushPerm === 'denied' && (
              <TouchableOpacity
                style={styles.pushCardBtnSecondary}
                onPress={() => Linking.openSettings()}
                activeOpacity={0.8}
              >
                <Text style={styles.pushCardBtnSecondaryText}>Ayarları aç</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      )}
      {list.length > 0 && (
        <TouchableOpacity
          style={[styles.deleteAllBtn, deletingAll && styles.deleteAllBtnDisabled]}
          onPress={deleteAllNotifications}
          disabled={deletingAll}
          activeOpacity={0.7}
        >
          {deletingAll ? (
            <ActivityIndicator size="small" color="#e53e3e" />
          ) : (
            <>
              <Ionicons name="trash-outline" size={14} color="#e53e3e" />
              <Text style={styles.deleteAllBtnText}>Tümünü sil</Text>
            </>
          )}
        </TouchableOpacity>
      )}
      {list.length === 0 && !loading ? (
        <Text style={styles.empty}>Henüz bildirim yok.</Text>
      ) : (
        list.map((n) => (
          <TouchableOpacity
            key={n.id}
            style={[styles.row, n.read_at ? styles.rowRead : null]}
            onPress={() => onNotificationPress(n)}
            activeOpacity={0.8}
          >
            {categoryLabel(n.category) ? (
              <Text style={styles.rowCategory}>{categoryLabel(n.category)}</Text>
            ) : null}
            <Text style={styles.rowTitle}>{n.title}</Text>
            {n.body ? <Text style={styles.rowBody}>{n.body}</Text> : null}
            <Text style={styles.rowTime}>{new Date(n.created_at).toLocaleString('tr-TR')}</Text>
          </TouchableOpacity>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f7fafc' },
  content: { padding: 20, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  message: { fontSize: 16, color: '#718096' },
  title: { fontSize: 20, fontWeight: '700', color: '#1a202c', marginBottom: 4 },
  subtitle: { fontSize: 14, color: '#718096', marginBottom: 20 },
  pushCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    padding: 14,
    marginBottom: 14,
  },
  pushCardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  pushCardTitle: { fontSize: 15, fontWeight: '700', color: '#1a202c' },
  pushCardDesc: { fontSize: 13, color: '#4a5568', lineHeight: 18 },
  pushCardBtnRow: { marginTop: 12, gap: 10 },
  pushCardBtn: {
    backgroundColor: '#2b6cb0',
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
  },
  pushCardBtnDisabled: { opacity: 0.7 },
  pushCardBtnText: { color: '#fff', fontWeight: '700' },
  pushCardBtnSecondary: {
    marginTop: 6,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#2b6cb0',
  },
  pushCardBtnSecondaryText: { color: '#2b6cb0', fontWeight: '600' },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 12,
    borderRadius: 6,
    backgroundColor: 'transparent',
  },
  deleteAllBtnDisabled: { opacity: 0.6 },
  deleteAllBtnText: { fontSize: 12, fontWeight: '500', color: '#e53e3e' },
  empty: { color: '#a0aec0', fontSize: 14 },
  row: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  rowRead: { opacity: 0.85 },
  rowCategory: { fontSize: 12, color: '#b8860b', fontWeight: '600', marginBottom: 4 },
  rowTitle: { fontSize: 16, fontWeight: '600', color: '#1a202c', marginBottom: 4 },
  rowBody: { fontSize: 14, color: '#4a5568', marginBottom: 8 },
  rowTime: { fontSize: 12, color: '#a0aec0' },
});
