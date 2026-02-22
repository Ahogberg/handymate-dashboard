-- Gmail Integration
-- Extends calendar_connection to support Gmail read access
-- Run in Supabase SQL Editor

-- Track whether the Gmail scope was granted during OAuth
ALTER TABLE calendar_connection ADD COLUMN IF NOT EXISTS gmail_scope_granted BOOLEAN DEFAULT false;

-- User toggle: show customer emails in timeline
ALTER TABLE calendar_connection ADD COLUMN IF NOT EXISTS gmail_sync_enabled BOOLEAN DEFAULT false;

-- Last Gmail sync timestamp
ALTER TABLE calendar_connection ADD COLUMN IF NOT EXISTS gmail_last_sync_at TIMESTAMPTZ;
