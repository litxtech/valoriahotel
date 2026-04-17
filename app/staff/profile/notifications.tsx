import { useState, useEffect, useCallback } from 'react';
import { View, Text, ScrollView, StyleSheet, Switch, Alert } from 'react-native';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '@/stores/authStore';
import { supabase } from '@/lib/supabase';
import { theme } from '@/constants/theme';
import { staffSetConversationMuted } from '@/lib/messagingApi';

export default function StaffNotificationPrefsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const authStaff = useAuthStore((s) => s.staff);
  const [allStaffConvId, setAllStaffConvId] = useState<string | null>(null);
  const [muteAllStaffMessages, setMuteAllStaffMessages] = useState(false);
  const [muteFeedNotifications, setMuteFeedNotifications] = useState(false);
  const [ready, setReady] = useState(false);

  const load = useCallback(async () => {
    if (!authStaff?.id) return;
    const { data: allStaffConv } = await supabase
      .from('conversations')
      .select('id')
      .eq('type', 'group')
      .eq('name', 'Tüm Çalışanlar')
      .maybeSingle();
    if (allStaffConv?.id) {
      setAllStaffConvId(allStaffConv.id);
      const { data: part } = await supabase
        .from('conversation_participants')
        .select('is_muted')
        .eq('conversation_id', allStaffConv.id)
        .eq('participant_id', authStaff.id)
        .in('participant_type', ['staff', 'admin'])
        .maybeSingle();
      setMuteAllStaffMessages(!!(part as { is_muted?: boolean } | null)?.is_muted);
    }
    const { data: feedPref } = await supabase
      .from('notification_preferences')
      .select('enabled')
      .eq('staff_id', authStaff.id)
      .eq('pref_key', 'mute_feed_notifications')
      .maybeSingle();
    setMuteFeedNotifications(!!(feedPref as { enabled?: boolean } | null)?.enabled);
    setReady(true);
  }, [authStaff?.id]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Stack.Screen options={{ title: t('notificationPrefsShort'), headerBackTitle: t('back') }} />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.intro}>{t('notificationsSection')}</Text>
        <View style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.label}>{t('muteAllStaffMessages')}</Text>
            <Switch
              value={muteAllStaffMessages}
              disabled={!ready || !authStaff?.id || !allStaffConvId}
              onValueChange={async (v) => {
                if (!authStaff?.id || !allStaffConvId) return;
                const { error } = await staffSetConversationMuted(allStaffConvId, authStaff.id, v);
                if (error) Alert.alert(t('error'), error);
                else setMuteAllStaffMessages(v);
              }}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>
          <View style={[styles.row, styles.rowLast]}>
            <Text style={styles.label}>{t('muteFeedNotifications')}</Text>
            <Switch
              value={muteFeedNotifications}
              disabled={!ready || !authStaff?.id}
              onValueChange={async (v) => {
                if (!authStaff?.id) return;
                setMuteFeedNotifications(v);
                await supabase.from('notification_preferences').upsert(
                  {
                    staff_id: authStaff.id,
                    pref_key: 'mute_feed_notifications',
                    enabled: v,
                    updated_at: new Date().toISOString(),
                  },
                  { onConflict: 'staff_id,pref_key' }
                );
              }}
              trackColor={{ false: theme.colors.borderLight, true: theme.colors.primary }}
              thumbColor={theme.colors.surface}
            />
          </View>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: theme.colors.backgroundSecondary },
  content: { padding: theme.spacing.lg },
  intro: { fontSize: 14, color: theme.colors.textSecondary, marginBottom: theme.spacing.md, lineHeight: 20 },
  card: {
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: theme.colors.borderLight,
    ...theme.shadows.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.borderLight,
    gap: 12,
  },
  rowLast: { borderBottomWidth: 0 },
  label: { flex: 1, fontSize: 15, fontWeight: '600', color: theme.colors.text },
});
