-- Karbon ayak izi: aylik otel girdileri + misafir bazli otomatik hesap

CREATE TABLE IF NOT EXISTS public.hotel_carbon_monthly_inputs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month_start DATE NOT NULL UNIQUE,
  electricity_kwh NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (electricity_kwh >= 0),
  water_m3 NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (water_m3 >= 0),
  gas_m3 NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (gas_m3 >= 0),
  waste_kg NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (waste_kg >= 0),
  occupancy_nights_override NUMERIC(12,2) CHECK (occupancy_nights_override IS NULL OR occupancy_nights_override > 0),
  electricity_factor NUMERIC(10,4) NOT NULL DEFAULT 0.42,
  water_factor NUMERIC(10,4) NOT NULL DEFAULT 0.30,
  gas_factor NUMERIC(10,4) NOT NULL DEFAULT 1.90,
  waste_factor NUMERIC(10,4) NOT NULL DEFAULT 0.50,
  notes TEXT,
  created_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_hotel_carbon_monthly_inputs_month_start
  ON public.hotel_carbon_monthly_inputs(month_start DESC);

ALTER TABLE public.hotel_carbon_monthly_inputs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hotel_carbon_monthly_inputs_select_auth" ON public.hotel_carbon_monthly_inputs;
CREATE POLICY "hotel_carbon_monthly_inputs_select_auth"
ON public.hotel_carbon_monthly_inputs
FOR SELECT
TO authenticated
USING (true);

DROP POLICY IF EXISTS "hotel_carbon_monthly_inputs_admin_write" ON public.hotel_carbon_monthly_inputs;
CREATE POLICY "hotel_carbon_monthly_inputs_admin_write"
ON public.hotel_carbon_monthly_inputs
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.staff s
    WHERE s.auth_id = auth.uid() AND s.role = 'admin'
  )
);

CREATE OR REPLACE FUNCTION public.set_hotel_carbon_monthly_inputs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS hotel_carbon_monthly_inputs_updated_at
  ON public.hotel_carbon_monthly_inputs;
CREATE TRIGGER hotel_carbon_monthly_inputs_updated_at
BEFORE UPDATE ON public.hotel_carbon_monthly_inputs
FOR EACH ROW
EXECUTE PROCEDURE public.set_hotel_carbon_monthly_inputs_updated_at();

CREATE OR REPLACE FUNCTION public.get_my_latest_stay_carbon()
RETURNS TABLE (
  guest_id UUID,
  stay_check_in_at TIMESTAMPTZ,
  stay_check_out_at TIMESTAMPTZ,
  stay_nights NUMERIC,
  month_start DATE,
  occupancy_nights NUMERIC,
  electricity_kwh NUMERIC,
  water_m3 NUMERIC,
  gas_m3 NUMERIC,
  waste_kg NUMERIC,
  electricity_kg_co2 NUMERIC,
  water_kg_co2 NUMERIC,
  gas_kg_co2 NUMERIC,
  waste_kg_co2 NUMERIC,
  total_kg_co2 NUMERIC
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid UUID := auth.uid();
BEGIN
  RETURN QUERY
  WITH my_guest AS (
    SELECT g.id, g.check_in_at, g.check_out_at, g.nights_count
    FROM public.guests g
    WHERE g.auth_user_id = v_uid
      AND g.check_in_at IS NOT NULL
      AND g.deleted_at IS NULL
    ORDER BY COALESCE(g.check_out_at, g.check_in_at) DESC
    LIMIT 1
  ),
  month_input AS (
    SELECT i.*
    FROM my_guest mg
    JOIN public.hotel_carbon_monthly_inputs i
      ON i.month_start = date_trunc('month', mg.check_in_at)::date
    LIMIT 1
  ),
  occupancy AS (
    SELECT
      mi.month_start,
      COALESCE(
        mi.occupancy_nights_override,
        NULLIF((
          SELECT SUM(
            GREATEST(
              COALESCE(g2.nights_count, 0),
              CASE
                WHEN g2.check_in_at IS NULL THEN 0
                WHEN g2.check_out_at IS NULL THEN
                  GREATEST(
                    1,
                    CEIL(EXTRACT(EPOCH FROM (date_trunc('month', mi.month_start) + interval '1 month' - g2.check_in_at)) / 86400.0)
                  )::numeric
                ELSE
                  GREATEST(
                    1,
                    CEIL(EXTRACT(EPOCH FROM (g2.check_out_at - g2.check_in_at)) / 86400.0)
                  )::numeric
              END
            )
          )
          FROM public.guests g2
          WHERE g2.deleted_at IS NULL
            AND g2.check_in_at IS NOT NULL
            AND date_trunc('month', g2.check_in_at)::date = mi.month_start
        ), 0)
      ) AS total_nights
    FROM month_input mi
  ),
  calc AS (
    SELECT
      mg.id AS guest_id,
      mg.check_in_at,
      mg.check_out_at,
      GREATEST(
        COALESCE(mg.nights_count, 0),
        CASE
          WHEN mg.check_out_at IS NULL THEN 1
          ELSE GREATEST(
            1,
            CEIL(EXTRACT(EPOCH FROM (mg.check_out_at - mg.check_in_at)) / 86400.0)
          )::numeric
        END
      ) AS guest_nights,
      mi.month_start,
      o.total_nights,
      mi.electricity_kwh,
      mi.water_m3,
      mi.gas_m3,
      mi.waste_kg,
      mi.electricity_factor,
      mi.water_factor,
      mi.gas_factor,
      mi.waste_factor
    FROM my_guest mg
    JOIN month_input mi ON true
    JOIN occupancy o ON o.month_start = mi.month_start
  )
  SELECT
    c.guest_id,
    c.check_in_at,
    c.check_out_at,
    c.guest_nights,
    c.month_start,
    c.total_nights,
    ROUND((c.electricity_kwh * c.guest_nights / NULLIF(c.total_nights, 0)), 2) AS electricity_kwh,
    ROUND((c.water_m3 * c.guest_nights / NULLIF(c.total_nights, 0)), 2) AS water_m3,
    ROUND((c.gas_m3 * c.guest_nights / NULLIF(c.total_nights, 0)), 2) AS gas_m3,
    ROUND((c.waste_kg * c.guest_nights / NULLIF(c.total_nights, 0)), 2) AS waste_kg,
    ROUND((c.electricity_kwh * c.guest_nights / NULLIF(c.total_nights, 0)) * c.electricity_factor, 2) AS electricity_kg_co2,
    ROUND((c.water_m3 * c.guest_nights / NULLIF(c.total_nights, 0)) * c.water_factor, 2) AS water_kg_co2,
    ROUND((c.gas_m3 * c.guest_nights / NULLIF(c.total_nights, 0)) * c.gas_factor, 2) AS gas_kg_co2,
    ROUND((c.waste_kg * c.guest_nights / NULLIF(c.total_nights, 0)) * c.waste_factor, 2) AS waste_kg_co2,
    ROUND(
      ((c.electricity_kwh * c.guest_nights / NULLIF(c.total_nights, 0)) * c.electricity_factor)
      + ((c.water_m3 * c.guest_nights / NULLIF(c.total_nights, 0)) * c.water_factor)
      + ((c.gas_m3 * c.guest_nights / NULLIF(c.total_nights, 0)) * c.gas_factor)
      + ((c.waste_kg * c.guest_nights / NULLIF(c.total_nights, 0)) * c.waste_factor),
      2
    ) AS total_kg_co2
  FROM calc c
  WHERE c.total_nights > 0;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_latest_stay_carbon() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_latest_stay_carbon() TO authenticated;
