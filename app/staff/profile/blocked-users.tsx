import { useState, useCallback } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { theme } from '@/constants/theme';
import { listBlockedUsersForStaff, unblockUserForStaff, type BlockedUserItem } from '@/lib/userBlocks';

export default function StaffBlockedUsersScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const staffId = useAuthStore((s) => s.staff?.id);
  const [list, setList] = useState<BlockedUserItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [unblockingId, setUnblockingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!staffId) return;
    setLoading(true);
    try {
      const rows = await listBlockedUsersForStaff(staffId);
      setList(rows);
    } finally {
      setLoading(false);
    }
  }, [staffId]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  const handleUnblock = (item: BlockedUserItem) => {
    if (!staffId) return;
    Alert.alert(t('unblockTitle'), t('unblockConfirm', { name: item.name }), [
      { text: t('cancelAction'), style: 'cancel' },
      {
        text: t('removeBlock'),
        style: 'destructive',
        onPress: async () => {
          setUnblockingId(item.blockId);
          const { error } = await unblockUserForStaff({
            blockerStaffId: staffId,
            blockedType: item.blockedType,
            blockedId: item.blockedId,
          });
          setUnblockingId(null);
          if (error) {
            Alert.alert(t('error'), error.message || t('recordError'));
            return;
          }
          setList((prev) => prev.filter((x) => x.blockId !== item.blockId));
        },
      },
    ]);
  };

  return (
    <>
      <Stack.Screen options={{ title: t('blockedUsersTitle'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
          </View>
        ) : list.length === 0 ? (
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t('noBlockedUsers')}</Text>
          </View>
        ) : (
          list.map((item) => (
            <View key={item.blockId} style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.subtitle ?? t('user')}</Text>
              </View>
              <TouchableOpacity
                style={styles.unblockBtn}
                onPress={() => handleUnblock(item)}
                disabled={unblockingId === item.blockId}
                activeOpacity={0.85}
              >
                <Text style={styles.unblockBtnText}>{unblockingId === item.blockId ? '…' : t('removeBlock')}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg },
  center: { paddingVertical: 48, alignItems: 'center' },
  emptyCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.xl,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
  },
  emptyText: { fontSize: 15, color: theme.colors.textMuted, textAlign: 'center', fontStyle: 'italic' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.surface,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  rowText: { flex: 1, minWidth: 0, paddingRight: 12 },
  name: { fontSize: 16, fontWeight: '700', color: theme.colors.text },
  sub: { fontSize: 13, color: theme.colors.textMuted, marginTop: 4 },
  unblockBtn: {
    backgroundColor: theme.colors.error + '16',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  unblockBtnText: { color: theme.colors.error, fontWeight: '800', fontSize: 13 },
});
