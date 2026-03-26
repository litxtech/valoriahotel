-- Valoria Hotel - Mesajlaşma medya (resim/ses) storage bucket
-- Admin/Staff: authenticated ile yükler; Misafir: Edge Function (service role) ile yükler.
-- Resimler sohbette gösterilebildiği için bucket public.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-media',
  'message-media',
  true,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'audio/m4a', 'audio/mpeg']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Authenticated (staff/admin) mesaj resmi/sesi yükleyebilir
DROP POLICY IF EXISTS "message_media_upload" ON storage.objects;
CREATE POLICY "message_media_upload" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'message-media');

-- Herkes (sohbetteki resim/ses URL'leri) okuyabilsin
DROP POLICY IF EXISTS "message_media_read" ON storage.objects;
CREATE POLICY "message_media_read" ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'message-media');
