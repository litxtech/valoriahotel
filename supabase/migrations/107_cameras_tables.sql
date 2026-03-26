-- Tapo kamera entegrasyonu: kameralar, yetkiler, loglar

-- Kameralar
CREATE TABLE IF NOT EXISTS public.cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  ip_address VARCHAR(45) NOT NULL,
  netmask VARCHAR(45) DEFAULT '255.255.255.0',
  gateway VARCHAR(45),
  dns VARCHAR(45),
  username VARCHAR(100) NOT NULL,
  password TEXT NOT NULL,
  record_mode VARCHAR(30) DEFAULT 'motion' CHECK (record_mode IN ('motion', 'continuous', 'scheduled')),
  retention_days INTEGER DEFAULT 7,
  schedule_start TIME,
  schedule_end TIME,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Kamera yetkileri (kim hangi kamerayı izleyebilir)
CREATE TABLE IF NOT EXISTS public.camera_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  camera_id UUID NOT NULL REFERENCES public.cameras(id) ON DELETE CASCADE,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  can_view BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(camera_id, staff_id)
);

-- Kamera logları (her izleme, her işlem)
CREATE TABLE IF NOT EXISTS public.camera_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name VARCHAR(100),
  camera_id UUID REFERENCES public.cameras(id) ON DELETE SET NULL,
  camera_name VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  duration_seconds INTEGER,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- İndeksler
CREATE INDEX IF NOT EXISTS idx_cameras_is_active ON public.cameras(is_active);
CREATE INDEX IF NOT EXISTS idx_camera_permissions_staff ON public.camera_permissions(staff_id);
CREATE INDEX IF NOT EXISTS idx_camera_permissions_camera ON public.camera_permissions(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_logs_staff ON public.camera_logs(staff_id);
CREATE INDEX IF NOT EXISTS idx_camera_logs_camera ON public.camera_logs(camera_id);
CREATE INDEX IF NOT EXISTS idx_camera_logs_created ON public.camera_logs(created_at DESC);

-- RLS
ALTER TABLE public.cameras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.camera_logs ENABLE ROW LEVEL SECURITY;

-- Admin tüm kamera işlemlerini yapabilir; personel sadece yetkili kameraları görebilir
DROP POLICY IF EXISTS "cameras_admin_all" ON public.cameras;
CREATE POLICY "cameras_admin_all" ON public.cameras
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
  );

DROP POLICY IF EXISTS "camera_permissions_admin_all" ON public.camera_permissions;
CREATE POLICY "camera_permissions_admin_all" ON public.camera_permissions
  FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
  );

DROP POLICY IF EXISTS "camera_logs_insert_authenticated" ON public.camera_logs;
CREATE POLICY "camera_logs_insert_authenticated" ON public.camera_logs
  FOR INSERT TO authenticated
  WITH CHECK (true);

DROP POLICY IF EXISTS "camera_logs_admin_select" ON public.camera_logs;
CREATE POLICY "camera_logs_admin_select" ON public.camera_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
    OR staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
  );

-- Staff: yetkili kameraları listeleyebilir (camera_permissions üzerinden)
DROP POLICY IF EXISTS "cameras_staff_view_permitted" ON public.cameras;
CREATE POLICY "cameras_staff_view_permitted" ON public.cameras
  FOR SELECT TO authenticated
  USING (
    is_active = true AND (
      EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND s.role = 'admin')
      OR EXISTS (
        SELECT 1 FROM public.camera_permissions cp
        JOIN public.staff s ON s.id = cp.staff_id
        WHERE s.auth_id = auth.uid() AND cp.camera_id = cameras.id AND cp.can_view = true
      )
    )
  );

-- Staff: kendi yetkilerini okuyabilir
DROP POLICY IF EXISTS "camera_permissions_staff_select_own" ON public.camera_permissions;
CREATE POLICY "camera_permissions_staff_select_own" ON public.camera_permissions
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.staff s WHERE s.auth_id = auth.uid() AND (s.role = 'admin' OR s.id = camera_permissions.staff_id))
  );
