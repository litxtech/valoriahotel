/**
 * Ortak medya yükleme yardımcıları.
 * URI veya data URI üzerinden ArrayBuffer'a çevirir. Android content:// ve base64 güvenli.
 * SDK 54+ için readAsStringAsync legacy API kullanılır.
 * Android content:// için copyAsync ile cache'e kopyalama fallback'i vardır.
 */
import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import { decode } from 'base64-arraybuffer';

/** Data URI (data:image/jpeg;base64,...) içindeki base64 kısmını çıkarır ve decode eder. */
function dataUriToArrayBuffer(uri: string): ArrayBuffer {
  const comma = uri.indexOf(',');
  if (comma === -1) {
    console.warn('[uploadMedia] dataUri: virgül yok');
    throw new Error('Geçersiz data URI');
  }
  const base64 = uri.slice(comma + 1).trim();
  if (!base64) throw new Error('Data URI içinde base64 bulunamadı');
  return decode(base64);
}

/** Yerel (file://, content://), data URI veya uzak URI'yi ArrayBuffer'a çevirir. */
export async function uriToArrayBuffer(uri: string): Promise<ArrayBuffer> {
  const normalized = (uri || '').trim();
  if (!normalized) throw new Error('URI boş');

  if (normalized.startsWith('data:')) {
    return dataUriToArrayBuffer(normalized);
  }

  if (normalized.startsWith('file://') || normalized.startsWith('content://')) {
    const encoding = (FileSystem.EncodingType && (FileSystem.EncodingType as Record<string, string>).Base64) ?? 'base64';
    let uriToRead = normalized;

    if (Platform.OS === 'android' && normalized.startsWith('content://')) {
      try {
        const ext = normalized.includes('.mp4') || normalized.includes('video') ? '.mp4' : '.jpg';
        const tempPath = `${FileSystem.cacheDirectory}upload_temp_${Date.now()}${ext}`;
        await FileSystem.copyAsync({ from: normalized, to: tempPath });
        uriToRead = tempPath;
      } catch (e) {
        console.warn('[uploadMedia] content:// copyAsync hatası, doğrudan okumayı deniyoruz:', (e as Error)?.message);
      }
    }

    try {
      const base64 = await FileSystem.readAsStringAsync(uriToRead, {
        encoding: encoding as 'base64',
      });
      if (uriToRead !== normalized) {
        await FileSystem.deleteAsync(uriToRead, { idempotent: true });
      }
      if (typeof base64 !== 'string' || !base64) {
        throw new Error('Dosya okunamadı');
      }
      return decode(base64);
    } catch (e1) {
      if (uriToRead !== normalized) {
        try { await FileSystem.deleteAsync(uriToRead, { idempotent: true }); } catch (_) {}
      }
      console.warn('[uploadMedia] FileSystem.readAsStringAsync hatası:', (e1 as Error)?.message);
      try {
        const response = await fetch(normalized);
        const blob = await response.blob();
        return await new Response(blob).arrayBuffer();
      } catch (e2) {
        console.error('[uploadMedia] fetch fallback hatası:', (e2 as Error)?.message);
        throw new Error('Medya okunamadı. Lütfen dosyayı tekrar seçin.');
      }
    }
  }

  const response = await fetch(normalized);
  const blob = await response.blob();
  return await new Response(blob).arrayBuffer();
}

/** URI veya dosya adından MIME ve uzantı tahmini. */
export function getMimeAndExt(
  uriOrFileName: string,
  kind: 'image' | 'video' | 'audio' = 'image'
): { mime: string; ext: string } {
  const lower = uriOrFileName.toLowerCase();
  if (lower.startsWith('data:')) {
    const semicolon = uriOrFileName.indexOf(';');
    if (semicolon > 5) {
      const mime = lower.slice(5, semicolon).trim();
      if (mime.startsWith('image/')) {
        const subtype = mime.slice(6).split('+')[0];
        const extMap: Record<string, string> = { png: 'png', jpeg: 'jpg', jpg: 'jpg', webp: 'webp', gif: 'gif' };
        return { mime: mime.includes('jpeg') ? 'image/jpeg' : mime, ext: extMap[subtype] ?? 'jpg' };
      }
      if (mime.startsWith('video/')) return { mime: 'video/mp4', ext: 'mp4' };
    }
  }
  if (kind === 'video' || lower.includes('.mp4') || lower.includes('video')) {
    return { mime: 'video/mp4', ext: 'mp4' };
  }
  if (kind === 'audio' || lower.includes('.m4a') || lower.includes('audio')) {
    return { mime: 'audio/m4a', ext: 'm4a' };
  }
  if (lower.includes('.png')) return { mime: 'image/png', ext: 'png' };
  if (lower.includes('.webp')) return { mime: 'image/webp', ext: 'webp' };
  return { mime: 'image/jpeg', ext: 'jpg' };
}
