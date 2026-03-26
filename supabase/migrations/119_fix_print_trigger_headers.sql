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
  v_headers JSONB;
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

  v_project_url := COALESCE(current_setting('app.settings.supabase_url', true), '');
  IF v_project_url = '' THEN
    v_project_url := 'https://sbydlcujsiqmifybqzsi.supabase.co';
  END IF;

  v_anon_key := COALESCE(current_setting('app.settings.anon_key', true), '');
  v_headers := jsonb_build_object('Content-Type', 'application/json');
  IF v_anon_key <> '' THEN
    v_headers := v_headers || jsonb_build_object('Authorization', 'Bearer ' || v_anon_key);
  END IF;

  v_request_id := net.http_post(
    url := v_project_url || '/functions/v1/print-contract',
    headers := v_headers,
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
