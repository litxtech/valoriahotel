-- OPS queue: Postgres-backed job queue for KBS submissions
-- Purpose: decouple receptionist UI from slow external provider calls.

BEGIN;

CREATE TABLE IF NOT EXISTS ops.jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id uuid NOT NULL REFERENCES ops.hotels(id) ON DELETE RESTRICT,
  job_type text NOT NULL CHECK (job_type IN ('kbs_check_in','kbs_check_out')),
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','succeeded','failed','cancelled')),
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  attempt int NOT NULL DEFAULT 0,
  max_attempts int NOT NULL DEFAULT 6,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ops_jobs_hotel_status_run_idx
  ON ops.jobs (hotel_id, status, run_at ASC);
CREATE INDEX IF NOT EXISTS ops_jobs_status_run_idx
  ON ops.jobs (status, run_at ASC);

DROP TRIGGER IF EXISTS trg_ops_jobs_updated ON ops.jobs;
CREATE TRIGGER trg_ops_jobs_updated BEFORE UPDATE ON ops.jobs
  FOR EACH ROW EXECUTE FUNCTION ops.touch_updated_at();

ALTER TABLE ops.jobs ENABLE ROW LEVEL SECURITY;

-- No client writes. Admin can read own hotel jobs (optional).
DROP POLICY IF EXISTS "ops_jobs_admin_select" ON ops.jobs;
CREATE POLICY "ops_jobs_admin_select" ON ops.jobs
  FOR SELECT TO authenticated
  USING (ops.is_admin() AND hotel_id = ops.current_hotel_id());

DROP POLICY IF EXISTS "ops_jobs_admin_write" ON ops.jobs;
CREATE POLICY "ops_jobs_admin_write" ON ops.jobs
  FOR ALL TO authenticated
  USING (false)
  WITH CHECK (false);

-- Claim next job atomically (SKIP LOCKED) for workers.
CREATE OR REPLACE FUNCTION ops.claim_next_job(p_locked_by text)
RETURNS TABLE (
  id uuid,
  hotel_id uuid,
  job_type text,
  payload jsonb,
  attempt int,
  max_attempts int
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT j.id
  INTO v_id
  FROM ops.jobs j
  WHERE j.status = 'queued'
    AND j.run_at <= now()
    AND (j.locked_at IS NULL OR j.locked_at < now() - interval '10 minutes')
    AND j.attempt < j.max_attempts
  ORDER BY j.run_at ASC, j.created_at ASC
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE ops.jobs
  SET status = 'processing',
      locked_at = now(),
      locked_by = p_locked_by,
      attempt = attempt + 1
  WHERE id = v_id;

  RETURN QUERY
  SELECT j.id, j.hotel_id, j.job_type, j.payload, j.attempt, j.max_attempts
  FROM ops.jobs j
  WHERE j.id = v_id;
END;
$$;

REVOKE ALL ON FUNCTION ops.claim_next_job(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.claim_next_job(text) TO service_role;

COMMIT;

