-- Google Calendar Integration
-- Run in Supabase SQL Editor

-- Calendar connections table
CREATE TABLE IF NOT EXISTS calendar_connection (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  business_user_id TEXT NOT NULL REFERENCES business_users(id),
  provider TEXT NOT NULL DEFAULT 'google',
  account_email TEXT,
  calendar_id TEXT,
  access_token TEXT,
  refresh_token TEXT,
  token_expires_at TIMESTAMPTZ,
  sync_enabled BOOLEAN DEFAULT true,
  sync_direction TEXT DEFAULT 'both' CHECK (sync_direction IN ('export', 'import', 'both')),
  last_sync_at TIMESTAMPTZ,
  sync_error TEXT,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_connection_business ON calendar_connection(business_id);
CREATE INDEX IF NOT EXISTS idx_calendar_connection_user ON calendar_connection(business_user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_connection_unique ON calendar_connection(business_user_id, provider);

-- Add google_event_id to schedule_entry for tracking synced events
ALTER TABLE schedule_entry ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE schedule_entry ADD COLUMN IF NOT EXISTS synced_to_google_at TIMESTAMPTZ;
ALTER TABLE schedule_entry ADD COLUMN IF NOT EXISTS external_source TEXT;

CREATE INDEX IF NOT EXISTS idx_schedule_entry_google ON schedule_entry(google_event_id) WHERE google_event_id IS NOT NULL;

-- RLS policies
ALTER TABLE calendar_connection ENABLE ROW LEVEL SECURITY;

CREATE POLICY "calendar_connection_business_access" ON calendar_connection
  FOR ALL USING (business_id = current_setting('app.business_id', true)::TEXT);
