-- Personel: her oda için contract_acceptances (bu odaya atanmış) kayıt sayısı — oda kartı rozeti

CREATE OR REPLACE FUNCTION public.get_room_contract_history_counts()
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND COALESCE(s.is_active, true) = true
        AND s.deleted_at IS NULL
    )
    THEN COALESCE(
      (
        SELECT json_object_agg(r.id::text, COALESCE(t.cnt, 0)::int)
        FROM public.rooms r
        LEFT JOIN (
          SELECT room_id, COUNT(*)::int AS cnt
          FROM public.contract_acceptances
          WHERE room_id IS NOT NULL
          GROUP BY room_id
        ) t ON t.room_id = r.id
      ),
      '{}'::json
    )
    ELSE '{}'::json
  END;
$$;

COMMENT ON FUNCTION public.get_room_contract_history_counts() IS
  'Aktif personel: oda id -> bu odaya bağlı sözleşme onayı sayısı (kart rozeti).';

GRANT EXECUTE ON FUNCTION public.get_room_contract_history_counts() TO authenticated;
