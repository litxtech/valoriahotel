-- Misafir silinen direct sohbetten mesaj atarsa aktif/yeni odayı çözer.
CREATE OR REPLACE FUNCTION public.messaging_guest_resolve_direct_conversation(
  p_app_token TEXT,
  p_conversation_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_conv_type VARCHAR(20);
  v_other_id UUID;
  v_other_type VARCHAR(20);
BEGIN
  SELECT g.id
  INTO v_guest_id
  FROM public.guests g
  WHERE g.app_token = p_app_token
  LIMIT 1;

  IF v_guest_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.type
  INTO v_conv_type
  FROM public.conversations c
  WHERE c.id = p_conversation_id
  LIMIT 1;

  IF v_conv_type IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_conv_type <> 'direct' THEN
    RETURN p_conversation_id;
  END IF;

  SELECT cp.participant_id, cp.participant_type
  INTO v_other_id, v_other_type
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id
    AND NOT (cp.participant_id = v_guest_id AND cp.participant_type = 'guest')
  LIMIT 1;

  IF v_other_id IS NULL OR v_other_type IS NULL THEN
    RETURN p_conversation_id;
  END IF;

  RETURN public.messaging_get_or_create_direct(v_guest_id, 'guest', v_other_id, v_other_type);
END;
$$;
