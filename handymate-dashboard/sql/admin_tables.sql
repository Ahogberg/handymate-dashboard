-- =========================================
-- HANDYMATE - ADMIN TABELLER
-- Impersonation tokens och audit logging
-- =========================================


-- 1. IMPERSONATION_TOKENS - Tillfälliga tokens för admin-inloggning som användare
-- =========================================
CREATE TABLE IF NOT EXISTS impersonation_tokens (
  id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  token TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_business_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index för snabb token-lookup
DROP INDEX IF EXISTS idx_impersonation_tokens_token;
DROP INDEX IF EXISTS idx_impersonation_tokens_admin;
DROP INDEX IF EXISTS idx_impersonation_tokens_expires;
CREATE INDEX idx_impersonation_tokens_token ON impersonation_tokens(token);
CREATE INDEX idx_impersonation_tokens_admin ON impersonation_tokens(admin_user_id);
CREATE INDEX idx_impersonation_tokens_expires ON impersonation_tokens(expires_at);

-- RLS - endast service role kan komma åt
ALTER TABLE impersonation_tokens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "impersonation_tokens_service_only" ON impersonation_tokens;
CREATE POLICY "impersonation_tokens_service_only" ON impersonation_tokens
  FOR ALL USING (false) WITH CHECK (false);

-- Kommentar
COMMENT ON TABLE impersonation_tokens IS 'Tillfälliga tokens för admin impersonation. Utgår efter 5 minuter.';


-- 2. ADMIN_ACTIONS_LOG - Audit log för admin-åtgärder
-- =========================================
CREATE TABLE IF NOT EXISTS admin_actions_log (
  id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  target_business_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index för sökning
DROP INDEX IF EXISTS idx_admin_actions_admin;
DROP INDEX IF EXISTS idx_admin_actions_business;
DROP INDEX IF EXISTS idx_admin_actions_action;
DROP INDEX IF EXISTS idx_admin_actions_created;
CREATE INDEX idx_admin_actions_admin ON admin_actions_log(admin_user_id);
CREATE INDEX idx_admin_actions_business ON admin_actions_log(target_business_id);
CREATE INDEX idx_admin_actions_action ON admin_actions_log(action);
CREATE INDEX idx_admin_actions_created ON admin_actions_log(created_at DESC);

-- RLS - endast service role kan komma åt
ALTER TABLE admin_actions_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "admin_actions_log_service_only" ON admin_actions_log;
CREATE POLICY "admin_actions_log_service_only" ON admin_actions_log
  FOR ALL USING (false) WITH CHECK (false);

-- Kommentar
COMMENT ON TABLE admin_actions_log IS 'Audit log för alla admin-åtgärder (create_pilot, impersonate, etc)';


-- 3. CLEANUP FUNKTION - Ta bort gamla tokens
-- =========================================
CREATE OR REPLACE FUNCTION cleanup_expired_impersonation_tokens()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM impersonation_tokens
  WHERE expires_at < NOW() - INTERVAL '1 hour';

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION cleanup_expired_impersonation_tokens IS 'Tar bort impersonation tokens som utgått för mer än 1 timme sedan';


-- 4. BUSINESS_CONFIG KOLUMNER FÖR ADMIN/PILOT
-- =========================================
DO $$
BEGIN
  -- is_pilot flag
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'is_pilot') THEN
    ALTER TABLE business_config ADD COLUMN is_pilot BOOLEAN DEFAULT false;
  END IF;

  -- created_by_admin - vilken admin som skapade piloten
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'created_by_admin') THEN
    ALTER TABLE business_config ADD COLUMN created_by_admin TEXT;
  END IF;

  -- onboarding_completed_at
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'onboarding_completed_at') THEN
    ALTER TABLE business_config ADD COLUMN onboarding_completed_at TIMESTAMPTZ;
  END IF;
END $$;


-- KLART!
SELECT 'Admin tables migration completed successfully' as status;
