-- Misafir kendi mesajını silebilir (soft delete).
CREATE OR REPLACE FUNCTION public.messaging_delete_message_guest(p_app_token TEXT, p_message_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_id UUID;
  v_last_id UUID;
  v_prev_id UUID;
  v_prev_at TIMESTAMPTZ;
BEGIN
  SELECT g.id INTO v_guest_id FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN FALSE; END IF;

  SELECT m.conversation_id INTO v_conv_id
  FROM public.messages m
  WHERE m.id = p_message_id AND NOT m.is_deleted
  LIMIT 1;
  IF v_conv_id IS NULL THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = v_conv_id AND participant_id = v_guest_id AND participant_type = 'guest' AND left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messages
  SET is_deleted = true, deleted_at = now()
  WHERE id = p_message_id
    AND sender_id = v_guest_id AND sender_type = 'guest';
  IF NOT FOUND THEN RETURN FALSE; END IF;

  SELECT c.last_message_id INTO v_last_id FROM public.conversations c WHERE c.id = v_conv_id;
  IF v_last_id = p_message_id THEN
    SELECT m.id, m.created_at INTO v_prev_id, v_prev_at
    FROM public.messages m
    WHERE m.conversation_id = v_conv_id AND NOT m.is_deleted
    ORDER BY m.created_at DESC
    LIMIT 1;
    UPDATE public.conversations
    SET last_message_id = v_prev_id, last_message_at = v_prev_at, updated_at = now()
    WHERE id = v_conv_id;
  END IF;

  RETURN TRUE;
END;
$$;
