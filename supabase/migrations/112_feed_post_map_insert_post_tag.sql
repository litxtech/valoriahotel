-- insert_feed_post_from_map: post_tag parametresi ekle
CREATE OR REPLACE FUNCTION public.insert_feed_post_from_map(
  p_media_type TEXT,
  p_media_url TEXT DEFAULT NULL,
  p_thumbnail_url TEXT DEFAULT NULL,
  p_title TEXT DEFAULT NULL,
  p_lat DECIMAL DEFAULT NULL,
  p_lng DECIMAL DEFAULT NULL,
  p_location_label TEXT DEFAULT NULL,
  p_post_tag TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_guest_id UUID;
  v_post_id UUID;
  v_uid UUID;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Oturum açmanız gerekiyor';
  END IF;

  IF p_lat IS NULL OR p_lng IS NULL THEN
    RAISE EXCEPTION 'Konum gereklidir';
  END IF;

  IF EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = v_uid AND s.is_active = true) THEN
    INSERT INTO public.feed_posts (
      staff_id, guest_id, media_type, media_url, thumbnail_url,
      title, visibility, lat, lng, location_label, post_tag
    )
    SELECT s.id, NULL,
      coalesce(nullif(trim(p_media_type), ''), 'text'),
      p_media_url, p_thumbnail_url, nullif(trim(p_title), ''),
      'customers', p_lat, p_lng, nullif(trim(p_location_label), ''),
      nullif(trim(p_post_tag), '')
    FROM public.staff s
    WHERE s.auth_id = v_uid AND s.is_active = true
    LIMIT 1
    RETURNING id INTO v_post_id;
  ELSE
    SELECT g.guest_id INTO v_guest_id
    FROM public.get_or_create_guest_for_caller(NULL) g;
    IF v_guest_id IS NULL THEN
      RAISE EXCEPTION 'Misafir kaydı oluşturulamadı';
    END IF;

    INSERT INTO public.feed_posts (
      staff_id, guest_id, media_type, media_url, thumbnail_url,
      title, visibility, lat, lng, location_label, post_tag
    )
    VALUES (
      NULL, v_guest_id,
      coalesce(nullif(trim(p_media_type), ''), 'text'),
      p_media_url, p_thumbnail_url, nullif(trim(p_title), ''),
      'customers', p_lat, p_lng, nullif(trim(p_location_label), ''),
      nullif(trim(p_post_tag), '')
    )
    RETURNING id INTO v_post_id;
  END IF;

  RETURN v_post_id;
END;
$$;

COMMENT ON FUNCTION public.insert_feed_post_from_map(TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, TEXT, TEXT) IS
  'Haritadan paylaşım: auth.uid() ile staff veya guest kullanarak feed_posts ekler. RLS bypass. post_tag isteğe bağlı.';

GRANT EXECUTE ON FUNCTION public.insert_feed_post_from_map(TEXT, TEXT, TEXT, TEXT, DECIMAL, DECIMAL, TEXT, TEXT)
  TO authenticated, anon;
