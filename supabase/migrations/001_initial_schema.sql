-- Valoria Hotel - Initial Schema (Faz 1)
-- Rooms, Customers, Contracts, QR, Staff, Logs

-- Staff / Admin users (Supabase auth ile eşleşir)
CREATE TABLE IF NOT EXISTS public.staff (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT NOT NULL CHECK (role IN ('admin', 'reception_chief', 'receptionist', 'housekeeping', 'technical', 'security')),
  department TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Rooms
CREATE TABLE IF NOT EXISTS public.rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_number TEXT NOT NULL UNIQUE,
  floor INTEGER,
  view_type TEXT,
  area_sqm NUMERIC(6,2),
  bed_type TEXT,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'occupied', 'cleaning', 'maintenance', 'out_of_order')),
  price_per_night NUMERIC(12,2),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Room images (çoklu resim)
CREATE TABLE IF NOT EXISTS public.room_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contract templates (çoklu dil)
CREATE TABLE IF NOT EXISTS public.contract_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version INTEGER NOT NULL DEFAULT 1,
  lang TEXT NOT NULL CHECK (lang IN ('tr', 'en', 'ar', 'de', 'fr', 'ru', 'es')),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(lang, version)
);

-- Dynamic QR codes per room (periyodik yenileme)
CREATE TABLE IF NOT EXISTS public.room_qr_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES public.rooms(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Guests (müşteri kayıtları - QR + sözleşme onayından oluşur)
CREATE TABLE IF NOT EXISTS public.guests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT NOT NULL,
  id_number TEXT,
  id_type TEXT CHECK (id_type IN ('tc', 'passport', 'other')),
  phone TEXT,
  email TEXT,
  nationality TEXT,
  contract_lang TEXT NOT NULL,
  contract_template_id UUID REFERENCES public.contract_templates(id),
  signature_data TEXT,
  verified_at TIMESTAMPTZ,
  verification_method TEXT,
  -- Güvenlik / log
  ip_address INET,
  device_info JSONB,
  -- Check-in/out
  room_id UUID REFERENCES public.rooms(id),
  check_in_at TIMESTAMPTZ,
  check_out_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'checked_in', 'checked_out', 'cancelled')),
  admin_notes TEXT,
  photo_url TEXT,
  id_document_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Verification codes (WhatsApp/SMS)
CREATE TABLE IF NOT EXISTS public.verification_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'sms')),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Admin / audit logs
CREATE TABLE IF NOT EXISTS public.admin_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id),
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  details JSONB,
  ip_address INET,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_room_qr_codes_room ON public.room_qr_codes(room_id);
CREATE INDEX IF NOT EXISTS idx_room_qr_codes_token ON public.room_qr_codes(token);
CREATE INDEX IF NOT EXISTS idx_room_qr_codes_expires ON public.room_qr_codes(expires_at);
CREATE INDEX IF NOT EXISTS idx_guests_status ON public.guests(status);
CREATE INDEX IF NOT EXISTS idx_guests_room ON public.guests(room_id);
CREATE INDEX IF NOT EXISTS idx_guests_created ON public.guests(created_at);
CREATE INDEX IF NOT EXISTS idx_admin_logs_staff ON public.admin_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_admin_logs_created ON public.admin_logs(created_at);

-- RLS
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.room_qr_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.verification_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_logs ENABLE ROW LEVEL SECURITY;

-- Staff: sadece kendi kaydı (auth_id = auth.uid())
CREATE POLICY "staff_own" ON public.staff FOR ALL USING (auth_id = auth.uid());

-- Rooms, templates, QR: authenticated staff tüm erişim
CREATE POLICY "rooms_all" ON public.rooms FOR ALL TO authenticated USING (true);
CREATE POLICY "room_images_all" ON public.room_images FOR ALL TO authenticated USING (true);
CREATE POLICY "contract_templates_read" ON public.contract_templates FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "contract_templates_write" ON public.contract_templates FOR ALL TO authenticated USING (true);
CREATE POLICY "room_qr_codes_all" ON public.room_qr_codes FOR ALL TO authenticated USING (true);

-- QR token ile guest sözleşme akışı: anon sadece token ile QR bilgisi ve template okuyabilsin
CREATE POLICY "room_qr_by_token" ON public.room_qr_codes FOR SELECT TO anon
  USING (expires_at > now());

-- Guests: staff tüm; anon sadece insert (yeni misafir kaydı) ve kendi kaydını güncelleme (signature vb)
CREATE POLICY "guests_staff_all" ON public.guests FOR ALL TO authenticated USING (true);
CREATE POLICY "guests_anon_insert" ON public.guests FOR INSERT TO anon WITH CHECK (true);
CREATE POLICY "guests_anon_select_own" ON public.guests FOR SELECT TO anon USING (true);
CREATE POLICY "guests_anon_update_own" ON public.guests FOR UPDATE TO anon USING (true);

-- Verification codes: anon insert/select (doğrulama akışı)
CREATE POLICY "verification_anon" ON public.verification_codes FOR ALL TO anon USING (true);
CREATE POLICY "verification_staff" ON public.verification_codes FOR ALL TO authenticated USING (true);

-- Admin logs: sadece authenticated
CREATE POLICY "admin_logs_staff" ON public.admin_logs FOR ALL TO authenticated USING (true);

-- Function: QR token oluştur / yenile
CREATE OR REPLACE FUNCTION public.generate_room_qr_token(p_room_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_token TEXT;
  v_expires TIMESTAMPTZ := now() + interval '30 days';
BEGIN
  v_token := encode(gen_random_bytes(32), 'hex');
  INSERT INTO public.room_qr_codes (room_id, token, expires_at)
  VALUES (p_room_id, v_token, v_expires);
  RETURN v_token;
END;
$$;

-- Seed: default contract template (TR)
INSERT INTO public.contract_templates (lang, version, title, content) VALUES
('tr', 1, 'Konaklama Sözleşmesi',
'VALORIA HOTEL KONAKLAMA SÖZLEŞMESİ

Misafir Bilgileri ve giriş-çıkış tarihleri rezervasyonunuza göre işlenecektir.

Oda Kuralları:
- Oda içinde sigara içilmez.
- Sessiz saatler 22:00 - 08:00 arasındadır.
- Havuz kurallarına uyulması zorunludur.

Sorumluluk: Kişisel eşyalarınızın güvenliğinden misafir sorumludur.

Bu sözleşmeyi kabul ederek yukarıdaki koşulları okuduğunuzu ve kabul ettiğinizi beyan edersiniz.')
ON CONFLICT (lang, version) DO NOTHING;
