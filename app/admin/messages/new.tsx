import { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  SectionList,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { staffCreateGroupConversation, staffGetOrCreateDirectConversation } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { sendNotification } from '@/lib/notificationService';
import { CachedImage } from '@/components/CachedImage';

type GuestRow = { id: string; full_name: string | null; photo_url?: string | null; room_id: string | null; rooms: { room_number: string } | null };
type StaffRow = { id: string; full_name: string | null; department: string | null; profile_image: string | null; is_online: boolean | null; role?: string | null };

export default function AdminNewChatScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState<string | null>(null);
  const [groupName, setGroupName] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [creatingGroup, setCreatingGroup] = useState(false);

  useEffect(() => {
    load();
  }, []);

  const load = async () => {
    const [gRes, sRes] = await Promise.all([
      supabase.from('guests').select('id, full_name, photo_url, room_id, rooms(room_number)').order('full_name'),
      supabase.from('staff').select('id, full_name, department, profile_image, is_online, role').eq('is_active', true).neq('id', staff?.id ?? '').order('full_name'),
    ]);
    setGuests(gRes.data ?? []);
    setStaffList(sRes.data ?? []);
    setLoading(false);
  };

  const startWithGuest = async (guestId: string) => {
    if (!staff) return;
    setStarting(guestId);
    const convId = await staffGetOrCreateDirectConversation(staff.id, guestId, 'guest');
    setStarting(null);
    if (convId) router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: convId } });
  };

  const startWithStaff = async (otherStaffId: string) => {
    if (!staff) return;
    setStarting(otherStaffId);
    const convId = await staffGetOrCreateDirectConversation(staff.id, otherStaffId, 'staff');
    setStarting(null);
    if (convId) router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: convId } });
  };

  const toggleStaffSelection = (staffId: string) => {
    setSelectedStaffIds((prev) => (prev.includes(staffId) ? prev.filter((id) => id !== staffId) : [...prev, staffId]));
  };

  const createGroup = async () => {
    if (!staff) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Grup adı gerekli', 'Lütfen grup için bir ad girin.');
      return;
    }
    if (selectedStaffIds.length === 0) {
      Alert.alert('Üye seçin', 'Lütfen gruba eklenecek en az bir personel seçin.');
      return;
    }

    setCreatingGroup(true);
    const { conversationId, error } = await staffCreateGroupConversation({
      creatorStaffId: staff.id,
      creatorType: staff.role === 'admin' ? 'admin' : 'staff',
      groupName: name,
      memberStaffIds: selectedStaffIds,
    });
    setCreatingGroup(false);

    if (error || !conversationId) {
      Alert.alert('Hata', error ?? 'Grup oluşturulamadı.');
      return;
    }

    await Promise.all(
      selectedStaffIds.map((staffId) =>
        sendNotification({
          staffId,
          title: 'Yeni gruba eklendiniz',
          body: `"${name}" grubuna eklendiniz.`,
          notificationType: 'group_added',
          category: 'staff',
          data: { screen: 'notifications', conversationId, url: '/staff/(tabs)/messages' },
          createdByStaffId: staff.id,
        })
      )
    );

    setGroupName('');
    setSelectedStaffIds([]);
    router.replace({ pathname: '/admin/messages/chat/[id]', params: { id: conversationId } });
  };

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  const staffSorted = [...staffList].sort((a, b) => {
    const aAdmin = (a.role === 'admin') ? 0 : 1;
    const bAdmin = (b.role === 'admin') ? 0 : 1;
    return aAdmin - bAdmin || (a.full_name || '').localeCompare(b.full_name || '');
  });

  const sections: { title: string; data: { id: string; name: string; sub: string; type: 'guest' | 'staff'; avatar?: string | null }[] }[] = [
    {
      title: 'Misafirler',
      data: guests.map((g) => ({
        id: g.id,
        name: g.full_name || 'Misafir',
        sub: (g.rooms as { room_number?: string })?.room_number ? `Oda ${(g.rooms as { room_number: string }).room_number}` : '—',
        type: 'guest' as const,
        avatar: g.photo_url ?? null,
      })),
    },
    {
      title: 'Personel',
      data: staffSorted.map((s) => ({
        id: s.id,
        name: s.full_name || 'Personel',
        sub: s.department || '—',
        type: 'staff' as const,
        avatar: s.profile_image ?? null,
      })),
    },
  ].filter((s) => s.data.length > 0);

  return (
    <View style={styles.container}>
      <View style={styles.groupBox}>
        <Text style={styles.groupTitle}>Yeni grup oluştur</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Grup adı (örn: Kat Hizmetleri Gece)"
          placeholderTextColor={MESSAGING_COLORS.textSecondary}
          style={styles.groupInput}
        />
        <Text style={styles.groupHint}>Personel listesinden üyeleri seçin, ardından grubu oluşturun.</Text>
        <TouchableOpacity
          style={[styles.groupBtn, (!groupName.trim() || selectedStaffIds.length === 0 || creatingGroup) && styles.groupBtnDisabled]}
          onPress={createGroup}
          disabled={!groupName.trim() || selectedStaffIds.length === 0 || creatingGroup}
        >
          {creatingGroup ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.groupBtnText}>Grup oluştur ({selectedStaffIds.length})</Text>
          )}
        </TouchableOpacity>
      </View>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        stickySectionHeadersEnabled
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionTitle}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.row}
            onPress={item.type === 'guest' ? () => startWithGuest(item.id) : undefined}
            disabled={!!starting}
          >
            <View style={styles.avatar}>
              {item.avatar ? (
                <CachedImage uri={item.avatar} style={styles.avatarImg} contentFit="cover" />
              ) : (
                <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
              )}
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.name}>{item.name}</Text>
              <Text style={styles.sub}>{item.sub}</Text>
            </View>
            {item.type === 'staff' ? (
              <View style={styles.staffActions}>
                <TouchableOpacity
                  style={styles.directBtn}
                  onPress={() => startWithStaff(item.id)}
                  disabled={!!starting}
                >
                  <Text style={styles.directBtnText}>Sohbet</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.check, selectedStaffIds.includes(item.id) && styles.checkActive]}
                  onPress={() => toggleStaffSelection(item.id)}
                  disabled={!!starting}
                >
                  {selectedStaffIds.includes(item.id) && <Text style={styles.checkText}>✓</Text>}
                </TouchableOpacity>
              </View>
            ) : (
              starting === item.id ? <ActivityIndicator size="small" color={MESSAGING_COLORS.primary} /> : <Text style={styles.arrow}>→</Text>
            )}
          </TouchableOpacity>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: MESSAGING_COLORS.textSecondary,
    marginHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  groupBox: {
    backgroundColor: '#fff7ed',
    borderColor: '#fed7aa',
    borderWidth: 1,
    borderRadius: 10,
    margin: 12,
    padding: 12,
  },
  groupTitle: { fontSize: 15, fontWeight: '700', color: MESSAGING_COLORS.text },
  groupInput: {
    marginTop: 8,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 10,
    fontSize: 14,
    color: MESSAGING_COLORS.text,
  },
  groupHint: { marginTop: 8, fontSize: 12, color: MESSAGING_COLORS.textSecondary },
  groupBtn: {
    marginTop: 10,
    backgroundColor: MESSAGING_COLORS.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  groupBtnDisabled: { opacity: 0.5 },
  groupBtnText: { color: '#fff', fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: MESSAGING_COLORS.primary, justifyContent: 'center', alignItems: 'center', marginRight: 12, overflow: 'hidden' },
  avatarImg: { width: 44, height: 44 },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  rowBody: { flex: 1 },
  name: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  sub: { fontSize: 13, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
  arrow: { fontSize: 18, color: MESSAGING_COLORS.textSecondary },
  staffActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  directBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#eff6ff',
  },
  directBtnText: { color: '#1d4ed8', fontSize: 12, fontWeight: '700' },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  checkActive: {
    backgroundColor: MESSAGING_COLORS.primary,
    borderColor: MESSAGING_COLORS.primary,
  },
  checkText: { color: '#fff', fontWeight: '800' },
});
