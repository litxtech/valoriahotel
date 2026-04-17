-- Konaklama geçmişi: en son odadan ayrılan / en güncel konaklama üstte
-- sort_ts = çıkış > giriş > sözleşme onayı

CREATE OR REPLACE FUNCTION public.get_room_stay_history(p_room_id UUID)
RETURNS JSON
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT json_agg(row_data ORDER BY sort_ts DESC NULLS LAST)
      FROM (
        SELECT
          json_build_object(
            'acceptance_id', ca.id,
            'accepted_at', ca.accepted_at,
            'contract_lang', ca.contract_lang,
            'contract_version', ca.contract_version,
            'source', ca.source,
            'token', ca.token,
            'assigned_at', ca.assigned_at,
            'contract_title', ct.title,
            'guest', CASE WHEN g.id IS NULL THEN NULL ELSE json_build_object(
              'id', g.id,
              'full_name', g.full_name,
              'phone', g.phone,
              'email', g.email,
              'nationality', g.nationality,
              'id_number', g.id_number,
              'id_type', g.id_type,
              'status', g.status,
              'check_in_at', g.check_in_at,
              'check_out_at', g.check_out_at,
              'nights_count', g.nights_count,
              'room_type', g.room_type,
              'adults', g.adults,
              'children', g.children,
              'date_of_birth', g.date_of_birth,
              'gender', g.gender,
              'address', g.address,
              'photo_url', g.photo_url,
              'created_at', g.created_at,
              'total_amount_net', g.total_amount_net,
              'vat_amount', g.vat_amount,
              'accommodation_tax_amount', g.accommodation_tax_amount
            ) END,
            'assigned_staff', CASE WHEN st.id IS NULL THEN NULL ELSE json_build_object(
              'id', st.id,
              'full_name', st.full_name,
              'role', st.role,
              'department', st.department
            ) END
          ) AS row_data,
          COALESCE(g.check_out_at, g.check_in_at, ca.accepted_at) AS sort_ts
        FROM public.contract_acceptances ca
        LEFT JOIN public.guests g ON g.id = ca.guest_id
        LEFT JOIN public.contract_templates ct ON ct.id = ca.contract_template_id
        LEFT JOIN public.staff st ON st.id = ca.assigned_staff_id
        WHERE ca.room_id = p_room_id
          AND EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.auth_id = auth.uid()
              AND COALESCE(s.is_active, true) = true
              AND s.deleted_at IS NULL
          )
      ) ordered_rows
    ),
    '[]'::json
  );
$$;

COMMENT ON FUNCTION public.get_room_stay_history(UUID) IS
  'Aktif personel: oda sözleşme kayıtları; sıra: çıkış > giriş > onay zamanı (yeniden eskiye).';
