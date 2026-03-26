-- Misafirin kendi yorumunu silebilmesi
DROP POLICY IF EXISTS "feed_comments_guest_delete" ON public.feed_post_comments;
CREATE POLICY "feed_comments_guest_delete" ON public.feed_post_comments
  FOR DELETE TO authenticated
  USING (
    guest_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.guests g
      WHERE g.id = guest_id
        AND g.auth_user_id = auth.uid()
    )
  );

