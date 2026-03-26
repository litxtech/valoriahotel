-- Yeni oluşturulan hesaplarda mesaj listesi temiz olsun: sadece hesap oluşturulma tarihinden (created_at) itibaren mesajlar görünsün.

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
  -- Hesap oluşturulmadan önceki mesajları gösterme
  IF v_guest_created_at IS NULL THEN
    v_guest_created_at := '1970-01-01'::timestamptz;
  END IF;

  RETURN QUERY
  SELECT
    c.id,
    c.type,
    c.name,
    c.avatar,
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

CREATE OR REPLACE FUNCTION public.messaging_get_messages_guest(
  p_app_token TEXT,
  p_conversation_id UUID,
  p_limit INT DEFAULT 50,
  p_before_id UUID DEFAULT NULL
)
RETURNS SETOF public.messages
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

  IF EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'group' AND c.name = 'Tüm Çalışanlar') THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT m.* FROM public.messages m
  WHERE m.conversation_id = p_conversation_id AND NOT m.is_deleted
    AND m.created_at >= v_guest_created_at
    AND (p_before_id IS NULL OR m.created_at < (SELECT created_at FROM public.messages WHERE id = p_before_id LIMIT 1))
  ORDER BY m.created_at DESC
  LIMIT p_limit;
END;
$$;
