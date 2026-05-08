-- V50: Lägg till on_my_way_at på booking-tabellen
-- Används av POST /api/on-my-way för att markera när hantverkaren tryckte
-- "på väg" mot kunden. Mobile Verksamhet-vyn kan filtrera bookings på
-- detta fält för att visa "på väg"-status.
--
-- Kör manuellt i Supabase SQL Editor.

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS on_my_way_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_booking_on_my_way
  ON booking(business_id, on_my_way_at)
  WHERE on_my_way_at IS NOT NULL;

COMMENT ON COLUMN booking.on_my_way_at IS
  'Tidsstämpel när "på väg"-SMS skickades via /api/on-my-way. NULL = ej skickat.';
