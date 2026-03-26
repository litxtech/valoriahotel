UPDATE public.admin_settings
SET value = jsonb_set(
  COALESCE(value, '{}'::jsonb),
  '{email}',
  '"536w8897jy@hpeprint.com"'::jsonb,
  true
),
updated_at = now()
WHERE key = 'printer';

UPDATE public.app_settings
SET value = jsonb_set(
  CASE
    WHEN jsonb_typeof(value) = 'object' THEN value
    ELSE '{}'::jsonb
  END,
  '{email}',
  '"536w8897jy@hpeprint.com"'::jsonb,
  true
),
updated_at = now()
WHERE key = 'printer';
