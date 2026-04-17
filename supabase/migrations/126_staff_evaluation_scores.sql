-- Kurumsal personel değerlendirme skoru (0–100) ve alt metrikler; opsiyonel özet metin.
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS evaluation_score smallint
    CHECK (evaluation_score IS NULL OR (evaluation_score >= 0 AND evaluation_score <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_discipline smallint
    CHECK (evaluation_discipline IS NULL OR (evaluation_discipline >= 0 AND evaluation_discipline <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_communication smallint
    CHECK (evaluation_communication IS NULL OR (evaluation_communication >= 0 AND evaluation_communication <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_speed smallint
    CHECK (evaluation_speed IS NULL OR (evaluation_speed >= 0 AND evaluation_speed <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_responsibility smallint
    CHECK (evaluation_responsibility IS NULL OR (evaluation_responsibility >= 0 AND evaluation_responsibility <= 100)),
  ADD COLUMN IF NOT EXISTS evaluation_insight text;

COMMENT ON COLUMN public.staff.evaluation_score IS 'Genel kurumsal değerlendirme skoru (0–100).';
COMMENT ON COLUMN public.staff.evaluation_discipline IS 'Disiplin alt skoru (0–100).';
COMMENT ON COLUMN public.staff.evaluation_communication IS 'İletişim alt skoru (0–100).';
COMMENT ON COLUMN public.staff.evaluation_speed IS 'Hız alt skoru (0–100).';
COMMENT ON COLUMN public.staff.evaluation_responsibility IS 'Sorumluluk alt skoru (0–100).';
COMMENT ON COLUMN public.staff.evaluation_insight IS 'Tek cümlelik kurumsal özet (opsiyonel).';

-- RETURN TABLE değiştiği için önce kaldır (CREATE OR REPLACE yeterli değil)
DROP FUNCTION IF EXISTS public.get_staff_public_profile(uuid);

-- Müşteri profil RPC: yeni alanlar
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
  evaluation_insight text
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
    s.evaluation_insight
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true;
$$;
