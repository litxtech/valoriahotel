-- Personel/admin kendi mesajını silebilir (soft delete).
CREATE OR REPLACE FUNCTION public.messaging_delete_message_staff(
  p_conversation_id UUID,
  p_message_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
  v_last_id UUID;
  v_prev_id UUID;
  v_prev_at TIMESTAMPTZ;
BEGIN
  SELECT s.id
  INTO v_staff_id
  FROM public.staff s
  WHERE s.auth_id = auth.uid()
  LIMIT 1;

  IF v_staff_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.conversation_participants cp
    WHERE cp.conversation_id = p_conversation_id
      AND cp.participant_id = v_staff_id
      AND cp.participant_type IN ('staff', 'admin')
      AND cp.left_at IS NULL
  ) THEN
    RETURN FALSE;
  END IF;

  UPDATE public.messages
  SET is_deleted = true,
      deleted_at = now()
  WHERE id = p_message_id
    AND conversation_id = p_conversation_id
    AND sender_id = v_staff_id
    AND sender_type IN ('staff', 'admin')
    AND NOT is_deleted;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  SELECT c.last_message_id
  INTO v_last_id
  FROM public.conversations c
  WHERE c.id = p_conversation_id;

  IF v_last_id = p_message_id THEN
    SELECT m.id, m.created_at
    INTO v_prev_id, v_prev_at
    FROM public.messages m
    WHERE m.conversation_id = p_conversation_id
      AND NOT m.is_deleted
    ORDER BY m.created_at DESC
    LIMIT 1;

    UPDATE public.conversations
    SET last_message_id = v_prev_id,
        last_message_at = v_prev_at,
        updated_at = now()
    WHERE id = p_conversation_id;
  END IF;

  RETURN TRUE;
END;
$$;
