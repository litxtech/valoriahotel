/**
 * Yeni feed gönderisi sonrası tüm aktif personele (admin dahil) in-app + Expo push bildirimi.
 * Gönderi sahibi personel ise kendisi hariç tutulur.
 */
import { supabase } from '@/lib/supabase';
import { log } from '@/lib/logger';

export async function notifyStaffOfNewFeedPost(params: {
  postId: string;
  authorDisplayName: string;
  titlePreview?: string | null;
  excludeStaffId?: string | null;
  createdByStaffId?: string | null;
}): Promise<void> {
  const { postId, authorDisplayName, titlePreview, excludeStaffId, createdByStaffId } = params;
  const name = (authorDisplayName ?? '').trim() || 'Bir kullanıcı';
  const snippet = (titlePreview ?? '').trim();
  const bodyMain = `${name} yeni bir gönderi paylaştı`;
  const body =
    snippet.length > 0
      ? `${bodyMain}: ${snippet.slice(0, 80)}${snippet.length > 80 ? '…' : ''}`
      : bodyMain;
  const notifTitle = 'Yeni gönderi';
  const notifData = { screen: 'staff_feed', url: '/staff/feed', postId };

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    const { data: staffRows } = await supabase.from('staff').select('id').eq('is_active', true);
    const allStaffIds = (staffRows ?? []).map((r: { id: string }) => r.id);
    const staffIdsToNotify = excludeStaffId
      ? allStaffIds.filter((id) => id !== excludeStaffId)
      : allStaffIds;
    if (staffIdsToNotify.length === 0) return;

    await supabase.from('notifications').insert(
      staffIdsToNotify.map((staffId) => ({
        staff_id: staffId,
        title: notifTitle,
        body,
        category: 'staff',
        notification_type: 'feed_post',
        data: { postId, url: '/staff/feed' },
        created_by: createdByStaffId ?? null,
        sent_via: 'both',
        sent_at: new Date().toISOString(),
      }))
    );

    const { error: pushFnError } = await supabase.functions.invoke('send-expo-push', {
      body: {
        staffIds: staffIdsToNotify,
        title: notifTitle,
        body,
        data: notifData,
      },
      ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
    });
    if (pushFnError) log.warn('notifyNewFeedPost', 'send-expo-push', pushFnError);
  } catch (e) {
    log.warn('notifyNewFeedPost', e);
  }
}

/** Müşteri görünür feed gönderilerinde diğer misafirlere in-app + push (Edge Function, service role). */
export async function notifyGuestsOfNewFeedPost(postId: string): Promise<void> {
  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;
    if (!token) {
      log.warn('notifyGuestsOfNewFeedPost', 'oturum yok');
      return;
    }
    const { data, error } = await supabase.functions.invoke('notify-guests-new-feed-post', {
      body: { postId },
      headers: { Authorization: `Bearer ${token}` },
    });
    if (error) log.warn('notifyGuestsOfNewFeedPost', 'invoke', error);
    else if (data && typeof data === 'object' && 'error' in data && (data as { error?: string }).error) {
      log.warn('notifyGuestsOfNewFeedPost', (data as { error: string }).error);
    }
  } catch (e) {
    log.warn('notifyGuestsOfNewFeedPost', e);
  }
}
