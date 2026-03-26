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

  -- Kesin URL ile çağır (anon/JWT basmadan, verify_jwt=false)
  v_request_id := net.http_post(
    url := 'https://sbydlcujsiqmifybqzsi.supabase.co/functions/v1/print-contract',
    headers := jsonb_build_object(
      'Content-Type', 'application/json'
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

