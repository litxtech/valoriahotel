-- Yorum silme yetkisi: admin her yorumu silebilir, admin disindaki kullanici sadece kendi yorumunu silebilir.
-- Mevcut "feed_comments_staff" FOR ALL policy'si tum staff'a tum yorumlari sildirebildigi icin daraltiliyor.

DROP POLICY IF EXISTS "feed_comments_staff" ON public.feed_post_comments;
CREATE POLICY "feed_comments_staff" ON public.feed_post_comments
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "feed_comments_staff_insert" ON public.feed_post_comments;
CREATE POLICY "feed_comments_staff_insert" ON public.feed_post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IS NOT NULL
    AND guest_id IS NULL
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = feed_post_comments.staff_id
        AND s.auth_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "feed_comments_staff_delete_own" ON public.feed_post_comments;
CREATE POLICY "feed_comments_staff_delete_own" ON public.feed_post_comments
  FOR DELETE TO authenticated
  USING (
    staff_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.id = feed_post_comments.staff_id
        AND s.auth_id = auth.uid()
        AND s.role <> 'admin'
    )
  );

DROP POLICY IF EXISTS "feed_comments_admin_delete_all" ON public.feed_post_comments;
CREATE POLICY "feed_comments_admin_delete_all" ON public.feed_post_comments
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND s.role = 'admin'
    )
  );
