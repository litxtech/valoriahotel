import { create } from 'zustand';
import type { LangCode } from '@/i18n';

export type Step = 'language' | 'contract' | 'form' | 'verify' | 'sign' | 'done';

interface GuestFlowState {
  step: Step;
  qrToken: string | null;
  roomId: string | null;
  roomNumber: string | null;
  lang: LangCode;
  guestId: string | null;
  setStep: (s: Step) => void;
  setQR: (token: string, roomId: string, roomNumber: string) => void;
  setLang: (l: LangCode) => void;
  setGuestId: (id: string | null) => void;
  reset: () => void;
}

const initialState = {
  step: 'language' as Step,
  qrToken: null as string | null,
  roomId: null as string | null,
  roomNumber: null as string | null,
  lang: 'tr' as LangCode,
  guestId: null as string | null,
};

export const useGuestFlowStore = create<GuestFlowState>((set) => ({
  ...initialState,
  setStep: (step) => set({ step }),
  setQR: (qrToken, roomId, roomNumber) => set({ qrToken, roomId, roomNumber }),
  setLang: (lang) => set({ lang }),
  setGuestId: (guestId) => set({ guestId }),
  reset: () => set(initialState),
}));
