/**
 * Admin panelde bir kachela (Sözleşmeler, Onay bekleyenler vb.) tıklandığında
 * o anki sayı "görüldü" kabul edilir; badge bir süre gösterilmez (yeni gelenler tekrar görünür).
 */
import { create } from 'zustand';

type BadgeKey = 'acceptancesUnassigned' | 'stockPending' | 'staffPending' | 'reportsPending' | 'unreadNotifs' | 'messagesUnread';

type State = {
  dismissed: Partial<Record<BadgeKey, number>>;
  setDismissed: (key: BadgeKey, count: number) => void;
  getEffectiveBadge: (key: BadgeKey, currentCount: number) => number;
};

export const useAdminBadgeDismissedStore = create<State>((set, get) => ({
  dismissed: {},

  setDismissed: (key, count) => {
    set((s) => ({ dismissed: { ...s.dismissed, [key]: count } }));
  },

  getEffectiveBadge: (key, currentCount) => {
    const d = get().dismissed[key];
    if (d == null) return currentCount;
    return Math.max(0, currentCount - d);
  },
}));
