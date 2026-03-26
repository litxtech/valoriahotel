/**
 * Admin tarafından paylaşılan uygulama ve web sitesi linkleri.
 * Personel ve misafir dahil herkes görebilir.
 */
import { supabase } from '@/lib/supabase';

export type AppLinkType = 'app' | 'website';
export type AppLinkIconType = 'app_store' | 'google_play' | 'globe' | 'custom';

export type AdminAppLink = {
  id: string;
  type: AppLinkType;
  name: string;
  url: string;
  icon_type: AppLinkIconType;
  icon_url: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type AdminAppLinkInsert = Omit<AdminAppLink, 'id' | 'created_at' | 'updated_at'>;

/** Tüm linkleri listele (herkes okuyabilir) */
export async function listAdminAppLinks(): Promise<AdminAppLink[]> {
  const { data, error } = await supabase
    .from('admin_app_links')
    .select('*')
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []) as AdminAppLink[];
}

/** Admin: link ekle */
export async function insertAdminAppLink(row: AdminAppLinkInsert): Promise<AdminAppLink> {
  const { data, error } = await supabase
    .from('admin_app_links')
    .insert({
      type: row.type,
      name: row.name,
      url: row.url,
      icon_type: row.icon_type,
      icon_url: row.icon_url ?? null,
      sort_order: row.sort_order ?? 0,
      updated_at: new Date().toISOString(),
    })
    .select()
    .single();
  if (error) throw error;
  return data as AdminAppLink;
}

/** Admin: link güncelle */
export async function updateAdminAppLink(
  id: string,
  updates: Partial<Pick<AdminAppLink, 'type' | 'name' | 'url' | 'icon_type' | 'icon_url' | 'sort_order'>>
): Promise<AdminAppLink> {
  const { data, error } = await supabase
    .from('admin_app_links')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as AdminAppLink;
}

/** Admin: link sil */
export async function deleteAdminAppLink(id: string): Promise<void> {
  const { error } = await supabase.from('admin_app_links').delete().eq('id', id);
  if (error) throw error;
}
