-- Misafir kendi paylaşımını silebilsin (personel: feed_posts_delete_own, admin: feed_posts_admin_all)
DROP POLICY IF EXISTS "feed_posts_delete_guest_own" ON public.feed_posts;
CREATE POLICY "feed_posts_delete_guest_own" ON public.feed_posts
  FOR DELETE TO authenticated
  USING (
    guest_id IS NOT NULL
    AND staff_id IS NULL
    AND NOT EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.guests g
      WHERE g.id = feed_posts.guest_id
      AND (
        (auth.jwt()->>'email') IS NOT NULL AND trim(auth.jwt()->>'email') <> '' AND lower(trim(g.email)) = lower(trim(auth.jwt()->>'email'))
        OR g.auth_user_id = auth.uid()
      )
    )
  );
