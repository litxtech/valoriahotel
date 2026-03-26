-- Misafir sohbeti kendi listesinden kaldırabilir.
CREATE OR REPLACE FUNCTION public.messaging_delete_conversation_guest(
  p_app_token TEXT,
  p_conversation_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
BEGIN
  SELECT g.id
  INTO v_guest_id
  FROM public.guests g
  WHERE g.app_token = p_app_token
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.conversation_participants
  SET left_at = now()
  WHERE conversation_id = p_conversation_id
    AND participant_id = v_guest_id
    AND participant_type = 'guest'
    AND left_at IS NULL;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  RETURN TRUE;
END;
$$;
