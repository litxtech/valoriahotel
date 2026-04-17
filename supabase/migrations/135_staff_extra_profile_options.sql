-- Çalışan ek bilgiler: sözleşme tipi, işten çıkış, dahili hat, sertifikalar, KVKK onayı, ehliyet

ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS contract_type TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS termination_date DATE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS internal_extension TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS certifications_summary TEXT;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS kvkk_consent_at DATE;
ALTER TABLE public.staff ADD COLUMN IF NOT EXISTS drives_vehicle BOOLEAN DEFAULT false;

ALTER TABLE public.staff DROP CONSTRAINT IF EXISTS staff_contract_type_check;
ALTER TABLE public.staff ADD CONSTRAINT staff_contract_type_check CHECK (
  contract_type IS NULL OR contract_type IN (
    'full_time',
    'fixed_term',
    'seasonal',
    'intern',
    'other'
  )
);

COMMENT ON COLUMN public.staff.contract_type IS 'Sözleşme: full_time, fixed_term, seasonal, intern, other';
COMMENT ON COLUMN public.staff.termination_date IS 'İşten çıkış tarihi (varsa)';
COMMENT ON COLUMN public.staff.internal_extension IS 'Dahili telefon';
COMMENT ON COLUMN public.staff.certifications_summary IS 'Sertifikalar / bitiş (serbest metin)';
COMMENT ON COLUMN public.staff.kvkk_consent_at IS 'KVKK aydınlatma onayı tarihi';
COMMENT ON COLUMN public.staff.drives_vehicle IS 'Ehliyet / araç kullanabilir';
