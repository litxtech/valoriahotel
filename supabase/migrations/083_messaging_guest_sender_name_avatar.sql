-- Misafir mesaj gönderirken sender_name ve sender_avatar her zaman set edilsin (full_name boşsa email veya 'Misafir').

CREATE OR REPLACE FUNCTION public.messaging_send_message_guest(
  p_app_token TEXT,
  p_conversation_id UUID,
  p_content TEXT,
  p_message_type VARCHAR DEFAULT 'text',
  p_media_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_guest_name TEXT;
  v_guest_email TEXT;
  v_display_name TEXT;
  v_msg_id UUID;
BEGIN
  SELECT g.id, g.full_name, g.email INTO v_guest_id, v_guest_name, v_guest_email
  FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN NULL; END IF;

  v_display_name := COALESCE(NULLIF(TRIM(v_guest_name), ''), NULLIF(TRIM(v_guest_email), ''), 'Misafir');

  -- Block sending to the all-staff conversation.
  IF EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = p_conversation_id AND c.type = 'group' AND c.name = 'Tüm Çalışanlar') THEN
    RETURN NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id
      AND participant_id = v_guest_id
      AND participant_type = 'guest'
      AND left_at IS NULL
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO public.messages (conversation_id, sender_id, sender_type, sender_name, sender_avatar, message_type, content, media_url)
  VALUES (
    p_conversation_id,
    v_guest_id,
    'guest',
    v_display_name,
    NULL,
    COALESCE(NULLIF(p_message_type, ''), 'text'),
    p_content,
    NULLIF(p_media_url, '')
  )
  RETURNING id INTO v_msg_id;

  UPDATE public.conversations
  SET last_message_id = v_msg_id, last_message_at = now(), updated_at = now()
  WHERE id = p_conversation_id;

  RETURN v_msg_id;
END;
$$;

COMMENT ON FUNCTION public.messaging_send_message_guest(TEXT, UUID, TEXT, VARCHAR, TEXT) IS 'Misafir mesaj gönderir; sender_name full_name veya email veya Misafir olarak set edilir.';

-- Mevcut misafir mesajlarında boş sender_name olanları güncelle
UPDATE public.messages m
SET sender_name = COALESCE(NULLIF(TRIM(g.full_name), ''), NULLIF(TRIM(g.email), ''), 'Misafir')
FROM public.guests g
WHERE m.sender_type = 'guest' AND m.sender_id = g.id
  AND (m.sender_name IS NULL OR TRIM(m.sender_name) = '');
