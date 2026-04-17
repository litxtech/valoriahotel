-- Misafirler feed_posts_customers ile guests_only görebilmeli; RESTRICTIVE politika sadece customers'a izin veriyordu.
DROP POLICY IF EXISTS "feed_posts_restrict_non_staff" ON public.feed_posts;
CREATE POLICY "feed_posts_restrict_non_staff" ON public.feed_posts
  AS RESTRICTIVE
  FOR SELECT
  TO authenticated
  USING (
    visibility IN ('customers', 'guests_only')
    OR EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid())
  );

COMMENT ON POLICY "feed_posts_restrict_non_staff" ON public.feed_posts IS
  'Staff olmayan kullanıcılar customers ve guests_only gönderilerini görebilir; diğer görünürlükler personel içindir.';
