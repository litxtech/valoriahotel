-- Misafir listesi / Excel eşlemesi: G sütunu = is_guest_app_account (Guest app)
-- Sütun yoksa ekle (058 atlanmışsa)
ALTER TABLE public.guests ADD COLUMN IF NOT EXISTS is_guest_app_account BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.guests.is_guest_app_account IS 'Guest app: Uygulama "Misafir olarak giriş" ile oluşturulmuş hesap. Excel/spreadsheet: Column G = Guest app. Admin listesinde ayırt edilir.';
