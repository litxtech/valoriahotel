-- Görev atamalarına resim/video ekleri (public URL listesi)

ALTER TABLE public.staff_assignments
  ADD COLUMN IF NOT EXISTS attachment_urls TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.staff_assignments.attachment_urls IS 'Supabase Storage staff-task-media bucket public URL''leri (sıra korunur).';

-- Bucket: personel görev ekleri (authenticated yükler, herkes okur — uygulama içi gösterim)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'staff-task-media',
  'staff-task-media',
  true,
  52428800,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4', 'video/quicktime']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "staff_task_media_insert" ON storage.objects;
CREATE POLICY "staff_task_media_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'staff-task-media');

DROP POLICY IF EXISTS "staff_task_media_select" ON storage.objects;
CREATE POLICY "staff_task_media_select" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'staff-task-media');
