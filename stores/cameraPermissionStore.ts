import { create } from 'zustand';
import { staffHasCameraAccess } from '@/lib/cameras';

type State = {
  hasAccess: boolean | null;
  refresh: (staffId: string, isAdmin: boolean) => Promise<void>;
};

export const useCameraPermissionStore = create<State>((set) => ({
  hasAccess: null,
  refresh: async (staffId: string, isAdmin: boolean) => {
    try {
      if (isAdmin) {
        set({ hasAccess: true });
        return;
      }
      const has = await staffHasCameraAccess(staffId);
      set({ hasAccess: has });
    } catch {
      set({ hasAccess: false });
    }
  },
}));
