/** Personel görev atamaları — ortak etiketler (admin + personel ekranları) */

export const ASSIGNMENT_TASK_LABELS: Record<string, string> = {
  reception: 'Resepsiyon',
  housekeeping: 'Temizlik',
  technical: 'Teknik',
  security: 'Güvenlik',
  general: 'Genel',
};

export const ASSIGNMENT_PRIORITY_LABELS: Record<string, string> = {
  low: 'Düşük',
  normal: 'Normal',
  high: 'Yüksek',
  urgent: 'Acil',
};

export const ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'Bekliyor',
  in_progress: 'Devam ediyor',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
};

export const STAFF_ROLE_LABELS: Record<string, string> = {
  admin: 'Admin',
  reception_chief: 'Resepsiyon şefi',
  receptionist: 'Resepsiyon',
  housekeeping: 'Temizlik',
  technical: 'Teknik',
  security: 'Güvenlik',
  staff: 'Personel',
};
