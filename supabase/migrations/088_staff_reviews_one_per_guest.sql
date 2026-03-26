-- Bir kullanıcı (misafir) bir çalışana sadece bir kez puan ve yorum yapabilir.
-- guest_id NULL olan kayıtlar (anon) hariç: (staff_id, guest_id) tekil.

-- Önce varsa aynı (staff_id, guest_id) için birden fazla kayıt tutulur, en son eklenen kalır
DELETE FROM public.staff_reviews a
USING public.staff_reviews b
WHERE a.staff_id = b.staff_id
  AND a.guest_id = b.guest_id
  AND a.guest_id IS NOT NULL
  AND a.created_at < b.created_at;

CREATE UNIQUE INDEX IF NOT EXISTS idx_staff_reviews_one_per_guest
  ON public.staff_reviews (staff_id, guest_id)
  WHERE guest_id IS NOT NULL;

COMMENT ON INDEX public.idx_staff_reviews_one_per_guest IS
  'Bir misafir (guest_id) bir çalışana (staff_id) sadece bir değerlendirme yapabilir.';
