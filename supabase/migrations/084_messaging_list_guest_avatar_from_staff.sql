-- Sohbet listesinde (misafir tarafı) direct sohbetlerde karşı tarafın (personel) profil resmini avatar olarak döndür.

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
    c.name,
    CASE
      WHEN c.type = 'direct' THEN (
        SELECT s.profile_image
        FROM public.conversation_participants cp
        JOIN public.staff s ON s.id = cp.participant_id AND cp.participant_type IN ('staff', 'admin')
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
  ORDER BY c.last_message_at DESC NULLS LAST;
END;
$$;
