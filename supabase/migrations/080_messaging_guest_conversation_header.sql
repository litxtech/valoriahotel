-- Misafir sohbet header’ı: karşı tarafın (personel) adı ve avatarı.
CREATE OR REPLACE FUNCTION public.messaging_get_conversation_header_guest(p_app_token TEXT, p_conversation_id UUID)
RETURNS TABLE(display_name TEXT, display_avatar TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_other_id UUID;
  v_other_type TEXT;
  v_conv_type VARCHAR(20);
  v_conv_name VARCHAR(255);
  v_conv_avatar TEXT;
BEGIN
  SELECT g.id INTO v_guest_id FROM public.guests g WHERE g.app_token = p_app_token LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.conversation_participants
    WHERE conversation_id = p_conversation_id AND participant_id = v_guest_id AND participant_type = 'guest' AND left_at IS NULL
  ) THEN
    RETURN;
  END IF;

  SELECT c.type, c.name, c.avatar INTO v_conv_type, v_conv_name, v_conv_avatar
  FROM public.conversations c WHERE c.id = p_conversation_id;

  IF v_conv_type = 'group' THEN
    display_name := COALESCE(v_conv_name, 'Sohbet');
    display_avatar := v_conv_avatar;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT cp.participant_id, cp.participant_type INTO v_other_id, v_other_type
  FROM public.conversation_participants cp
  WHERE cp.conversation_id = p_conversation_id AND cp.participant_id <> v_guest_id AND cp.left_at IS NULL
  LIMIT 1;

  IF v_other_type IN ('staff', 'admin') AND v_other_id IS NOT NULL THEN
    SELECT COALESCE(s.full_name, 'Personel'), s.profile_image INTO display_name, display_avatar
    FROM public.staff s WHERE s.id = v_other_id;
    RETURN NEXT;
    RETURN;
  END IF;

  display_name := COALESCE(v_conv_name, 'Sohbet');
  display_avatar := v_conv_avatar;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.messaging_get_conversation_header_guest(TEXT, UUID) TO anon;
GRANT EXECUTE ON FUNCTION public.messaging_get_conversation_header_guest(TEXT, UUID) TO authenticated;
