import type { PostTagValue } from '@/lib/feedPostTags';

/** Etiket → sol bar + badge (max 2 ana vurgu: tip rengi + nötr metin) */
export function getPostTagVisual(tag: PostTagValue | string | null | undefined): {
  bar: string;
  badgeBg: string;
  badgeText: string;
  label: string;
  avatarGlow: string;
} {
  const t = (tag ?? 'diger').toString().toLowerCase();
  switch (t) {
    case 'sikayet':
      return {
        bar: '#ef4444',
        badgeBg: 'rgba(239,68,68,0.12)',
        badgeText: '#b91c1c',
        label: 'Şikayet',
        avatarGlow: 'rgba(239,68,68,0.35)',
      };
    case 'istek':
      return {
        bar: '#2563eb',
        badgeBg: 'rgba(37,99,235,0.12)',
        badgeText: '#1d4ed8',
        label: 'İstek',
        avatarGlow: 'rgba(37,99,235,0.35)',
      };
    case 'oneri':
      return {
        bar: '#7c3aed',
        badgeBg: 'rgba(124,58,237,0.12)',
        badgeText: '#6d28d9',
        label: 'Öneri',
        avatarGlow: 'rgba(124,58,237,0.35)',
      };
    case 'tesekkur':
      return {
        bar: '#16a34a',
        badgeBg: 'rgba(22,163,74,0.12)',
        badgeText: '#15803d',
        label: 'Teşekkür',
        avatarGlow: 'rgba(22,163,74,0.35)',
      };
    case 'soru':
      return {
        bar: '#d97706',
        badgeBg: 'rgba(217,119,6,0.12)',
        badgeText: '#b45309',
        label: 'Soru',
        avatarGlow: 'rgba(217,119,6,0.3)',
      };
    default:
      return {
        bar: '#64748b',
        badgeBg: 'rgba(100,116,139,0.12)',
        badgeText: '#475569',
        label: 'Diğer',
        avatarGlow: 'rgba(100,116,139,0.25)',
      };
  }
}
