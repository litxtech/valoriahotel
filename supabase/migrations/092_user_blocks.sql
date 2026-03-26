-- Kullanıcı engelleme sistemi (staff/guest arası ve kendi tipleri içinde).
-- Bu migration "public.staff" yoksa da çalışır (ör. eksik/parsiyel şema).
-- Kural: Bir taraf diğerini engellerse iki taraf da birbirini görmez.

CREATE TABLE IF NOT EXISTS public.user_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_type TEXT NOT NULL CHECK (blocker_type IN ('staff', 'guest')),
  blocker_staff_id UUID,
  blocker_guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
  blocked_type TEXT NOT NULL CHECK (blocked_type IN ('staff', 'guest')),
  blocked_staff_id UUID,
  blocked_guest_id UUID REFERENCES public.guests(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT user_blocks_blocker_exactly_one CHECK (
    (blocker_staff_id IS NOT NULL AND blocker_guest_id IS NULL AND blocker_type = 'staff') OR
    (blocker_staff_id IS NULL AND blocker_guest_id IS NOT NULL AND blocker_type = 'guest')
  ),
  CONSTRAINT user_blocks_blocked_exactly_one CHECK (
    (blocked_staff_id IS NOT NULL AND blocked_guest_id IS NULL AND blocked_type = 'staff') OR
    (blocked_staff_id IS NULL AND blocked_guest_id IS NOT NULL AND blocked_type = 'guest')
  ),
  CONSTRAINT user_blocks_no_self_staff CHECK (NOT (blocker_type = 'staff' AND blocked_type = 'staff' AND blocker_staff_id = blocked_staff_id)),
  CONSTRAINT user_blocks_no_self_guest CHECK (NOT (blocker_type = 'guest' AND blocked_type = 'guest' AND blocker_guest_id = blocked_guest_id))
);

DO $$
BEGIN
  IF to_regclass('public.staff') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'user_blocks_blocker_staff_fk'
        AND conrelid = 'public.user_blocks'::regclass
    ) THEN
      ALTER TABLE public.user_blocks
        ADD CONSTRAINT user_blocks_blocker_staff_fk
        FOREIGN KEY (blocker_staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'user_blocks_blocked_staff_fk'
        AND conrelid = 'public.user_blocks'::regclass
    ) THEN
      ALTER TABLE public.user_blocks
        ADD CONSTRAINT user_blocks_blocked_staff_fk
        FOREIGN KEY (blocked_staff_id) REFERENCES public.staff(id) ON DELETE CASCADE;
    END IF;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_staff_staff
  ON public.user_blocks (blocker_staff_id, blocked_staff_id)
  WHERE blocker_type = 'staff' AND blocked_type = 'staff';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_staff_guest
  ON public.user_blocks (blocker_staff_id, blocked_guest_id)
  WHERE blocker_type = 'staff' AND blocked_type = 'guest';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_guest_staff
  ON public.user_blocks (blocker_guest_id, blocked_staff_id)
  WHERE blocker_type = 'guest' AND blocked_type = 'staff';

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_blocks_guest_guest
  ON public.user_blocks (blocker_guest_id, blocked_guest_id)
  WHERE blocker_type = 'guest' AND blocked_type = 'guest';

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_staff ON public.user_blocks(blocker_staff_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_staff ON public.user_blocks(blocked_staff_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker_guest ON public.user_blocks(blocker_guest_id);
CREATE INDEX IF NOT EXISTS idx_user_blocks_blocked_guest ON public.user_blocks(blocked_guest_id);

ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS user_blocks_select_own ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_insert_own ON public.user_blocks;
DROP POLICY IF EXISTS user_blocks_delete_own ON public.user_blocks;
DO $$
DECLARE
  has_staff BOOLEAN := to_regclass('public.staff') IS NOT NULL;
  has_guest_auth_user_id BOOLEAN := EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.guests'::regclass
      AND attname = 'auth_user_id'
      AND NOT attisdropped
  );
  has_guest_email BOOLEAN := EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.guests'::regclass
      AND attname = 'email'
      AND NOT attisdropped
  );
  has_guest_deleted_at BOOLEAN := EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.guests'::regclass
      AND attname = 'deleted_at'
      AND NOT attisdropped
  );
  guest_auth_expr TEXT;
  guest_alive_expr TEXT;
  guest_actor_expr TEXT;
BEGIN
  IF has_guest_auth_user_id THEN
    guest_auth_expr := 'g.auth_user_id = auth.uid()';
  ELSIF has_guest_email THEN
    guest_auth_expr := 'lower(trim(coalesce(g.email, ''''))) = lower(trim(coalesce(auth.jwt() ->> ''email'', '''')))';
  ELSE
    guest_auth_expr := 'FALSE';
  END IF;

  IF has_guest_deleted_at THEN
    guest_alive_expr := 'g.deleted_at IS NULL';
  ELSE
    guest_alive_expr := 'TRUE';
  END IF;

  guest_actor_expr := '(' || guest_auth_expr || ' AND ' || guest_alive_expr || ')';

  IF has_staff THEN
    EXECUTE format($policy$
      CREATE POLICY user_blocks_select_own
      ON public.user_blocks
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.staff s
          WHERE s.auth_id = auth.uid()
            AND s.is_active = true
            AND (s.id = blocker_staff_id OR s.id = blocked_staff_id)
        )
        OR
        EXISTS (
          SELECT 1
          FROM public.guests g
          WHERE %s
            AND (g.id = blocker_guest_id OR g.id = blocked_guest_id)
        )
      );
    $policy$, guest_actor_expr);

    EXECUTE format($policy$
      CREATE POLICY user_blocks_insert_own
      ON public.user_blocks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        (
          blocker_type = 'staff'
          AND blocker_staff_id IS NOT NULL
          AND blocker_guest_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.staff s
            WHERE s.id = blocker_staff_id
              AND s.auth_id = auth.uid()
              AND s.is_active = true
          )
        )
        OR
        (
          blocker_type = 'guest'
          AND blocker_guest_id IS NOT NULL
          AND blocker_staff_id IS NULL
          AND EXISTS (
            SELECT 1 FROM public.guests g
            WHERE g.id = blocker_guest_id
              AND %s
          )
        )
      );
    $policy$, guest_actor_expr);

    EXECUTE format($policy$
      CREATE POLICY user_blocks_delete_own
      ON public.user_blocks
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.staff s
          WHERE s.id = blocker_staff_id
            AND s.auth_id = auth.uid()
            AND s.is_active = true
        )
        OR
        EXISTS (
          SELECT 1 FROM public.guests g
          WHERE g.id = blocker_guest_id
            AND %s
        )
      );
    $policy$, guest_actor_expr);
  ELSE
    EXECUTE format($policy$
      CREATE POLICY user_blocks_select_own
      ON public.user_blocks
      FOR SELECT
      TO authenticated
      USING (
        EXISTS (
          SELECT 1
          FROM public.guests g
          WHERE %s
            AND (g.id = blocker_guest_id OR g.id = blocked_guest_id)
        )
      );
    $policy$, guest_actor_expr);

    EXECUTE format($policy$
      CREATE POLICY user_blocks_insert_own
      ON public.user_blocks
      FOR INSERT
      TO authenticated
      WITH CHECK (
        blocker_type = 'guest'
        AND blocker_guest_id IS NOT NULL
        AND blocker_staff_id IS NULL
        AND EXISTS (
          SELECT 1 FROM public.guests g
          WHERE g.id = blocker_guest_id
            AND %s
        )
      );
    $policy$, guest_actor_expr);

    EXECUTE format($policy$
      CREATE POLICY user_blocks_delete_own
      ON public.user_blocks
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.guests g
          WHERE g.id = blocker_guest_id
            AND %s
        )
      );
    $policy$, guest_actor_expr);
  END IF;
END $$;
