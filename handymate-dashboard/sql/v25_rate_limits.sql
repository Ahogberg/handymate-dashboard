-- V25: Persistent rate limiting (ersätter in-memory Map)
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS rate_limit_bucket (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL DEFAULT 0,
  reset_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_reset ON rate_limit_bucket(reset_at);

-- RLS: endast service_role (rate limiting görs alltid server-side)
ALTER TABLE rate_limit_bucket ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_rate_limit' AND tablename = 'rate_limit_bucket') THEN
    CREATE POLICY service_rate_limit ON rate_limit_bucket FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Atomisk increment-funktion
-- Returnerar: (count, reset_at) efter increment
CREATE OR REPLACE FUNCTION rate_limit_check(
  p_key TEXT,
  p_max INTEGER,
  p_window_ms BIGINT
) RETURNS TABLE(new_count INTEGER, reset_at TIMESTAMPTZ, allowed BOOLEAN) AS $$
DECLARE
  v_now TIMESTAMPTZ := NOW();
  v_reset TIMESTAMPTZ;
  v_count INTEGER;
BEGIN
  -- Upsert med atomisk increment
  INSERT INTO rate_limit_bucket(key, count, reset_at, updated_at)
  VALUES (p_key, 1, v_now + (p_window_ms || ' milliseconds')::INTERVAL, v_now)
  ON CONFLICT (key) DO UPDATE SET
    -- Om fönstret har passerat → starta om
    count = CASE WHEN rate_limit_bucket.reset_at < v_now THEN 1
                 ELSE rate_limit_bucket.count + 1 END,
    reset_at = CASE WHEN rate_limit_bucket.reset_at < v_now
                    THEN v_now + (p_window_ms || ' milliseconds')::INTERVAL
                    ELSE rate_limit_bucket.reset_at END,
    updated_at = v_now
  RETURNING count, rate_limit_bucket.reset_at INTO v_count, v_reset;

  RETURN QUERY SELECT v_count, v_reset, (v_count <= p_max);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Städning: ta bort gamla buckets
CREATE OR REPLACE FUNCTION rate_limit_cleanup() RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM rate_limit_bucket WHERE reset_at < NOW() - INTERVAL '1 day';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
