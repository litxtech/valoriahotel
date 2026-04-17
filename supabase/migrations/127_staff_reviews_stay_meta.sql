-- Misafir değerlendirmesinde isteğe bağlı oda ve konaklama süresi metni
ALTER TABLE public.staff_reviews
  ADD COLUMN IF NOT EXISTS stay_room_label TEXT,
  ADD COLUMN IF NOT EXISTS stay_nights_label TEXT;

COMMENT ON COLUMN public.staff_reviews.stay_room_label IS 'Misafirin yazdığı oda bilgisi (örn. 305, Deluxe).';
COMMENT ON COLUMN public.staff_reviews.stay_nights_label IS 'İsteğe bağlı konaklama süresi metni (örn. 3 gece).';
