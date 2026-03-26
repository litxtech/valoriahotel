-- PostgREST/Supabase upsert için UNIQUE constraint'ler gerekli.
-- 082'de kaldırılan feed_post_views_post_id_staff_id_key yerine sadece partial index'ler vardı,
-- PostgREST onConflict için table constraint arıyor. PostgreSQL'de UNIQUE'de NULL distinct sayılır:
-- staff satırları (post_id, staff_id) unique; guest satırları (post_id, NULL) çoklanabilir.
-- Her iki yönde de constraint ekleyerek staff ve guest upsert'leri çalışır.

ALTER TABLE public.feed_post_views
  ADD CONSTRAINT feed_post_views_post_id_staff_id_key UNIQUE (post_id, staff_id);

ALTER TABLE public.feed_post_views
  ADD CONSTRAINT feed_post_views_post_id_guest_id_key UNIQUE (post_id, guest_id);
