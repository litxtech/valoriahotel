-- Admin tarafından silinen kullanıcılar her yerden kaldırılsın.
-- messaging_list_staff_for_guest: anon/misafir yeni sohbet ekranında silinen personel listede görünmesin.

DROP FUNCTION IF EXISTS public.messaging_list_staff_for_guest();

CREATE FUNCTION public.messaging_list_staff_for_guest()
RETURNS TABLE(
  id UUID,
  full_name TEXT,
  department TEXT,
  profile_image TEXT,
  is_online BOOLEAN,
  role TEXT,
  verification_badge TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.full_name, s.department, s.profile_image, s.is_online, s.role, s.verification_badge
  FROM public.staff s
  WHERE s.is_active = true
    AND s.deleted_at IS NULL
  ORDER BY s.full_name;
END;
$$;

COMMENT ON FUNCTION public.messaging_list_staff_for_guest() IS
  'Misafir yeni sohbet: silinen personel hariç liste. deleted_at NULL olanlar.';

-- messaging_list_conversations_guest: Silinen personel ile direct sohbetler listede görünmesin.
CREATE OR REPLACE FUNCTION public.messaging_list_conversations_guest(p_app_token TEXT)
RETURNS TABLE(
  id UUID,
  type VARCHAR(20),
  name VARCHAR(255),
  avatar TEXT,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT,
  unread_count BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_created_at TIMESTAMPTZ;
BEGIN
  SELECT g.id, g.created_at INTO v_guest_id, v_guest_created_at
  FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN; END IF;
  IF v_guest_created_at IS NULL THEN
    v_guest_created_at := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.type,
    CASE
      WHEN c.type = 'direct' THEN (
        SELECT COALESCE(NULLIF(TRIM(s.full_name), ''), 'Personel')
        FROM public.conversation_participants cp
        JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin') AND s.deleted_at IS NULL
        WHERE cp.conversation_id = c.id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
        LIMIT 1
      )
      ELSE c.name
    END,
    CASE
      WHEN c.type = 'direct' THEN (
        SELECT s.profile_image
        FROM public.conversation_participants cp
        JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin') AND s.deleted_at IS NULL
        WHERE cp.conversation_id = c.id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
        LIMIT 1
      )
      ELSE c.avatar
    END,
    c.last_message_at,
    (SELECT m.content FROM public.messages m
     WHERE m.id = c.last_message_id AND m.message_type = 'text' AND NOT m.is_deleted
       AND m.created_at >= v_guest_created_at
     LIMIT 1),
    (SELECT COUNT(*)::BIGINT
     FROM public.messages m
     JOIN public.conversation_participants cp ON cp.conversation_id = m.conversation_id AND cp.participant_id = v_guest_id AND cp.participant_type = 'guest' AND cp.left_at IS NULL
     WHERE m.conversation_id = c.id AND m.sender_id <> v_guest_id AND m.sender_type <> 'guest'
       AND NOT m.is_deleted
       AND m.created_at >= v_guest_created_at
       AND (cp.last_read_at IS NULL OR m.created_at > cp.last_read_at))
  FROM public.conversations c
  JOIN public.conversation_participants cp ON cp.conversation_id = c.id AND cp.participant_id = v_guest_id AND cp.participant_type = 'guest' AND cp.left_at IS NULL
  WHERE NOT (c.type = 'group' AND c.name = 'Tüm Çalışanlar')
    AND NOT (
      c.type = 'direct'
      AND EXISTS (
        SELECT 1 FROM public.conversation_participants cp2
        JOIN public.staff s2 ON s2.id = cp2.participant_id AND cp2.participant_type IN ('staff', 'admin')
        WHERE cp2.conversation_id = c.id AND cp2.participant_id <> v_guest_id AND cp2.left_at IS NULL
          AND s2.deleted_at IS NOT NULL
      )
    )
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;

-- get_staff_public_profile: Silinen personel profil sayfası dönmesin.
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
  profile_contact JSONB
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
    ) AS profile_contact
  FROM public.staff s
  WHERE s.id = p_staff_id
    AND s.is_active = true
    AND s.deleted_at IS NULL;
$$;
