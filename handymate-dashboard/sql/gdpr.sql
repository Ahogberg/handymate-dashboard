-- GDPR compliance tables and columns

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS deletion_reason TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS privacy_accepted_at TIMESTAMPTZ;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS data_retention_days INTEGER DEFAULT 365;

-- Consent tracking
CREATE TABLE IF NOT EXISTS consent_log (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT,
  user_ip TEXT,
  consent_type TEXT NOT NULL,
  accepted BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consent_log_business ON consent_log(business_id);
