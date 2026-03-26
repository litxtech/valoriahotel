-- Misafir avatar yüklemesi: anon kullanıcılar kayıt sırasında guest/{guest_id}/ altına yükleyebilir.
-- Sadece mevcut guests kaydına karşılık gelen path'e izin verilir.
DROP POLICY IF EXISTS "profiles_guest_anon_upload" ON storage.objects;
CREATE POLICY "profiles_guest_anon_upload" ON storage.objects FOR INSERT TO anon
  WITH CHECK (
    bucket_id = 'profiles'
    AND (storage.foldername(name))[1] = 'guest'
    AND (storage.foldername(name))[2] IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.guests g
      WHERE g.id::text = (storage.foldername(name))[2]
    )
  );
