import { supabase } from '@/lib/supabase';

const STAFF_SELECT_BASE =
  'id, full_name, department, position, profile_image, cover_image, bio, specialties, languages, is_online, hire_date, average_rating, total_reviews, office_location, achievements, verification_badge, shift_id, role, phone, email, whatsapp, show_phone_to_guest, show_email_to_guest, show_whatsapp_to_guest, app_permissions';

const STAFF_SELECT_FULL = `${STAFF_SELECT_BASE}, evaluation_score, evaluation_discipline, evaluation_communication, evaluation_speed, evaluation_responsibility, evaluation_insight`;

function shouldRetryWithoutEvalColumns(err: { message?: string; code?: string } | null): boolean {
  if (!err) return false;
  const m = String(err.message ?? '');
  return (
    m.includes('evaluation_score') ||
    m.includes('does not exist') ||
    m.includes('schema cache') ||
    err.code === '42703'
  );
}

/** Personel başka personeli görüntülerken; evaluation sütunları yoksa otomatik düşer. */
export async function loadStaffProfileForViewer(staffId: string) {
  let res = await supabase
    .from('staff')
    .select(STAFF_SELECT_FULL)
    .eq('id', staffId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .maybeSingle();

  if (res.error && shouldRetryWithoutEvalColumns(res.error)) {
    res = await supabase
      .from('staff')
      .select(STAFF_SELECT_BASE)
      .eq('id', staffId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .maybeSingle();
  }

  return res;
}

/** Kendi profil sekmesi; is_active filtresi yok, evaluation sütunları yoksa düşer. */
export async function loadStaffProfileSelf(staffId: string) {
  let res = await supabase.from('staff').select(STAFF_SELECT_FULL).eq('id', staffId).single();

  if (res.error && shouldRetryWithoutEvalColumns(res.error)) {
    res = await supabase.from('staff').select(STAFF_SELECT_BASE).eq('id', staffId).single();
  }

  return res;
}
