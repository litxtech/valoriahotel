-- Referanslı Rezervasyon ve Komisyon Takibi (Satış modülü)
-- Amaç: Müşteri kaynağı, satış sorumluları, ödeme yeri ve komisyon hakedişlerini şeffaf şekilde takip etmek.

CREATE TABLE IF NOT EXISTS public.reservation_sales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  customer_full_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_phone2 TEXT,
  customer_email TEXT,
  customer_city TEXT,
  customer_country TEXT,
  people_count INTEGER NOT NULL DEFAULT 1 CHECK (people_count >= 1),
  customer_note TEXT,

  check_in_date DATE,
  check_out_date DATE,
  nights_count INTEGER,
  room_type TEXT,
  room_id UUID REFERENCES public.rooms(id) ON DELETE SET NULL,
  room_number TEXT,
  stay_type TEXT,
  reservation_status TEXT NOT NULL DEFAULT 'draft' CHECK (
    reservation_status IN (
      'draft','talking','offered','sale_approved','deposit_received','fully_paid','confirmed',
      'checked_in','checked_out','cancelled','no_show'
    )
  ),

  source_type TEXT NOT NULL CHECK (
    source_type IN (
      'personel_kendi','personel_baglanti','dis_referans','acente','firma',
      'telefon','whatsapp','sosyal_medya','web','walk_in','tekrar'
    )
  ),
  brought_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  intermediary_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  closed_by_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  hotel_responsible_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_by_staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,

  currency TEXT NOT NULL DEFAULT 'TRY',
  sale_amount NUMERIC(12,2) NOT NULL CHECK (sale_amount >= 0),
  discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  extra_service_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (extra_service_amount >= 0),
  net_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (net_amount >= 0),
  nightly_amount NUMERIC(12,2),
  total_due_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (total_due_amount >= 0),

  payment_status TEXT NOT NULL DEFAULT 'unpaid' CHECK (payment_status IN ('unpaid','partial','paid')),
  payment_method TEXT,
  payment_place TEXT CHECK (
    payment_place IS NULL OR payment_place IN (
      'otel_kasa','otel_banka','personel_hesabi','araci_hesabi','elden','sanal_pos','online_link'
    )
  ),
  payment_received_by_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  prepaid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (prepaid_amount >= 0),
  paid_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
  remaining_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (remaining_amount >= 0),
  payment_date DATE,
  payment_time TIME,
  payment_note TEXT,

  commission_enabled BOOLEAN NOT NULL DEFAULT false,
  commission_type TEXT CHECK (commission_type IS NULL OR commission_type IN ('percent','fixed','manual')),
  commission_rate NUMERIC(7,4) CHECK (commission_rate IS NULL OR commission_rate >= 0),
  commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (commission_amount >= 0),
  commission_earner_staff_id UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  commission_shared BOOLEAN NOT NULL DEFAULT false,
  commission_status TEXT NOT NULL DEFAULT 'pending' CHECK (commission_status IN ('pending','approved','paid','rejected')),
  commission_paid_at TIMESTAMPTZ,
  commission_note TEXT,

  sales_note TEXT,
  conversation_summary TEXT,
  internal_note TEXT,
  manager_note TEXT,

  guest_id UUID REFERENCES public.guests(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT chk_dates_order CHECK (check_in_date IS NULL OR check_out_date IS NULL OR check_out_date >= check_in_date),
  CONSTRAINT chk_discount_not_over_sale CHECK (discount_amount <= sale_amount),
  CONSTRAINT chk_commission_not_over_net CHECK (commission_amount <= net_amount)
);

CREATE INDEX IF NOT EXISTS idx_reservation_sales_org_created ON public.reservation_sales(organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_sales_customer_phone ON public.reservation_sales(customer_phone);
CREATE INDEX IF NOT EXISTS idx_reservation_sales_closed_by ON public.reservation_sales(closed_by_staff_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reservation_sales_commission_earner ON public.reservation_sales(commission_earner_staff_id, commission_status);
CREATE INDEX IF NOT EXISTS idx_reservation_sales_status ON public.reservation_sales(reservation_status, payment_status, commission_status);

ALTER TABLE public.reservation_sales ENABLE ROW LEVEL SECURITY;

-- Net / ödeme / komisyon hesaplama
CREATE OR REPLACE FUNCTION public.compute_reservation_sale_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_nights INTEGER;
  v_net NUMERIC(12,2);
  v_total_due NUMERIC(12,2);
  v_remaining NUMERIC(12,2);
  v_commission NUMERIC(12,2);
BEGIN
  IF NEW.check_in_date IS NOT NULL AND NEW.check_out_date IS NOT NULL THEN
    v_nights := GREATEST(0, (NEW.check_out_date - NEW.check_in_date));
  ELSE
    v_nights := NULL;
  END IF;
  NEW.nights_count := COALESCE(NEW.nights_count, v_nights);

  v_net := COALESCE(NEW.sale_amount, 0) - COALESCE(NEW.discount_amount, 0) + COALESCE(NEW.extra_service_amount, 0);
  IF v_net < 0 THEN v_net := 0; END IF;
  NEW.net_amount := v_net;

  v_total_due := v_net;
  NEW.total_due_amount := v_total_due;

  v_remaining := GREATEST(0, COALESCE(NEW.total_due_amount, 0) - COALESCE(NEW.paid_amount, 0));
  NEW.remaining_amount := v_remaining;

  IF COALESCE(NEW.paid_amount, 0) <= 0 THEN
    NEW.payment_status := 'unpaid';
  ELSIF v_remaining > 0 THEN
    NEW.payment_status := 'partial';
  ELSE
    NEW.payment_status := 'paid';
  END IF;

  IF NEW.commission_enabled IS NOT TRUE THEN
    NEW.commission_amount := 0;
  ELSE
    IF NEW.commission_type = 'percent' THEN
      v_commission := ROUND(v_net * COALESCE(NEW.commission_rate, 0) / 100.0, 2);
      NEW.commission_amount := v_commission;
    ELSIF NEW.commission_type = 'fixed' THEN
      NEW.commission_amount := ROUND(COALESCE(NEW.commission_rate, 0), 2);
    ELSIF NEW.commission_type = 'manual' THEN
      NEW.commission_amount := ROUND(COALESCE(NEW.commission_amount, 0), 2);
    ELSE
      NEW.commission_amount := 0;
    END IF;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_reservation_sale_organization_id()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  SELECT s.organization_id INTO STRICT NEW.organization_id
  FROM public.staff s
  WHERE s.id = NEW.created_by_staff_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_reservation_sales_row()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_org UUID;
  v_other_org UUID;
BEGIN
  SELECT s.organization_id INTO STRICT v_org
  FROM public.staff s
  WHERE s.id = NEW.created_by_staff_id;

  IF NEW.closed_by_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.closed_by_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'closed_by_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.brought_by_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.brought_by_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'brought_by_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.intermediary_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.intermediary_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'intermediary_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.commission_earner_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.commission_earner_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'commission_earner_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.hotel_responsible_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.hotel_responsible_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'hotel_responsible_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.payment_received_by_staff_id IS NOT NULL THEN
    SELECT s.organization_id INTO v_other_org FROM public.staff s WHERE s.id = NEW.payment_received_by_staff_id;
    IF v_other_org IS DISTINCT FROM v_org THEN
      RAISE EXCEPTION 'payment_received_by_staff_id farkli isletmeye ait';
    END IF;
  END IF;

  IF NEW.commission_enabled IS TRUE THEN
    IF NEW.commission_earner_staff_id IS NULL THEN
      RAISE EXCEPTION 'Komisyon acikken komisyon hak edeni zorunlu';
    END IF;
    IF NEW.commission_type IS NULL THEN
      RAISE EXCEPTION 'Komisyon turu zorunlu';
    END IF;
    IF NEW.commission_type = 'percent' AND COALESCE(NEW.commission_rate, 0) > 100 THEN
      RAISE EXCEPTION 'Komisyon orani yuzde 100 ustune cikamaz';
    END IF;
  END IF;

  IF COALESCE(NEW.paid_amount, 0) > 0 AND (NEW.payment_place IS NULL OR btrim(NEW.payment_place) = '') THEN
    RAISE EXCEPTION 'Odeme girilmisse odeme yeri zorunlu';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_reservation_sales_org ON public.reservation_sales;
DROP TRIGGER IF EXISTS trg_reservation_sales_compute ON public.reservation_sales;
DROP TRIGGER IF EXISTS trg_reservation_sales_validate ON public.reservation_sales;
DROP TRIGGER IF EXISTS trg_reservation_sales_01_org ON public.reservation_sales;
DROP TRIGGER IF EXISTS trg_reservation_sales_02_validate ON public.reservation_sales;
DROP TRIGGER IF EXISTS trg_reservation_sales_03_compute ON public.reservation_sales;

CREATE TRIGGER trg_reservation_sales_01_org
  BEFORE INSERT OR UPDATE OF created_by_staff_id ON public.reservation_sales
  FOR EACH ROW EXECUTE PROCEDURE public.sync_reservation_sale_organization_id();

CREATE TRIGGER trg_reservation_sales_02_validate
  BEFORE INSERT OR UPDATE ON public.reservation_sales
  FOR EACH ROW EXECUTE PROCEDURE public.validate_reservation_sales_row();

CREATE TRIGGER trg_reservation_sales_03_compute
  BEFORE INSERT OR UPDATE ON public.reservation_sales
  FOR EACH ROW EXECUTE PROCEDURE public.compute_reservation_sale_fields();

DROP POLICY IF EXISTS "reservation_sales_select" ON public.reservation_sales;
DROP POLICY IF EXISTS "reservation_sales_insert" ON public.reservation_sales;
DROP POLICY IF EXISTS "reservation_sales_update" ON public.reservation_sales;
DROP POLICY IF EXISTS "reservation_sales_delete" ON public.reservation_sales;

CREATE POLICY "reservation_sales_select" ON public.reservation_sales
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
        AND s.organization_id = reservation_sales.organization_id
        AND (
          s.role = 'admin'
          OR s.role = 'reception_chief'
          OR s.id = reservation_sales.created_by_staff_id
          OR s.id = reservation_sales.closed_by_staff_id
          OR s.id = reservation_sales.commission_earner_staff_id
          OR s.id = reservation_sales.brought_by_staff_id
          OR s.id = reservation_sales.intermediary_staff_id
          OR s.id = reservation_sales.hotel_responsible_staff_id
          OR s.id = reservation_sales.payment_received_by_staff_id
        )
    )
  );

CREATE POLICY "reservation_sales_insert" ON public.reservation_sales
  FOR INSERT TO authenticated WITH CHECK (
    created_by_staff_id IN (SELECT s.id FROM public.staff s WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL)
  );

CREATE POLICY "reservation_sales_update" ON public.reservation_sales
  FOR UPDATE TO authenticated USING (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
        AND s.organization_id = reservation_sales.organization_id
        AND (
          s.role = 'admin'
          OR s.role = 'reception_chief'
          OR reservation_sales.created_by_staff_id = s.id
          OR reservation_sales.closed_by_staff_id = s.id
          OR reservation_sales.commission_earner_staff_id = s.id
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
        AND s.organization_id = reservation_sales.organization_id
        AND (
          s.role = 'admin'
          OR s.role = 'reception_chief'
          OR reservation_sales.created_by_staff_id = s.id
          OR reservation_sales.closed_by_staff_id = s.id
          OR reservation_sales.commission_earner_staff_id = s.id
        )
    )
  );

CREATE POLICY "reservation_sales_delete" ON public.reservation_sales
  FOR DELETE TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.staff s
      WHERE s.auth_id = auth.uid() AND s.role = 'admin' AND s.is_active = true AND s.deleted_at IS NULL
        AND s.organization_id = reservation_sales.organization_id
    )
  );

CREATE OR REPLACE FUNCTION public.my_sales_commission_summary(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL
)
RETURNS TABLE (
  sales_count BIGINT,
  total_net_amount NUMERIC,
  total_commission_amount NUMERIC,
  pending_commission_amount NUMERIC,
  paid_commission_amount NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH me AS (
    SELECT s.id AS staff_id, s.role, s.organization_id
    FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.is_active = true AND s.deleted_at IS NULL
    LIMIT 1
  ),
  base AS (
    SELECT rs.*
    FROM public.reservation_sales rs, me
    WHERE rs.organization_id = me.organization_id
      AND (p_from IS NULL OR rs.created_at::date >= p_from)
      AND (p_to IS NULL OR rs.created_at::date <= p_to)
      AND (
        me.role = 'admin'
        OR me.role = 'reception_chief'
        OR rs.closed_by_staff_id = me.staff_id
        OR rs.commission_earner_staff_id = me.staff_id
        OR rs.brought_by_staff_id = me.staff_id
        OR rs.intermediary_staff_id = me.staff_id
        OR rs.created_by_staff_id = me.staff_id
        OR rs.hotel_responsible_staff_id = me.staff_id
        OR rs.payment_received_by_staff_id = me.staff_id
      )
  )
  SELECT
    COUNT(*)::bigint AS sales_count,
    COALESCE(SUM(base.net_amount), 0) AS total_net_amount,
    COALESCE(SUM(base.commission_amount), 0) AS total_commission_amount,
    COALESCE(SUM(CASE WHEN base.commission_status IN ('pending','approved') THEN base.commission_amount ELSE 0 END), 0) AS pending_commission_amount,
    COALESCE(SUM(CASE WHEN base.commission_status = 'paid' THEN base.commission_amount ELSE 0 END), 0) AS paid_commission_amount
  FROM base;
$$;

GRANT EXECUTE ON FUNCTION public.my_sales_commission_summary(date, date) TO authenticated;
