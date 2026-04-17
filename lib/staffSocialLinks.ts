export const STAFF_SOCIAL_KEYS = ['instagram', 'facebook', 'linkedin', 'x'] as const;
export type StaffSocialKey = (typeof STAFF_SOCIAL_KEYS)[number];

export type StaffSocialLinksState = Record<StaffSocialKey, string>;

export function emptyStaffSocialLinks(): StaffSocialLinksState {
  return { instagram: '', facebook: '', linkedin: '', x: '' };
}

export function staffSocialLinksFromJson(raw: unknown): StaffSocialLinksState {
  const base = emptyStaffSocialLinks();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base;
  const o = raw as Record<string, unknown>;
  for (const k of STAFF_SOCIAL_KEYS) {
    const v = o[k];
    base[k] = typeof v === 'string' ? v.trim() : '';
  }
  return base;
}

export function staffSocialLinksToJson(state: StaffSocialLinksState): Record<string, string> | null {
  const out: Record<string, string> = {};
  for (const k of STAFF_SOCIAL_KEYS) {
    const t = state[k]?.trim() ?? '';
    if (t) out[k] = t;
  }
  return Object.keys(out).length ? out : null;
}

/** Misafir profilinde açılacak tam URL */
export function staffSocialOpenUrl(platform: StaffSocialKey, raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  const u = t.replace(/^@/, '').trim();
  if (!u) return null;
  switch (platform) {
    case 'instagram':
      return `https://instagram.com/${u.replace(/^instagram\.com\//i, '').replace(/^\//, '')}`;
    case 'facebook':
      return `https://facebook.com/${u.replace(/^facebook\.com\//i, '').replace(/^\//, '')}`;
    case 'linkedin':
      if (u.includes('linkedin.com')) return t.startsWith('http') ? t : `https://${u}`;
      return `https://www.linkedin.com/in/${u.replace(/^in\//i, '')}`;
    case 'x':
      return `https://x.com/${u.replace(/^x\.com\//i, '').replace(/^twitter\.com\//i, '')}`;
    default:
      return null;
  }
}
