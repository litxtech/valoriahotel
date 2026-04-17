import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';
import { log } from '@/lib/logger';
import { savePushTokenForStaff } from '@/lib/notificationsPush';

interface StaffProfile {
  id: string;
  auth_id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
  profile_image?: string | null;
  work_status?: string | null;
  banned_until?: string | null;
  deleted_at?: string | null;
  /** Admin panelinde checkbox ile verilen yetkiler (gorev_ata vb.) */
  app_permissions?: Record<string, boolean> | null;
  /** Valoria / Bavul Suite / Bavultur vb. */
  organization_id: string;
  organization?: { name: string; slug?: string | null; kind?: string | null } | null;
}

interface AuthState {
  user: User | null;
  staff: StaffProfile | null;
  loading: boolean;
  setUser: (u: User | null) => void;
  setStaff: (s: StaffProfile | null) => void;
  loadSession: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  staff: null,
  loading: true,

  setUser: (user) => set({ user }),
  setStaff: (staff) => set({ staff }),

  loadSession: async () => {
    // Zaten oturum varsa loading true yapma; sayfa geçişlerinde lobi flash'ını önler
    const hadSession = !!get().user || !!get().staff;
    if (!hadSession) set({ loading: true });
    log.info('authStore', 'loadSession başladı');
    try {
      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) {
        log.error('authStore', 'getSession hatası', sessionError);
        set({ user: null, staff: null, loading: false });
        return;
      }
      const user = session?.user ?? null;
      log.info('authStore', 'session', { hasUser: !!user, userId: user?.id?.slice(0, 8) });

      let staff: StaffProfile | null = null;
      if (user) {
        const { data, error: staffError } = await supabase
          .from('staff')
          .select(
            'id, auth_id, email, full_name, role, department, profile_image, work_status, is_active, banned_until, deleted_at, app_permissions, organization_id, organization:organization_id(name, slug, kind)'
          )
          .eq('auth_id', user.id)
          .maybeSingle();
        if (staffError) {
          log.warn('authStore', 'staff fetch hatası (oturum korunur)', staffError.message, staffError.code);
        } else {
          const row = data as (StaffProfile & { is_active?: boolean }) | null;
          if (!row) {
            staff = null;
            log.info('authStore', 'staff yok, müşteri oturumu korunuyor');
          } else {
            const perms =
              typeof row.app_permissions === 'object' && row.app_permissions !== null && !Array.isArray(row.app_permissions)
                ? (row.app_permissions as Record<string, boolean>)
                : null;
            const org = (row as { organization?: { name?: string; slug?: string | null; kind?: string | null } | null }).organization;
            staff = {
              id: row.id,
              auth_id: row.auth_id,
              email: row.email,
              full_name: row.full_name,
              role: row.role,
              department: row.department,
              profile_image: row.profile_image,
              work_status: row.work_status,
              banned_until: row.banned_until,
              deleted_at: row.deleted_at,
              app_permissions: perms,
              organization_id: (row as { organization_id: string }).organization_id,
              organization: org?.name
                ? { name: org.name, slug: org.slug ?? undefined, kind: org.kind ?? undefined }
                : null,
            };
            if (row.deleted_at) log.info('authStore', 'staff silinmiş, lobiye yönlendirilecek');
            else if (row.banned_until && new Date(row.banned_until) > new Date()) log.info('authStore', 'staff banlı, lobiye yönlendirilecek');
            else if (row.is_active === false) staff = null;
            else if (!row.deleted_at && (!row.banned_until || new Date(row.banned_until) <= new Date()))
              savePushTokenForStaff(row.id).catch((e) => log.warn('authStore', 'push token kaydı', e));
          }
        }
        if (staff) {
          log.info('authStore', 'staff', { hasStaff: true });
          savePushTokenForStaff(staff.id).catch((e) => log.warn('authStore', 'push token kaydı', e));
        }
      }

      set({ user, staff, loading: false });
      log.info('authStore', 'loadSession bitti', { loading: false });
    } catch (e) {
      log.error('authStore', 'loadSession exception', e);
      set({ loading: false });
    }
  },

  signOut: async () => {
    log.info('authStore', 'signOut');
    try {
      await supabase.auth.signOut();
      set({ user: null, staff: null });
    } catch (e) {
      log.error('authStore', 'signOut hatası', e);
    }
  },
}));

/** Uygulama açılışında bir kez çağır: auth state dinleyicisi + ilk oturum yüklemesi. Kalıcı oturum için. */
export function initAuthListener() {
  const { loadSession } = useAuthStore.getState();
  loadSession();
  return supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT') {
      useAuthStore.setState({ user: null, staff: null });
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      loadSession();
    }
  });
}
