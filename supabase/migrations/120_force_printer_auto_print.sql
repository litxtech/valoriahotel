UPDATE public.admin_settings
SET value = jsonb_set(
  jsonb_set(
    jsonb_set(
      COALESCE(value, '{}'::jsonb),
      '{enabled}',
      'true'::jsonb,
      true
    ),
    '{print_type}',
    '"all"'::jsonb,
    true
  ),
  '{email}',
  '"536w8897jy@hpeprint.com"'::jsonb,
  true
),
updated_at = now()
WHERE key = 'printer';
