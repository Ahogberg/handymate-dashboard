-- =========================================
-- HANDYMATE - ADMIN TABELLER
-- Impersonation tokens och audit logging
-- =========================================

-- 1. IMPERSONATION_TOKENS
-- =========================================
DROP TABLE IF EXISTS impersonation_tokens;

CREATE TABLE impersonation_tokens (
  token_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  token TEXT NOT NULL UNIQUE,
  admin_user_id TEXT NOT NULL,
  target_user_id TEXT NOT NULL,
  target_business_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used BOOLEAN DEFAULT false,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_impersonation_tokens_token ON impersonation_tokens(token);
CREATE INDEX idx_impersonation_tokens_admin ON impersonation_tokens(admin_user_id);
CREATE INDEX idx_impersonation_tokens_expires ON impersonation_tokens(expires_at);

ALTER TABLE impersonation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "impersonation_tokens_service_only" ON impersonation_tokens
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE impersonation_tokens IS 'Tillfälliga tokens för admin impersonation. Utgår efter 5 minuter.';


-- 2. ADMIN_ACTIONS_LOG
-- =========================================
DROP TABLE IF EXISTS admin_actions_log;

CREATE TABLE admin_actions_log (
  log_id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  action TEXT NOT NULL,
  admin_user_id TEXT NOT NULL,
  admin_email TEXT,
  target_business_id TEXT,
  details JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_admin_actions_admin ON admin_actions_log(admin_user_id);
CREATE INDEX idx_admin_actions_business ON admin_actions_log(target_business_id);
CREATE INDEX idx_admin_actions_action ON admin_actions_log(action);
CREATE INDEX idx_admin_actions_created ON admin_actions_log(created_at DESC);

ALTER TABLE admin_actions_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_actions_log_service_only" ON admin_actions_log
  FOR ALL USING (false) WITH CHECK (false);

COMMENT ON TABLE admin_actions_log IS 'Audit log för alla admin-åtgärder';


-- 3. CLEANUP FUNKTION
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


-- 4. BUSINESS_CONFIG KOLUMNER
-- =========================================
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS is_pilot BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS created_by_admin TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMPTZ;


-- KLART!
SELECT 'Admin tables created successfully' as status;
