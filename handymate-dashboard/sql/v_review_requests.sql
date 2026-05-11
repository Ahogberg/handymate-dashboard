-- ============================================================
-- A4 — Auto-recensionsbegäran (review_request)
-- Skapar pending_approvals automatiskt 7 dagar efter project completion
-- och låter Hanna skicka SMS via 46elks efter manuell approval.
--
-- Kör manuellt i Supabase SQL Editor.
-- ============================================================

-- 1. business_config — Google Place ID för review-länk
-- =============================================================================

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS google_place_id TEXT;

COMMENT ON COLUMN business_config.google_place_id IS
  'Google Maps Place ID — används för att bygga review-länk i auto-recensionsbegäran. Format: börjar med ChIJ, hämtas via https://developers.google.com/maps/documentation/places/web-service/place-id';

-- 2. customer — när vi senast bad om recension
-- =============================================================================

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS review_request_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN customer.review_request_sent_at IS
  'Senaste tillfälle vi skickade automatisk recensionsbegäran. Används av /api/cron/review-requests för att inte spamma samma kund inom 180 dagar.';

CREATE INDEX IF NOT EXISTS idx_customer_review_request_sent_at
  ON customer(review_request_sent_at)
  WHERE review_request_sent_at IS NOT NULL;
