-- Gmail Lead Import automation
-- Run after gmail_integration.sql

-- Settings stored in calendar_connection
ALTER TABLE calendar_connection
  ADD COLUMN IF NOT EXISTS gmail_lead_import_enabled BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS gmail_lead_approved_senders TEXT DEFAULT '',   -- comma-separated domains/emails
  ADD COLUMN IF NOT EXISTS gmail_lead_blocked_senders TEXT DEFAULT '',    -- comma-separated
  ADD COLUMN IF NOT EXISTS gmail_lead_last_import_at TIMESTAMPTZ;

-- Idempotency: track which Gmail messages have been processed
CREATE TABLE IF NOT EXISTS gmail_imported_message (
  id TEXT PRIMARY KEY,                     -- gmail message_id
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  lead_id TEXT,                            -- created lead (null if not a lead)
  was_lead BOOLEAN NOT NULL DEFAULT FALSE, -- haiku verdict
  imported_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_gmail_imported_business ON gmail_imported_message(business_id);
