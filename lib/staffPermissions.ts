/**
 * staff.app_permissions ve role ile yetki kontrolleri.
 * DB RLS (ör. staff_assignments) ile uyumlu olmalı.
 */

export type StaffPermissionSlice = {
  role?: string | null;
  app_permissions?: Record<string, boolean> | null;
} | null | undefined;

/** Tam yönetim paneli shell’i (admin veya görev atama yetkisi). */
export function canAccessAdminShell(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return true;
  return staff.app_permissions?.gorev_ata === true;
}

/** Sadece görev ekranlarına izin verilen personel (admin değil, gorev_ata var). */
export function isGorevAtaOnlyUser(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin') return false;
  return staff.app_permissions?.gorev_ata === true;
}

/** Görev oluşturma (insert) — admin veya gorev_ata. */
export function canStaffCreateAssignments(staff: StaffPermissionSlice): boolean {
  return canAccessAdminShell(staff);
}

/** Referanslı satış / komisyon modülü (personel uygulaması + admin listesi için). */
export function canAccessReservationSales(staff: StaffPermissionSlice): boolean {
  if (!staff) return false;
  if (staff.role === 'admin' || staff.role === 'reception_chief') return true;
  return staff.app_permissions?.satis_komisyon === true;
}
