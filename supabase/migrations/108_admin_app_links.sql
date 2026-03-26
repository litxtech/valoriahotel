-- Admin tarafından paylaşılan uygulama ve web sitesi linkleri.
-- Personel ve misafir dahil herkes görebilir.
CREATE TABLE IF NOT EXISTS public.admin_app_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('app', 'website')),
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon_type TEXT NOT NULL CHECK (icon_type IN ('app_store', 'google_play', 'globe', 'custom')) DEFAULT 'globe',
  icon_url TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_app_links_sort ON public.admin_app_links(sort_order, created_at);

ALTER TABLE public.admin_app_links ENABLE ROW LEVEL SECURITY;

-- Herkes (authenticated) okuyabilir
CREATE POLICY "admin_app_links_read_all" ON public.admin_app_links
  FOR SELECT TO authenticated USING (true);

-- Sadece admin yazabilir
CREATE POLICY "admin_app_links_insert_admin" ON public.admin_app_links
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid()));

CREATE POLICY "admin_app_links_update_admin" ON public.admin_app_links
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid()));

CREATE POLICY "admin_app_links_delete_admin" ON public.admin_app_links
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid()));

-- Storage: özel uygulama logoları (icon_type=custom)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'app-link-icons',
  'app-link-icons',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "app_link_icons_upload_admin" ON storage.objects;
CREATE POLICY "app_link_icons_upload_admin" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'app-link-icons'
    AND EXISTS (SELECT 1 FROM public.admin_auth_ids WHERE auth_id = auth.uid())
  );

DROP POLICY IF EXISTS "app_link_icons_read" ON storage.objects;
CREATE POLICY "app_link_icons_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'app-link-icons');
