-- Personel push token: RLS yüzünden ON CONFLICT UPDATE başka staff_id satırına erişemiyordu
-- (aynı cihazda hesap değişince upsert sessizce başarısız olabiliyordu). SECURITY DEFINER ile güvenli upsert.

CREATE OR REPLACE FUNCTION public.upsert_staff_push_token(p_token TEXT, p_device_info JSONB DEFAULT '{}'::JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_staff_id UUID;
BEGIN
  IF p_token IS NULL OR btrim(p_token) = '' THEN
    RETURN;
  END IF;
  SELECT id INTO v_staff_id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1;
  IF v_staff_id IS NULL THEN
    RETURN;
  END IF;

  INSERT INTO public.push_tokens (guest_id, staff_id, token, device_info)
  VALUES (NULL, v_staff_id, btrim(p_token), COALESCE(p_device_info, '{}'::JSONB))
  ON CONFLICT (token) DO UPDATE SET
    staff_id = EXCLUDED.staff_id,
    guest_id = NULL,
    device_info = EXCLUDED.device_info;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_staff_push_token(TEXT, JSONB) TO authenticated;
