-- Otomatik sozlesme yazdirma ayarlari ve tetikleyici
CREATE EXTENSION IF NOT EXISTS pg_net;

CREATE TABLE IF NOT EXISTS public.admin_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key VARCHAR(100) NOT NULL UNIQUE,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_admin_settings_key ON public.admin_settings(key);

ALTER TABLE public.admin_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admin_settings_read_authenticated" ON public.admin_settings;
CREATE POLICY "admin_settings_read_authenticated"
ON public.admin_settings FOR SELECT TO authenticated
USING (true);

DROP POLICY IF EXISTS "admin_settings_write_admin" ON public.admin_settings;
CREATE POLICY "admin_settings_write_admin"
ON public.admin_settings FOR ALL TO authenticated
USING (public.current_user_is_staff_admin())
WITH CHECK (public.current_user_is_staff_admin());

INSERT INTO public.admin_settings (key, value)
VALUES ('printer', '{"enabled": true, "email": "536w8897jy@hpeprint.com", "print_type": "all"}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.printer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID REFERENCES public.contract_acceptances(id) ON DELETE CASCADE,
  sent_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL CHECK (status IN ('queued', 'success', 'failed', 'skipped')),
  error_message TEXT,
  request_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_printer_logs_contract_id ON public.printer_logs(contract_id);
CREATE INDEX IF NOT EXISTS idx_printer_logs_sent_at ON public.printer_logs(sent_at DESC);

ALTER TABLE public.printer_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "printer_logs_read_authenticated" ON public.printer_logs;
CREATE POLICY "printer_logs_read_authenticated"
ON public.printer_logs FOR SELECT TO authenticated
USING (public.current_user_is_staff_admin());

DROP POLICY IF EXISTS "printer_logs_insert_service" ON public.printer_logs;
CREATE POLICY "printer_logs_insert_service"
ON public.printer_logs FOR INSERT TO authenticated
WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.trigger_print_contract()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_printer JSONB;
  v_enabled BOOLEAN;
  v_request_id BIGINT;
  v_project_url TEXT;
  v_anon_key TEXT;
BEGIN
  SELECT value
  INTO v_printer
  FROM public.admin_settings
  WHERE key = 'printer'
  ORDER BY updated_at DESC
  LIMIT 1;

  v_enabled := COALESCE((v_printer->>'enabled')::BOOLEAN, true);
  IF NOT v_enabled THEN
    INSERT INTO public.printer_logs(contract_id, status, error_message)
    VALUES (NEW.id, 'skipped', 'Yazdirma ayari kapali');
    RETURN NEW;
  END IF;

  -- Supabase SQL trigger icin varsayilan URL; gerekirse migration sonrasi guncellenebilir.
  v_project_url := COALESCE(current_setting('app.settings.supabase_url', true), '');
  IF v_project_url = '' THEN
    v_project_url := 'https://sbydlcujsiqmifybqzsi.supabase.co';
  END IF;

  -- Webhook cagrisinda en azindan anon key gerekir; service role key kullanimi onerilir.
  v_anon_key := COALESCE(current_setting('app.settings.anon_key', true), '');

  v_request_id := net.http_post(
    url := v_project_url || '/functions/v1/print-contract',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', CASE WHEN v_anon_key <> '' THEN 'Bearer ' || v_anon_key ELSE '' END
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'contract_acceptances',
      'record', to_jsonb(NEW)
    )
  );

  INSERT INTO public.printer_logs(contract_id, status, request_id)
  VALUES (NEW.id, 'queued', v_request_id);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.printer_logs(contract_id, status, error_message)
  VALUES (NEW.id, 'failed', SQLERRM);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_contract_acceptance_print ON public.contract_acceptances;
CREATE TRIGGER trg_contract_acceptance_print
AFTER INSERT ON public.contract_acceptances
FOR EACH ROW
EXECUTE FUNCTION public.trigger_print_contract();
