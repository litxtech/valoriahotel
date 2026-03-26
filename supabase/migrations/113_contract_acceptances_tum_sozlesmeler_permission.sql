-- Staff app_permissions->>'tum_sozlesmeler' = true ise tüm sözleşme onaylarını görebilsin
-- Mevcut: Admin hepsini, çalışan sadece kendine atananları görüyor.
-- Yeni: tum_sozlesmeler yetkisi olan çalışan da hepsini görsün (okuma için).

CREATE OR REPLACE FUNCTION public.staff_has_tum_sozlesmeler_permission()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT (s.app_permissions->>'tum_sozlesmeler')::text = 'true'
     FROM public.staff s
     WHERE s.auth_id = auth.uid() AND s.is_active = true
     LIMIT 1),
    false
  );
$$;

COMMENT ON FUNCTION public.staff_has_tum_sozlesmeler_permission() IS 'Çalışanın tum_sozlesmeler uygulama yetkisi var mı (app_permissions).';

DROP POLICY IF EXISTS "contract_acceptances_read_staff" ON public.contract_acceptances;
CREATE POLICY "contract_acceptances_read_staff"
ON public.contract_acceptances FOR SELECT TO authenticated
USING (
  public.current_user_is_staff_admin()
  OR public.staff_has_tum_sozlesmeler_permission()
  OR assigned_staff_id = public.current_staff_id_for_acceptances()
);
