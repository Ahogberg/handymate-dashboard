-- ============================================================
-- Agent ↔ Google Calendar/Gmail Integration
-- Adds google_event_id to booking + gmail send scope tracking
-- ============================================================

-- Allow bookings to be synced to Google Calendar
ALTER TABLE booking ADD COLUMN IF NOT EXISTS google_event_id TEXT;
ALTER TABLE booking ADD COLUMN IF NOT EXISTS synced_to_google_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booking_google_event
  ON booking(google_event_id) WHERE google_event_id IS NOT NULL;

-- Track whether gmail.send scope was granted during OAuth
ALTER TABLE calendar_connection ADD COLUMN IF NOT EXISTS gmail_send_scope_granted BOOLEAN DEFAULT false;
