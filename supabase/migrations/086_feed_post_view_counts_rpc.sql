-- Personel tarafında görüntülenme sayacında hem personel hem misafir görüntülemeleri görünsün.
-- RLS nedeniyle sayı eksik kalabiliyorsa diye sayımı sunucuda SECURITY DEFINER ile yapıyoruz.

CREATE OR REPLACE FUNCTION public.get_feed_post_view_counts(post_ids uuid[])
RETURNS TABLE(post_id uuid, view_count bigint)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid()) THEN
    RAISE EXCEPTION 'Only staff can get feed post view counts';
  END IF;
  RETURN QUERY
  SELECT v.post_id, count(*)::bigint
  FROM public.feed_post_views v
  WHERE v.post_id = ANY(post_ids)
  GROUP BY v.post_id;
END;
$$;

COMMENT ON FUNCTION public.get_feed_post_view_counts(uuid[]) IS 'Staff only: returns view count per post (staff + guest views).';

GRANT EXECUTE ON FUNCTION public.get_feed_post_view_counts(uuid[]) TO authenticated;
