-- Paylaşımlarda konum: haritadan paylaşımda lat/lng ve isteğe bağlı etiket.
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS lat DECIMAL(10, 8);
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS lng DECIMAL(11, 8);
ALTER TABLE public.feed_posts ADD COLUMN IF NOT EXISTS location_label TEXT;

COMMENT ON COLUMN public.feed_posts.lat IS 'Haritadan paylaşımda enlem.';
COMMENT ON COLUMN public.feed_posts.lng IS 'Haritadan paylaşımda boylam.';
COMMENT ON COLUMN public.feed_posts.location_label IS 'Konum etiketi (ters geokod veya kullanıcı girişi).';
