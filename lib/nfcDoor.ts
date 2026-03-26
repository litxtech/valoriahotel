/**
 * NFC kapı etiketi okuma — Kapıdaki NFC etiketi okuyup oda/kapı bilgisini çıkarır.
 * Etiket formatları: valoria://door/102, room_102, 102
 */
import { Platform } from 'react-native';

// `react-native-nfc-manager` iOS build'lerinde NFC entitlement/capability gerektirir.
// App Store provisioning profile bu capability'i içermediğinde iOS production build kırılır.
// Bu yüzden native modülü dinamik import ediyoruz; modül yoksa NFC "kapalı" gibi davranır.
type NfcManagerLike = {
  setEventListener: (event: string, cb: ((tag: any) => void) | null) => void;
  unregisterTagEvent: () => Promise<void>;
  registerTagEvent: (opts: any) => Promise<void>;
  start: () => Promise<void>;
  isSupported: () => Promise<boolean>;
  isEnabled: () => Promise<boolean>;
};

type NdefLike = {
  uri: { decodePayload: (payload: Uint8Array) => string };
  text: { decodePayload: (payload: Uint8Array) => string };
};

async function getNfc(): Promise<{ NfcManager: NfcManagerLike; Ndef: NdefLike } | null> {
  if (Platform.OS === 'web') return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require('react-native-nfc-manager');
    const NfcManager = (mod?.default ?? mod) as NfcManagerLike;
    const Ndef = mod?.Ndef as NdefLike;
    if (!NfcManager || !Ndef) return null;
    return { NfcManager, Ndef };
  } catch {
    return null;
  }
}

/** Etiketten oda numarası veya kapı bilgisini çıkar */
export function parseRoomFromTagContent(content: string): string | null {
  const s = String(content || '').trim();
  if (!s) return null;

  // valoria://door/102 veya valoria://door?room=102
  const valoriaMatch = s.match(/valoria:\/\/door\/(\d+)/i) ?? s.match(/valoria:\/\/door[?&]room=(\d+)/i);
  if (valoriaMatch) return valoriaMatch[1];

  // https://.../door/102
  const urlMatch = s.match(/\/door\/(\d+)/i) ?? s.match(/[?&]room=(\d+)/i);
  if (urlMatch) return urlMatch[1];

  // room_102, door_102, oda_102
  const prefixMatch = s.match(/(?:room|door|oda)[_\-\s]*(\d+)/i);
  if (prefixMatch) return prefixMatch[1];

  // Sadece sayı (102)
  if (/^\d+$/.test(s)) return s;

  return null;
}

/** NDEF mesajından metin/URL çıkar */
function extractTextFromNdefMessage(
  Ndef: NdefLike,
  ndefMessage: Array<{ tnf: number; type?: string | number[]; payload?: number[] }>
): string[] {
  const results: string[] = [];
  if (!ndefMessage?.length) return results;

  try {
    for (const record of ndefMessage) {
      const payload = record.payload;
      if (!payload?.length) continue;

      const typeStr = typeof record.type === 'string' ? record.type : (Array.isArray(record.type) ? String.fromCharCode(...record.type) : '');
      const arr = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

      try {
        if (typeStr === 'U' || (record.tnf === 1 && typeStr !== 'T')) {
          const uri = Ndef.uri.decodePayload(arr);
          if (uri) results.push(uri);
        } else if (typeStr === 'T') {
          const text = Ndef.text.decodePayload(arr);
          if (text) results.push(text);
        } else if (record.tnf === 3 && record.type) {
          const uri = typeof record.type === 'string' ? record.type : String.fromCharCode(...(Array.isArray(record.type) ? record.type : []));
          if (uri) results.push(uri);
        }
      } catch {
        const str = String.fromCharCode(...Array.from(arr).filter((b) => b >= 32 && b < 127));
        if (str.length > 0) results.push(str);
      }
    }
  } catch {
    for (const record of ndefMessage) {
      if (record.payload?.length) {
        const str = String.fromCharCode(...(record.payload as number[]).filter((b) => b >= 32 && b < 127));
        if (str) results.push(str);
      }
    }
  }
  return results;
}

export type NfcReadResult = { room: string; raw: string } | { room: null; raw: string } | null;

/**
 * Otomatik NFC dinleyici başlat — ekran açıkken etikete yaklaşınca tetiklenir.
 * @returns stop() ile dinlemeyi durdur
 */
export function startAutoNfcDoorListener(onTag: (result: NfcReadResult) => void): { stop: () => void } {
  let stopped = false;
  let cleanup = () => {};

  const handler = (tag: { ndefMessage?: Array<{ tnf: number; type?: string | number[]; payload?: number[] }>; id?: string }) => {
    if (stopped) return;
    cleanup();
    const ndefMessage = tag?.ndefMessage;
    // `cleanup` ensures NFC module exists; if not, handler won't be attached.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const texts = (ndefMessage && (handler as any).__Ndef) ? extractTextFromNdefMessage((handler as any).__Ndef, ndefMessage) : [];
    const rawId = tag?.id ? (Array.isArray(tag.id) ? tag.id.map((b: number) => String.fromCharCode(b)).join('') : String(tag.id)) : '';
    const combined = texts.join(' ').trim() || rawId;
    const room = combined ? parseRoomFromTagContent(combined) : null;
    onTag(room ? { room, raw: combined } : { room: null, raw: combined });
  };

  void (async () => {
    const nfc = await getNfc();
    if (!nfc) {
      onTag(null);
      return;
    }
    (handler as any).__Ndef = nfc.Ndef;
    cleanup = () => {
      nfc.NfcManager.setEventListener('NfcManagerDiscoverTag', null);
      nfc.NfcManager.unregisterTagEvent().catch(() => {});
    };
    nfc.NfcManager.setEventListener('NfcManagerDiscoverTag', handler);
    nfc.NfcManager
      .start()
      .then(() => nfc.NfcManager.registerTagEvent({ alertMessage: 'Kapı etiketine yaklaştırın', invalidateAfterFirstRead: true }))
      .catch(() => onTag(null));
  })();

  return {
    stop: () => {
      stopped = true;
      cleanup();
    },
  };
}

/**
 * NFC etiketini oku, oda numarasını çıkar.
 * Kullanıcı "NFC ile kapı aç"a bastığında çağrılır.
 */
export async function readNfcTagForDoor(): Promise<NfcReadResult> {
  let cancelled = false;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      cancelled = true;
      void (async () => {
        const nfc = await getNfc();
        if (nfc) nfc.NfcManager.unregisterTagEvent().catch(() => {});
      })();
      resolve(null);
    }, 60000);

    const cleanup = () => {
      clearTimeout(timeout);
      void (async () => {
        const nfc = await getNfc();
        if (!nfc) return;
        nfc.NfcManager.setEventListener('NfcManagerDiscoverTag', null);
        nfc.NfcManager.unregisterTagEvent().catch(() => {});
      })();
    };

    const handler = (tag: { ndefMessage?: Array<{ tnf: number; type?: string | number[]; payload?: number[] }>; id?: string }) => {
      if (cancelled) return;
      cleanup();
      clearTimeout(timeout);

      const ndefMessage = tag?.ndefMessage;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const texts = (ndefMessage && (handler as any).__Ndef) ? extractTextFromNdefMessage((handler as any).__Ndef, ndefMessage) : [];
      const rawId = tag?.id ? (Array.isArray(tag.id) ? tag.id.map((b: number) => String.fromCharCode(b)).join('') : String(tag.id)) : '';
      const combined = texts.join(' ').trim() || rawId;

      const room = combined ? parseRoomFromTagContent(combined) : null;
      resolve(room ? { room, raw: combined } : { room: null, raw: combined });
    };

    void (async () => {
      const nfc = await getNfc();
      if (!nfc) {
        cleanup();
        resolve(null);
        return;
      }
      (handler as any).__Ndef = nfc.Ndef;
      nfc.NfcManager.setEventListener('NfcManagerDiscoverTag', handler);
      nfc.NfcManager
        .start()
        .then(() => nfc.NfcManager.registerTagEvent({ alertMessage: 'Kapı etiketine yaklaştırın', invalidateAfterFirstRead: true }))
        .catch(() => {
          cleanup();
          resolve(null);
        });
    })();
  });
}

/** NFC destekleniyor ve açık mı? */
export async function isNfcAvailable(): Promise<boolean> {
  try {
    const nfc = await getNfc();
    if (!nfc) return false;
    await nfc.NfcManager.start();
    const [supported, enabled] = await Promise.all([nfc.NfcManager.isSupported(), nfc.NfcManager.isEnabled()]);
    return !!(supported && enabled);
  } catch {
    return false;
  }
}
