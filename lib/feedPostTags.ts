/** Paylaşım etiketleri - şikayet, istek, öneri vb. */
export const POST_TAGS = [
  { value: 'sikayet', label: 'Şikayet' },
  { value: 'istek', label: 'İstek' },
  { value: 'oneri', label: 'Öneri' },
  { value: 'tesekkur', label: 'Teşekkür' },
  { value: 'soru', label: 'Soru' },
  { value: 'diger', label: 'Diğer' },
] as const;

export type PostTagValue = (typeof POST_TAGS)[number]['value'] | null;
