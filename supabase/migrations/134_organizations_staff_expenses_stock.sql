-- Çoklu işletme: Valoria, Bavul Suite, Bavultur — personel kaydında atanır; harcama/stok işletmeye bağlanır.

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  kind TEXT NOT NULL DEFAULT 'hotel' CHECK (kind IN ('hotel', 'tour_office')),
  created_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "organizations_select_authenticated" ON public.organizations;
CREATE POLICY "organizations_select_authenticated" ON public.organizations
  FOR SELECT TO authenticated USING (true);

INSERT INTO public.organizations (name, slug, kind) VALUES
  ('Valoria Hotel', 'valoria', 'hotel'),
  ('Bavul Suite', 'bavul-suite', 'hotel'),
  ('Bavultur', 'bavultur', 'tour_office')
ON CONFLICT (slug) DO NOTHING;

-- Personel: hangi otel / tur ofisi
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.staff s
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
WHERE s.organization_id IS NULL;

ALTER TABLE public.staff ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_organization_id ON public.staff(organization_id);

-- Harcamalar
ALTER TABLE public.staff_expenses
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.staff_expenses e
SET organization_id = s.organization_id
FROM public.staff s
WHERE e.staff_id = s.id AND (e.organization_id IS NULL OR e.organization_id IS DISTINCT FROM s.organization_id);

ALTER TABLE public.staff_expenses ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_staff_expenses_organization_id ON public.staff_expenses(organization_id);

CREATE OR REPLACE FUNCTION public.sync_staff_expense_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT s.organization_id INTO STRICT NEW.organization_id
  FROM public.staff s
  WHERE s.id = NEW.staff_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_staff_expenses_organization ON public.staff_expenses;
CREATE TRIGGER trg_staff_expenses_organization
  BEFORE INSERT OR UPDATE OF staff_id ON public.staff_expenses
  FOR EACH ROW EXECUTE PROCEDURE public.sync_staff_expense_organization_id();

-- Stok ürünleri: işletme bazlı envanter; barkod işletme içinde benzersiz
ALTER TABLE public.stock_products DROP CONSTRAINT IF EXISTS stock_products_barcode_key;

ALTER TABLE public.stock_products
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.stock_products p
SET organization_id = (SELECT id FROM public.organizations WHERE slug = 'valoria' LIMIT 1)
WHERE p.organization_id IS NULL;

ALTER TABLE public.stock_products ALTER COLUMN organization_id SET NOT NULL;

DROP INDEX IF EXISTS stock_products_org_barcode_uidx;
CREATE UNIQUE INDEX stock_products_org_barcode_uidx
  ON public.stock_products (organization_id, barcode)
  WHERE barcode IS NOT NULL AND btrim(barcode) <> '';

CREATE INDEX IF NOT EXISTS idx_stock_products_organization_id ON public.stock_products(organization_id);

-- Stok hareketleri
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES public.organizations(id) ON DELETE RESTRICT;

UPDATE public.stock_movements m
SET organization_id = p.organization_id
FROM public.stock_products p
WHERE m.product_id = p.id AND m.organization_id IS NULL;

ALTER TABLE public.stock_movements ALTER COLUMN organization_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_stock_movements_organization_id ON public.stock_movements(organization_id);

CREATE OR REPLACE FUNCTION public.sync_stock_movement_organization_id()
RETURNS TRIGGER AS $$
BEGIN
  SELECT p.organization_id INTO STRICT NEW.organization_id
  FROM public.stock_products p
  WHERE p.id = NEW.product_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_stock_movements_organization ON public.stock_movements;
CREATE TRIGGER trg_stock_movements_organization
  BEFORE INSERT OR UPDATE OF product_id ON public.stock_movements
  FOR EACH ROW EXECUTE PROCEDURE public.sync_stock_movement_organization_id();

-- RLS: stok — personel sadece kendi işletmesi; admin tüm işletmeler
DROP POLICY IF EXISTS "stock_products_all" ON public.stock_products;
DROP POLICY IF EXISTS "stock_products_select" ON public.stock_products;
DROP POLICY IF EXISTS "stock_products_insert" ON public.stock_products;
DROP POLICY IF EXISTS "stock_products_update" ON public.stock_products;
DROP POLICY IF EXISTS "stock_products_delete" ON public.stock_products;

CREATE POLICY "stock_products_select" ON public.stock_products
  FOR SELECT TO authenticated USING (
    organization_id IN (
      SELECT s.organization_id FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL AND s.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "stock_products_insert" ON public.stock_products
  FOR INSERT TO authenticated WITH CHECK (
    organization_id IN (
      SELECT s.organization_id FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL AND s.organization_id IS NOT NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "stock_products_update" ON public.stock_products
  FOR UPDATE TO authenticated USING (
    organization_id IN (
      SELECT s.organization_id FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  )
  WITH CHECK (
    organization_id IN (
      SELECT s.organization_id FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

CREATE POLICY "stock_products_delete" ON public.stock_products
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "stock_movements_all" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_select" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_insert" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_update" ON public.stock_movements;
DROP POLICY IF EXISTS "stock_movements_delete" ON public.stock_movements;

CREATE POLICY "stock_movements_select" ON public.stock_movements
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_movements.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_movements_insert" ON public.stock_movements
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_movements_update" ON public.stock_movements
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_movements.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_movements.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_movements_delete" ON public.stock_movements
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

-- Stok uyarı / sayım: ürün üzerinden işletme
DROP POLICY IF EXISTS "stock_alerts_all" ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts_select" ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts_insert" ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts_update" ON public.stock_alerts;
DROP POLICY IF EXISTS "stock_alerts_delete" ON public.stock_alerts;

CREATE POLICY "stock_alerts_select" ON public.stock_alerts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_alerts.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_alerts_insert" ON public.stock_alerts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_alerts_update" ON public.stock_alerts
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_alerts.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_alerts_delete" ON public.stock_alerts
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS "stock_counts_all" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_select" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_insert" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_update" ON public.stock_counts;
DROP POLICY IF EXISTS "stock_counts_delete" ON public.stock_counts;

CREATE POLICY "stock_counts_select" ON public.stock_counts
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_counts.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_counts_insert" ON public.stock_counts
  FOR INSERT TO authenticated WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_counts_update" ON public.stock_counts
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.stock_products p
      JOIN public.staff s ON s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
      WHERE p.id = stock_counts.product_id
        AND (s.role = 'admin' OR p.organization_id = s.organization_id)
    )
  );

CREATE POLICY "stock_counts_delete" ON public.stock_counts
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
    )
  );
