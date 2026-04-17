-- OPS storage: private passport thumbnails and full images
-- Buckets are NOT public. Access is controlled by RLS on storage.objects.
-- Path convention:
--   passport-thumbs:  hotel/<hotel_id>/thumbs/<guest_document_id>.jpg
--   passport-private: hotel/<hotel_id>/full/<guest_document_id>.jpg

BEGIN;

-- Buckets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('passport-thumbs', 'passport-thumbs', false, 5242880, ARRAY['image/jpeg','image/png','image/webp']::text[]),
  ('passport-private', 'passport-private', false, 20971520, ARRAY['image/jpeg','image/png','image/webp','application/pdf']::text[])
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Helper: parse hotel_id from storage path "hotel/<uuid>/..."
CREATE OR REPLACE FUNCTION ops.storage_hotel_id_from_path(p_name text)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULLIF((storage.foldername(p_name))[2], '')::uuid
$$;

-- Helper: guard thumb/full path prefixes
CREATE OR REPLACE FUNCTION ops.storage_is_ops_passport_path(p_bucket text, p_name text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT
    (p_bucket IN ('passport-thumbs','passport-private'))
    AND (storage.foldername(p_name))[1] = 'hotel'
    AND (storage.foldername(p_name))[2] IS NOT NULL
    AND (
      (p_bucket = 'passport-thumbs' AND (storage.foldername(p_name))[3] = 'thumbs')
      OR
      (p_bucket = 'passport-private' AND (storage.foldername(p_name))[3] = 'full')
    )
$$;

-- READ policies
-- Thumbs: any authenticated user in same hotel can read (for card lists).
DROP POLICY IF EXISTS "ops_passport_thumbs_read_hotel" ON storage.objects;
CREATE POLICY "ops_passport_thumbs_read_hotel" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'passport-thumbs'
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
  );

-- Full images: admin only + same hotel. (Feature flag enforced at app level; DB policy stays strict.)
DROP POLICY IF EXISTS "ops_passport_private_read_admin" ON storage.objects;
CREATE POLICY "ops_passport_private_read_admin" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'passport-private'
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
    AND ops.is_admin()
  );

-- WRITE policies
-- Upload is typically done from backend/service-role; however allow authenticated uploads scoped to hotel to support controlled clients.
-- IMPORTANT: Never allow anon upload for passport images.
DROP POLICY IF EXISTS "ops_passport_thumbs_upload_hotel" ON storage.objects;
CREATE POLICY "ops_passport_thumbs_upload_hotel" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'passport-thumbs'
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
  );

DROP POLICY IF EXISTS "ops_passport_private_upload_admin" ON storage.objects;
CREATE POLICY "ops_passport_private_upload_admin" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'passport-private'
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
    AND ops.is_admin()
  );

-- Updates/deletes: admin only within hotel (avoid tampering)
DROP POLICY IF EXISTS "ops_passport_objects_update_admin" ON storage.objects;
CREATE POLICY "ops_passport_objects_update_admin" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('passport-thumbs','passport-private')
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
    AND ops.is_admin()
  )
  WITH CHECK (
    bucket_id IN ('passport-thumbs','passport-private')
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
    AND ops.is_admin()
  );

DROP POLICY IF EXISTS "ops_passport_objects_delete_admin" ON storage.objects;
CREATE POLICY "ops_passport_objects_delete_admin" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('passport-thumbs','passport-private')
    AND ops.storage_is_ops_passport_path(bucket_id, name)
    AND ops.storage_hotel_id_from_path(name) = ops.current_hotel_id()
    AND ops.is_admin()
  );

COMMIT;

