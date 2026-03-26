-- Haritada kullanıcı avatarı: Konum paylaşımına katılan kullanıcılar avatar ile gösterilir.
-- Opt-in: Sadece paylaşımı açan kullanıcılar haritada görünür.

CREATE TABLE IF NOT EXISTS public.map_user_locations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  user_type TEXT NOT NULL CHECK (user_type IN ('guest', 'staff')),
  lat DECIMAL(10, 8) NOT NULL,
  lng DECIMAL(11, 8) NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT uq_map_user_locations_user UNIQUE (user_id, user_type)
);

CREATE INDEX IF NOT EXISTS idx_map_user_locations_updated ON public.map_user_locations(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_map_user_locations_lat_lng ON public.map_user_locations(lat, lng);

COMMENT ON TABLE public.map_user_locations IS 'Haritada avatar ile gösterilecek kullanıcılar; konum paylaşımı açık olanlar.';

-- RLS
ALTER TABLE public.map_user_locations ENABLE ROW LEVEL SECURITY;

-- Kullanıcı kendi konumunu upsert edebilir
CREATE POLICY map_user_locations_upsert_own ON public.map_user_locations
  FOR ALL
  USING (
    (user_type = 'guest' AND user_id IN (SELECT id FROM public.guests WHERE auth_user_id = auth.uid()))
    OR
    (user_type = 'staff' AND user_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid()))
  )
  WITH CHECK (
    (user_type = 'guest' AND user_id IN (SELECT id FROM public.guests WHERE auth_user_id = auth.uid()))
    OR
    (user_type = 'staff' AND user_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid()))
  );

-- Giriş yapmış kullanıcılar (guest/staff) haritadaki diğer kullanıcıları okuyabilir
CREATE POLICY map_user_locations_select_authenticated ON public.map_user_locations
  FOR SELECT
  USING (auth.uid() IS NOT NULL);
