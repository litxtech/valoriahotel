-- Admin panelinde misafir avatarlarının görünmesi için photo_url ekle.
-- PostgreSQL dönüş tipi değişikliğine izin vermediği için önce DROP gerekli.

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
  photo_url text
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
    g.photo_url
  FROM public.guests g
  LEFT JOIN public.rooms r ON r.id = g.room_id
  WHERE (p_filter IS NULL OR p_filter <> 'pending' OR g.status = 'pending')
  ORDER BY g.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_guests(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_guests(text) TO service_role;
