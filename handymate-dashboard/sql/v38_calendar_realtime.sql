-- V38: Google Calendar realtidssynk via webhooks
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS calendar_watches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  calendar_connection_id UUID NOT NULL,
  channel_id TEXT NOT NULL UNIQUE,
  resource_id TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_calendar_watches_channel ON calendar_watches(channel_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_calendar_watches_business ON calendar_watches(business_id);
CREATE INDEX IF NOT EXISTS idx_calendar_watches_expires ON calendar_watches(expires_at) WHERE is_active = true;

ALTER TABLE calendar_watches ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service calendar_watches" ON calendar_watches FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Kolumn för att spåra Google-synk
ALTER TABLE booking ADD COLUMN IF NOT EXISTS synced_from_google_at TIMESTAMPTZ;
ALTER TABLE calendar_connection ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
