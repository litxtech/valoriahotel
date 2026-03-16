import { create } from 'zustand';
import { supabase } from '@/lib/supabase';
import type { User } from '@supabase/supabase-js';

interface StaffProfile {
  id: string;
  auth_id: string;
  email: string;
  full_name: string | null;
  role: string;
  department: string | null;
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
    set({ loading: true });
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user ?? null;
    let staff: StaffProfile | null = null;
    if (user) {
      const { data } = await supabase
        .from('staff')
        .select('id, auth_id, email, full_name, role, department')
        .eq('auth_id', user.id)
        .single();
      staff = data ?? null;
    }
    set({ user, staff, loading: false });
  },

  signOut: async () => {
    await supabase.auth.signOut();
    set({ user: null, staff: null });
  },
}));
