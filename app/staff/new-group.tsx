import { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, FlatList, TextInput, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuthStore } from '@/stores/authStore';
import { staffCreateGroupConversation } from '@/lib/messagingApi';
import { supabase } from '@/lib/supabase';
import { MESSAGING_COLORS } from '@/lib/messaging';
import { sendNotification } from '@/lib/notificationService';

type StaffRow = {
  id: string;
  full_name: string | null;
  department: string | null;
};

export default function StaffNewGroupScreen() {
  const router = useRouter();
  const { staff } = useAuthStore();
  const [staffList, setStaffList] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [groupName, setGroupName] = useState('');
  const [query, setQuery] = useState('');
  const [selectedStaffIds, setSelectedStaffIds] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!staff) return;
      if (staff.role !== 'admin') {
        router.replace('/staff/(tabs)/messages');
        return;
      }
      const { data } = await supabase
        .from('staff')
        .select('id, full_name, department')
        .eq('is_active', true)
        .neq('id', staff.id)
        .order('full_name');
      if (cancelled) return;
      setStaffList((data ?? []) as StaffRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [staff?.id, staff?.role, router]);

  const visibleStaff = useMemo(() => {
    const q = query.trim().toLocaleLowerCase('tr-TR');
    if (!q) return staffList;
    return staffList.filter((s) => `${s.full_name ?? ''} ${s.department ?? ''}`.toLocaleLowerCase('tr-TR').includes(q));
  }, [staffList, query]);

  const toggleSelect = (id: string) => {
    setSelectedStaffIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const createGroup = async () => {
    if (!staff) return;
    const name = groupName.trim();
    if (!name) {
      Alert.alert('Grup adı gerekli', 'Lütfen grup adını yazın.');
      return;
    }
    if (selectedStaffIds.length === 0) {
      Alert.alert('Üye seçin', 'Lütfen en az bir personel seçin.');
      return;
    }
    setCreating(true);
    const { conversationId, error } = await staffCreateGroupConversation({
      creatorStaffId: staff.id,
      creatorType: 'admin',
      groupName: name,
      memberStaffIds: selectedStaffIds,
    });
    setCreating(false);
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
    router.replace({ pathname: '/staff/chat/[id]', params: { id: conversationId } });
  };

  if (!staff) return null;

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color={MESSAGING_COLORS.primary} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.groupBox}>
        <Text style={styles.groupTitle}>Yeni grup oluştur</Text>
        <TextInput
          value={groupName}
          onChangeText={setGroupName}
          placeholder="Grup adı"
          placeholderTextColor={MESSAGING_COLORS.textSecondary}
          style={styles.groupInput}
        />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Personel ara"
          placeholderTextColor={MESSAGING_COLORS.textSecondary}
          style={styles.groupInput}
        />
        <TouchableOpacity
          style={[styles.groupBtn, (!groupName.trim() || selectedStaffIds.length === 0 || creating) && styles.groupBtnDisabled]}
          onPress={createGroup}
          disabled={!groupName.trim() || selectedStaffIds.length === 0 || creating}
        >
          {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.groupBtnText}>Grup oluştur ({selectedStaffIds.length})</Text>}
        </TouchableOpacity>
      </View>

      <FlatList
        data={visibleStaff}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => {
          const selected = selectedStaffIds.includes(item.id);
          return (
            <TouchableOpacity style={styles.row} onPress={() => toggleSelect(item.id)} activeOpacity={0.8}>
              <View style={styles.rowBody}>
                <Text style={styles.name}>{item.full_name || 'Personel'}</Text>
                <Text style={styles.sub}>{item.department || '—'}</Text>
              </View>
              <View style={[styles.check, selected && styles.checkActive]}>
                {selected ? <Text style={styles.checkText}>✓</Text> : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: MESSAGING_COLORS.background },
  centered: { flex: 1, justifyContent: 'center', alignItems: 'center' },
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
  rowBody: { flex: 1 },
  name: { fontWeight: '600', fontSize: 16, color: MESSAGING_COLORS.text },
  sub: { fontSize: 13, color: MESSAGING_COLORS.textSecondary, marginTop: 2 },
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
