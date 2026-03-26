-- Admin panelinde kullanıcı listesinde: cihaz tipi (Android/iOS), kayıt saati, hangi bilgi ile kayıt olduğu

-- guests: son giriş platformu ve auth bilgileri
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS last_login_platform TEXT,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_provider TEXT,
  ADD COLUMN IF NOT EXISTS auth_user_created_at TIMESTAMPTZ;

COMMENT ON COLUMN public.guests.last_login_platform IS 'Son giriş cihazı: android, ios, web';
COMMENT ON COLUMN public.guests.auth_provider IS 'Giriş yöntemi: google, apple, email, anonymous';
COMMENT ON COLUMN public.guests.auth_user_created_at IS 'Auth hesabı ne zaman oluşturuldu (app hesabı için)';

-- Misafir giriş bilgilerini güncelleyen RPC (client her girişte çağırır)
CREATE OR REPLACE FUNCTION public.update_guest_login_info(
  p_device_id TEXT DEFAULT NULL,
  p_platform TEXT DEFAULT NULL,
  p_auth_provider TEXT DEFAULT NULL,
  p_auth_created_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_uid UUID;
  v_guest_id UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RETURN; END IF;

  SELECT id INTO v_guest_id
  FROM public.guests
  WHERE auth_user_id = v_uid AND deleted_at IS NULL
  LIMIT 1;
  IF v_guest_id IS NULL THEN RETURN; END IF;

  UPDATE public.guests SET
    last_login_device_id = CASE WHEN p_device_id IS NOT NULL AND trim(p_device_id) <> '' THEN trim(p_device_id) ELSE last_login_device_id END,
    last_login_platform = CASE WHEN p_platform IS NOT NULL AND trim(p_platform) <> '' THEN trim(p_platform) ELSE last_login_platform END,
    last_login_at = now(),
    auth_provider = CASE WHEN auth_provider IS NULL AND p_auth_provider IS NOT NULL AND trim(p_auth_provider) <> '' THEN trim(p_auth_provider) ELSE auth_provider END,
    auth_user_created_at = COALESCE(auth_user_created_at, p_auth_created_at)
  WHERE id = v_guest_id;
END;
$$;

COMMENT ON FUNCTION public.update_guest_login_info(TEXT, TEXT, TEXT, TIMESTAMPTZ) IS
  'Misafir giriş bilgilerini günceller: cihaz, platform (android/ios), auth provider, kayıt zamanı. Client her oturumda çağırır.';

GRANT EXECUTE ON FUNCTION public.update_guest_login_info(TEXT, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;

-- admin_list_guests: cihaz, platform, kayıt bilgileri ekle
DROP FUNCTION IF EXISTS public.admin_list_guests(text);

CREATE FUNCTION public.admin_list_guests(p_filter text DEFAULT 'all')
RETURNS TABLE (
  id uuid,
  full_name text,
  phone text,
  email text,
  status text,
  created_at timestamptz,
  room_id uuid,
  room_number text,
  auth_user_id uuid,
  banned_until timestamptz,
  deleted_at timestamptz,
  last_login_device_id text,
  is_guest_app_account boolean,
  photo_url text,
  last_login_platform text,
  last_login_at timestamptz,
  auth_provider text,
  auth_user_created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid()) THEN
    RAISE EXCEPTION 'Unauthorized: admin only';
  END IF;
  RETURN QUERY
  SELECT
    g.id,
    g.full_name,
    g.phone,
    g.email,
    g.status,
    g.created_at,
    g.room_id,
    r.room_number::text,
    g.auth_user_id,
    g.banned_until,
    g.deleted_at,
    g.last_login_device_id,
    coalesce(g.is_guest_app_account, false),
    g.photo_url,
    g.last_login_platform,
    g.last_login_at,
    g.auth_provider,
    g.auth_user_created_at
  FROM public.guests g
  LEFT JOIN public.rooms r ON r.id = g.room_id
  WHERE (p_filter IS NULL OR p_filter <> 'pending' OR g.status = 'pending')
  ORDER BY g.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_guests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_guests(text) TO service_role;
