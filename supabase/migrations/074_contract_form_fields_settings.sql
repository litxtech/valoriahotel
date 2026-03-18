-- Sözleşme formunda hangi alanların toplanacağı (admin panelden anlık aç/kapa)
-- Misafir sözleşme sayfası bu ayarı okuyup sadece açık alanları gösterir; deploy gerekmez.

INSERT INTO public.app_settings (key, value) VALUES (
  'contract_form_fields',
  '{"full_name":true,"id_type":true,"id_number":true,"phone":true,"email":true,"nationality":true,"date_of_birth":true,"gender":true,"address":true,"check_in_date":true,"check_out_date":true,"room_type":true,"adults":true,"children":true}'::jsonb
)
ON CONFLICT (key) DO UPDATE SET
  value = COALESCE(app_settings.value, EXCLUDED.value),
  updated_at = now();

-- Anon (QR ile gelen misafir) sadece bu anahtarı okuyabilsin
DROP POLICY IF EXISTS "app_settings_anon_contract_form_fields" ON public.app_settings;
CREATE POLICY "app_settings_anon_contract_form_fields" ON public.app_settings
  FOR SELECT TO anon
  USING (key = 'contract_form_fields');

COMMENT ON TABLE public.app_settings IS 'contract_form_fields: sözleşme sayfasında gösterilecek form alanları (true=göster, false=gizle). Admin panelden düzenlenir.';
