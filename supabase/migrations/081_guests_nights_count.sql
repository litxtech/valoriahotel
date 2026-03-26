-- Konaklama süresi (kaç gün) – sözleşme/PDF ve Maliye raporu için
ALTER TABLE public.guests
  ADD COLUMN IF NOT EXISTS nights_count INTEGER;

COMMENT ON COLUMN public.guests.nights_count IS 'Planlanan veya gerçekleşen konaklama gece sayısı; sözleşme ve raporlarda kullanılır.';
