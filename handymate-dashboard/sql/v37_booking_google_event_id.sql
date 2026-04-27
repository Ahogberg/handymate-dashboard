-- v37: Spara Google Calendar event-ID på booking för uppdatering/radering

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS google_event_id TEXT,
  ADD COLUMN IF NOT EXISTS google_calendar_id TEXT;

CREATE INDEX IF NOT EXISTS idx_booking_google_event
  ON booking(google_event_id) WHERE google_event_id IS NOT NULL;

COMMENT ON COLUMN booking.google_event_id IS
  'ID på motsvarande event i Google Calendar (om kopplat). Null = ingen sync.';
COMMENT ON COLUMN booking.google_calendar_id IS
  'Vilket Google-kalender event:et hör till. Sparas för säker update/delete.';
