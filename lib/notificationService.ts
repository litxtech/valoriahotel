/**
 * Valoria Hotel - Bildirim gönderme servisi
 * In-app kayıt + Expo Push (Edge Function) ile cihaza push gönderir.
 */
import { supabase } from '@/lib/supabase';
import type { BulkGuestTarget, BulkStaffTarget, BulkCategory } from '@/lib/notifications';
import { log } from '@/lib/logger';

const EDGE_FN_PUSH = 'send-expo-push';
const EDGE_FN_NOTIFY_ADMINS = 'notify-admins';
const EDGE_FN_NOTIFY_CONV_RECIPIENTS = 'notify-conversation-recipients';

/** Push token’ları olan hedeflere Expo push gönderir (sessiz hata). */
async function sendExpoPushToRecipients(params: {
  guestIds?: string[];
  staffIds?: string[];
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<void> {
  const { guestIds = [], staffIds = [], title, body, data } = params;
  if (guestIds.length === 0 && staffIds.length === 0) return;
  try {
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_PUSH, {
      body: { guestIds, staffIds, title, body, data },
    });
    if (error) {
      log.warn('notificationService', 'sendExpoPush', error);
      return;
    }
    const r = result as { sent?: number; failed?: number } | null;
    if (r?.sent != null) log.info('notificationService', 'push gönderildi', { sent: r.sent, failed: r.failed ?? 0 });
  } catch (e) {
    log.warn('notificationService', 'sendExpoPush exception', e);
  }
}

export interface SendNotificationParams {
  guestId?: string | null;
  staffId?: string | null;
  title: string;
  body?: string | null;
  notificationType?: string | null;
  category?: 'emergency' | 'guest' | 'staff' | 'admin' | 'bulk';
  data?: Record<string, unknown>;
  createdByStaffId?: string | null;
}

/** Tekil bildirim gönder */
export async function sendNotification(params: SendNotificationParams): Promise<{ id?: string; error?: string }> {
  const { guestId, staffId, title, body, notificationType, category, data, createdByStaffId } = params;
  if (!guestId && !staffId) return { error: 'guestId veya staffId gerekli' };

  const { data: row, error } = await supabase
    .from('notifications')
    .insert({
      guest_id: guestId ?? null,
      staff_id: staffId ?? null,
      title,
      body: body ?? null,
      notification_type: notificationType ?? null,
      category: category ?? 'bulk',
      data: data ?? {},
      created_by: createdByStaffId ?? null,
      sent_via: 'both',
      sent_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) return { error: error.message };
  const staffIds = staffId ? [typeof staffId === 'string' ? staffId : String(staffId)] : [];
  const guestIds = guestId ? [typeof guestId === 'string' ? guestId : String(guestId)] : [];
  if (guestIds.length > 0 || staffIds.length > 0) {
    try {
      await sendExpoPushToRecipients({
        guestIds: guestIds.length ? guestIds : undefined,
        staffIds: staffIds.length ? staffIds : undefined,
        title,
        body,
        data,
      });
    } catch (e) {
      log.warn('notificationService', 'push after sendNotification', e);
    }
  }
  return { id: row?.id };
}

/** Tüm misafirlere toplu bildirim (hedefe göre filtre) */
export async function sendBulkToGuests(params: {
  target: BulkGuestTarget;
  roomNumbers?: string[];
  title: string;
  body: string;
  category: BulkCategory;
  createdByStaffId: string;
}): Promise<{ count: number; error?: string }> {
  const { target, roomNumbers, title, body, category, createdByStaffId } = params;

  const selectFields = target === 'long_stay' ? 'id, check_in_at, check_out_at' : 'id';
  let query = supabase
    .from('guests')
    .select(selectFields)
    .in('status', ['pending', 'checked_in']);

  const today = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);

  if (target === 'checkin_today') {
    query = query.not('check_in_at', 'is', null);
    query = query.gte('check_in_at', `${today}T00:00:00.000Z`).lte('check_in_at', `${today}T23:59:59.999Z`);
  } else if (target === 'checkout_tomorrow') {
    query = query.not('check_out_at', 'is', null);
    query = query.gte('check_out_at', `${tomorrow}T00:00:00.000Z`).lte('check_out_at', `${tomorrow}T23:59:59.999Z`);
  } else if (target === 'specific_rooms' && roomNumbers?.length) {
    const { data: rooms } = await supabase.from('rooms').select('id').in('room_number', roomNumbers);
    const ids = (rooms ?? []).map((r: { id: string }) => r.id);
    if (ids.length) query = query.in('room_id', ids);
    else return { count: 0 };
  }

  const { data: guests, error: fetchError } = await query;
  if (fetchError) return { count: 0, error: fetchError.message };
  let list = guests ?? [];

  if (target === 'long_stay') {
    list = list.filter((g: { check_in_at?: string | null; check_out_at?: string | null }) => {
      const ci = g.check_in_at ? new Date(g.check_in_at).getTime() : 0;
      const co = g.check_out_at ? new Date(g.check_out_at).getTime() : 0;
      if (!ci || !co) return false;
      const nights = (co - ci) / 86400000;
      return nights >= 3;
    });
  }
  if (list.length === 0) return { count: 0 };

  const rows = list.map((g: { id: string }) => ({
    guest_id: g.id,
    staff_id: null,
    title,
    body,
    category: 'bulk',
    notification_type: `bulk_${category}`,
    data: {},
    created_by: createdByStaffId,
    sent_via: 'in_app',
    sent_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) return { count: 0, error: insertError.message };
  const guestIds = list.map((g: { id: string }) => g.id);
  sendExpoPushToRecipients({ guestIds, title, body, data: { screen: 'notifications' } }).catch(() => {});
  return { count: rows.length };
}

/** Personele toplu bildirim (departman/rol filtresi) */
export async function sendBulkToStaff(params: {
  target: BulkStaffTarget;
  title?: string;
  body: string;
  createdByStaffId: string;
}): Promise<{ count: number; error?: string }> {
  const { target, title: titleParam, body, createdByStaffId } = params;
  const title = (titleParam && titleParam.trim()) || 'Toplu Duyuru';

  let query = supabase.from('staff').select('id').eq('is_active', true);

  const roleMap: Record<BulkStaffTarget, string[] | null> = {
    all_staff: null,
    housekeeping: ['housekeeping'],
    technical: ['technical'],
    reception: ['reception_chief', 'receptionist'],
    security: ['security'],
  };
  const roles = roleMap[target];
  if (roles?.length) query = query.in('role', roles);

  const { data: staffList, error: fetchError } = await query;
  if (fetchError) return { count: 0, error: fetchError.message };
  const list = staffList ?? [];
  if (list.length === 0) return { count: 0 };

  const rows = list.map((s: { id: string }) => ({
    guest_id: null,
    staff_id: s.id,
    title,
    body,
    category: 'bulk',
    notification_type: 'bulk_staff',
    data: {},
    created_by: createdByStaffId,
    sent_via: 'in_app',
    sent_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) return { count: 0, error: insertError.message };
  const staffIds = list.map((s: { id: string }) => s.id);
  sendExpoPushToRecipients({
    staffIds,
    title,
    body,
    data: { screen: 'notifications' },
  }).catch(() => {});
  return { count: rows.length };
}

/** Sohbet mesajı sonrası konuşmadaki alıcılara (gönderen hariç) sesli push bildirimi gönder. */
export async function notifyConversationRecipients(params: {
  conversationId: string;
  excludeAppToken?: string | null;
  excludeStaffId?: string | null;
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<{ sent?: number; failed?: number; error?: string }> {
  const { conversationId, excludeAppToken, excludeStaffId, title, body, data } = params;
  if (!conversationId || !title?.trim()) return { error: 'conversationId ve title gerekli' };
  try {
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_NOTIFY_CONV_RECIPIENTS, {
      body: {
        conversationId,
        excludeAppToken: excludeAppToken ?? undefined,
        excludeStaffId: excludeStaffId ?? undefined,
        title: title.trim(),
        body: body ?? null,
        data: data ?? {},
      },
    });
    if (error) {
      log.warn('notificationService', 'notifyConversationRecipients', error);
      return { error: error.message };
    }
    const r = result as { sent?: number; failed?: number } | null;
    if (r?.sent != null) log.info('notificationService', 'mesaj push', { sent: r.sent, failed: r.failed ?? 0 });
    return { sent: r?.sent, failed: r?.failed };
  } catch (e) {
    log.warn('notificationService', 'notifyConversationRecipients exception', e);
    return { error: (e as Error).message };
  }
}

/** Tüm admin hesaplarına (açık olan telefona) push bildirimi gönder. Panel bildirimleri için kullanın. */
export async function notifyAdmins(params: {
  title: string;
  body?: string | null;
  data?: Record<string, unknown>;
}): Promise<{ sent?: number; failed?: number; error?: string }> {
  const { title, body, data } = params;
  if (!title?.trim()) return { error: 'title gerekli' };
  try {
    const { data: result, error } = await supabase.functions.invoke(EDGE_FN_NOTIFY_ADMINS, {
      body: { title: title.trim(), body: body ?? null, data: data ?? {} },
    });
    if (error) {
      log.warn('notificationService', 'notifyAdmins', error);
      return { error: error.message };
    }
    const r = result as { sent?: number; failed?: number } | null;
    if (r?.sent != null) log.info('notificationService', 'admin push', { sent: r.sent, failed: r.failed ?? 0 });
    return { sent: r?.sent, failed: r?.failed };
  } catch (e) {
    log.warn('notificationService', 'notifyAdmins exception', e);
    return { error: (e as Error).message };
  }
}

/** Acil durum: tüm checked_in misafirlere gönder */
export async function sendEmergencyToAllGuests(params: {
  notificationType: string;
  title: string;
  body: string;
  createdByStaffId?: string | null;
}): Promise<{ count: number; error?: string }> {
  const { data: guests, error: fetchError } = await supabase
    .from('guests')
    .select('id')
    .eq('status', 'checked_in');
  if (fetchError) return { count: 0, error: fetchError.message };
  const list = guests ?? [];
  if (list.length === 0) return { count: 0 };

  const rows = list.map((g: { id: string }) => ({
    guest_id: g.id,
    staff_id: null,
    title: params.title,
    body: params.body,
    category: 'emergency',
    notification_type: params.notificationType,
    data: {},
    created_by: params.createdByStaffId ?? null,
    sent_via: 'both',
    sent_at: new Date().toISOString(),
  }));

  const { error: insertError } = await supabase.from('notifications').insert(rows);
  if (insertError) return { count: 0, error: insertError.message };
  const guestIds = list.map((g: { id: string }) => g.id);
  sendExpoPushToRecipients({
    guestIds,
    title: params.title,
    body: params.body,
    data: { screen: 'notifications', category: 'emergency' },
  }).catch(() => {});
  return { count: rows.length };
}
