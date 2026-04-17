-- Personel görev atamaları (admin / gorev_ata yetkisi); oda listesi + push bildirimi ile uyumlu

CREATE TABLE IF NOT EXISTS public.staff_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  body TEXT,
  task_type TEXT NOT NULL DEFAULT 'general'
    CHECK (task_type IN ('reception', 'housekeeping', 'technical', 'security', 'general')),
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'cancelled')),
  assigned_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  created_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  room_ids UUID[] NOT NULL DEFAULT '{}',
  due_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_assignments_assigned
  ON public.staff_assignments(assigned_staff_id);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_status
  ON public.staff_assignments(status);
CREATE INDEX IF NOT EXISTS idx_staff_assignments_created
  ON public.staff_assignments(created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_staff_assignments_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_staff_assignments_updated ON public.staff_assignments;
CREATE TRIGGER trg_staff_assignments_updated
  BEFORE UPDATE ON public.staff_assignments
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_staff_assignments_updated_at();

ALTER TABLE public.staff_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_assignments_select" ON public.staff_assignments;
CREATE POLICY "staff_assignments_select" ON public.staff_assignments
  FOR SELECT TO authenticated
  USING (
    assigned_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid() AND role = 'admin')
  );

DROP POLICY IF EXISTS "staff_assignments_insert" ON public.staff_assignments;
CREATE POLICY "staff_assignments_insert" ON public.staff_assignments
  FOR INSERT TO authenticated
  WITH CHECK (
    created_by_staff_id = (SELECT id FROM public.staff WHERE auth_id = auth.uid() LIMIT 1)
    AND EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid()
        AND (
          s.role = 'admin'
          OR COALESCE((s.app_permissions->>'gorev_ata') = 'true', false)
        )
    )
  );

DROP POLICY IF EXISTS "staff_assignments_update_assigned" ON public.staff_assignments;
CREATE POLICY "staff_assignments_update_assigned" ON public.staff_assignments
  FOR UPDATE TO authenticated
  USING (assigned_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid()))
  WITH CHECK (assigned_staff_id IN (SELECT id FROM public.staff WHERE auth_id = auth.uid()));

DROP POLICY IF EXISTS "staff_assignments_update_admin" ON public.staff_assignments;
CREATE POLICY "staff_assignments_update_admin" ON public.staff_assignments
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid() AND role = 'admin'))
  WITH CHECK (true);

DROP POLICY IF EXISTS "staff_assignments_delete_admin" ON public.staff_assignments;
CREATE POLICY "staff_assignments_delete_admin" ON public.staff_assignments
  FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.staff WHERE auth_id = auth.uid() AND role = 'admin'));

COMMENT ON TABLE public.staff_assignments IS 'Admin/gorev_ata: personele atanan görevler; room_ids ilgili odalar';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_assignments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.staff_assignments;
  END IF;
END $$;
