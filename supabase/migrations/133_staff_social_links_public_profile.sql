-- Misafir profilinde sosyal bağlantılar (staff.social_links JSONB) — RPC'ye ekle
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS social_links JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.staff.social_links IS 'Sosyal ağlar: instagram, facebook, linkedin, x (kullanıcı adı veya tam URL).';

DROP FUNCTION IF EXISTS public.get_staff_public_profile(uuid);

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
  evaluation_score smallint,
  evaluation_discipline smallint,
  evaluation_communication smallint,
  evaluation_speed smallint,
  evaluation_responsibility smallint,
  evaluation_insight text,
  social_links JSONB
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
    s.evaluation_score,
    s.evaluation_discipline,
    s.evaluation_communication,
    s.evaluation_speed,
    s.evaluation_responsibility,
    s.evaluation_insight,
    COALESCE(s.social_links, '{}'::jsonb)
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true;
$$;

GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO anon;
GRANT EXECUTE ON FUNCTION public.get_staff_public_profile(uuid) TO authenticated;
