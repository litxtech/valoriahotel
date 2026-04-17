-- OPS demo bootstrap: service_role callable helper for local/dev seeding
-- This does NOT create auth.users. It only seeds ops.* rows for a demo hotel.

BEGIN;

CREATE OR REPLACE FUNCTION ops.bootstrap_demo_hotel(
  p_code text DEFAULT 'valoria-ops',
  p_name text DEFAULT 'Valoria Hotel (OPS)',
  p_room_prefix text DEFAULT '',
  p_room_start int DEFAULT 101,
  p_room_count int DEFAULT 10
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_hotel_id uuid;
BEGIN
  INSERT INTO ops.hotels (code, name)
  VALUES (p_code, p_name)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_hotel_id;

  INSERT INTO ops.hotel_settings (hotel_id)
  VALUES (v_hotel_id)
  ON CONFLICT (hotel_id) DO NOTHING;

  -- Seed rooms only if none exist for this hotel.
  IF NOT EXISTS (SELECT 1 FROM ops.rooms r WHERE r.hotel_id = v_hotel_id) THEN
    INSERT INTO ops.rooms (hotel_id, room_number, is_active)
    SELECT
      v_hotel_id,
      (p_room_prefix || (p_room_start + i)::text),
      true
    FROM generate_series(0, GREATEST(p_room_count, 1) - 1) AS i;
  END IF;

  RETURN v_hotel_id;
END;
$$;

REVOKE ALL ON FUNCTION ops.bootstrap_demo_hotel(text, text, text, int, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ops.bootstrap_demo_hotel(text, text, text, int, int) TO service_role;

COMMIT;

