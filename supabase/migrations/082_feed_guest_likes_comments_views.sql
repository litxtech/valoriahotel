-- Misafir (müşteri) girişlerinde feed paylaşımlarına beğeni, yorum ve görüntüleme
-- Staff tarafında aynı tablolarda hem staff hem guest kayıtları görünsün; misafir kendi beğeni/yorumunu yapabilsin.

-- ========== 1. feed_post_reactions: guest_id ekle, staff_id nullable ==========
ALTER TABLE public.feed_post_reactions
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE;

ALTER TABLE public.feed_post_reactions
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE public.feed_post_reactions
  DROP CONSTRAINT IF EXISTS feed_post_reactions_post_id_staff_id_key;

ALTER TABLE public.feed_post_reactions
  ADD CONSTRAINT feed_post_reactions_author_check CHECK (
    (staff_id IS NOT NULL AND guest_id IS NULL) OR (staff_id IS NULL AND guest_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_reactions_post_staff
  ON public.feed_post_reactions(post_id, staff_id) WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_reactions_post_guest
  ON public.feed_post_reactions(post_id, guest_id) WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_post_reactions_guest ON public.feed_post_reactions(guest_id) WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.feed_post_reactions.guest_id IS 'Beğenen misafir; staff_id null olur.';

-- RLS: Misafir, customers görünürlüklü paylaşımların reaksiyonlarını okuyabilsin; kendi guest_id ile ekleyebilsin/silebilsin
DROP POLICY IF EXISTS "feed_reactions_staff" ON public.feed_post_reactions;
CREATE POLICY "feed_reactions_staff" ON public.feed_post_reactions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid()));

CREATE POLICY "feed_reactions_guest_select" ON public.feed_post_reactions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_posts fp
      WHERE fp.id = feed_post_reactions.post_id AND fp.visibility = 'customers'
    )
  );

CREATE POLICY "feed_reactions_guest_insert" ON public.feed_post_reactions
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NOT NULL AND staff_id IS NULL
    AND EXISTS (SELECT 1 FROM public.guests g WHERE g.id = guest_id AND g.auth_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_id AND fp.visibility = 'customers')
  );

CREATE POLICY "feed_reactions_guest_delete" ON public.feed_post_reactions
  FOR DELETE TO authenticated
  USING (
    guest_id IS NOT NULL
    AND EXISTS (SELECT 1 FROM public.guests g WHERE g.id = guest_id AND g.auth_user_id = auth.uid())
  );

-- ========== 2. feed_post_comments: guest_id ekle, staff_id nullable ==========
ALTER TABLE public.feed_post_comments
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE;

ALTER TABLE public.feed_post_comments
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE public.feed_post_comments
  ADD CONSTRAINT feed_post_comments_author_check CHECK (
    (staff_id IS NOT NULL AND guest_id IS NULL) OR (staff_id IS NULL AND guest_id IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_feed_post_comments_guest ON public.feed_post_comments(guest_id) WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.feed_post_comments.guest_id IS 'Yorumu yapan misafir; staff_id null olur.';

DROP POLICY IF EXISTS "feed_comments_staff" ON public.feed_post_comments;
CREATE POLICY "feed_comments_staff" ON public.feed_post_comments
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid()));

CREATE POLICY "feed_comments_guest_select" ON public.feed_post_comments
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_posts fp
      WHERE fp.id = feed_post_comments.post_id AND fp.visibility = 'customers'
    )
  );

CREATE POLICY "feed_comments_guest_insert" ON public.feed_post_comments
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NOT NULL AND staff_id IS NULL
    AND EXISTS (SELECT 1 FROM public.guests g WHERE g.id = guest_id AND g.auth_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_id AND fp.visibility = 'customers')
  );

-- ========== 3. feed_post_views: guest_id ekle, staff_id nullable ==========
ALTER TABLE public.feed_post_views
  ADD COLUMN IF NOT EXISTS guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE;

ALTER TABLE public.feed_post_views
  ALTER COLUMN staff_id DROP NOT NULL;

ALTER TABLE public.feed_post_views
  DROP CONSTRAINT IF EXISTS feed_post_views_post_id_staff_id_key;

ALTER TABLE public.feed_post_views
  ADD CONSTRAINT feed_post_views_viewer_check CHECK (
    (staff_id IS NOT NULL AND guest_id IS NULL) OR (staff_id IS NULL AND guest_id IS NOT NULL)
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_views_post_staff
  ON public.feed_post_views(post_id, staff_id) WHERE staff_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_feed_views_post_guest
  ON public.feed_post_views(post_id, guest_id) WHERE guest_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_feed_post_views_guest ON public.feed_post_views(guest_id) WHERE guest_id IS NOT NULL;

COMMENT ON COLUMN public.feed_post_views.guest_id IS 'Görüntüleyen misafir; staff_id null olur.';

DROP POLICY IF EXISTS "feed_views_staff" ON public.feed_post_views;
CREATE POLICY "feed_views_staff" ON public.feed_post_views
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid()));

CREATE POLICY "feed_views_guest_select" ON public.feed_post_views
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.feed_posts fp
      WHERE fp.id = feed_post_views.post_id AND fp.visibility = 'customers'
    )
  );

CREATE POLICY "feed_views_guest_insert" ON public.feed_post_views
  FOR INSERT TO authenticated
  WITH CHECK (
    guest_id IS NOT NULL AND staff_id IS NULL
    AND EXISTS (SELECT 1 FROM public.guests g WHERE g.id = guest_id AND g.auth_user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.feed_posts fp WHERE fp.id = post_id AND fp.visibility = 'customers')
  );

-- ========== 4. Bildirim: Misafir, paylaşım sahibi personeli (staff_id) beğeni/yorum bildirimi ile bildirebilsin ==========
DROP POLICY IF EXISTS "notifications_insert_guest_to_staff" ON public.notifications;
CREATE POLICY "notifications_insert_guest_to_staff" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    staff_id IS NOT NULL
    AND guest_id IS NULL
    AND EXISTS (SELECT 1 FROM public.guests g WHERE g.auth_user_id = auth.uid())
  );

COMMENT ON POLICY "notifications_insert_guest_to_staff" ON public.notifications IS
  'Misafir, beğeni/yorum bildirimi ile personeli (staff_id) hedefleyebilir.';
