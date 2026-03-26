-- Admin profil kenarlarında altın rengi gösterme ayarı
-- Admin kendi profilinden açıp kapatabilir; personel ve misafirler profil ziyaretinde bu kenarları görür.

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS show_gold_profile_border BOOLEAN DEFAULT false;

COMMENT ON COLUMN public.staff.show_gold_profile_border IS 'Admin profili ziyaret edildiğinde sol, sağ ve üst kenarlarda altın rengi çerçeve gösterilsin mi (sadece admin rolü için geçerli)';

-- get_staff_public_profile RPC: role ve show_gold_profile_border ekle
DROP FUNCTION IF EXISTS public.get_staff_public_profile(UUID);

CREATE OR REPLACE FUNCTION public.get_staff_public_profile(p_staff_id UUID)
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  department TEXT,
  "position" TEXT,
  profile_image TEXT,
  cover_image TEXT,
  bio TEXT,
  is_online BOOLEAN,
  hire_date DATE,
  average_rating NUMERIC,
  total_reviews INTEGER,
  specialties TEXT[],
  languages TEXT[],
  office_location TEXT,
  achievements TEXT[],
  show_phone_to_guest BOOLEAN,
  show_email_to_guest BOOLEAN,
  show_whatsapp_to_guest BOOLEAN,
  phone TEXT,
  email TEXT,
  whatsapp TEXT,
  verification_badge TEXT,
  shift_id UUID,
  profile_contact JSONB,
  role TEXT,
  show_gold_profile_border BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    s.id,
    s.full_name,
    s.department,
    s.position,
    s.profile_image,
    s.cover_image,
    s.bio,
    s.is_online,
    s.hire_date,
    s.average_rating,
    s.total_reviews,
    s.specialties,
    s.languages,
    s.office_location,
    s.achievements,
    s.show_phone_to_guest,
    s.show_email_to_guest,
    s.show_whatsapp_to_guest,
    s.phone,
    s.email,
    s.whatsapp,
    s.verification_badge,
    s.shift_id,
    jsonb_build_object(
      'phone', s.phone,
      'email', s.email,
      'whatsapp', s.whatsapp,
      'show_phone_to_guest', s.show_phone_to_guest,
      'show_email_to_guest', s.show_email_to_guest,
      'show_whatsapp_to_guest', s.show_whatsapp_to_guest
    ) AS profile_contact,
    s.role,
    s.show_gold_profile_border
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(UUID) TO authenticated;
