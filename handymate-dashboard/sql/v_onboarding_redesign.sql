-- ─────────────────────────────────────────────────────────────────
-- v_onboarding_redesign.sql
-- Adderar fält som behövs för nya onboarding-flödet (Claude Design):
--   • specialties: multi-select från Step3 (vad användaren faktiskt gör)
--   • hourly_rate_min/max: timpris-range från Step3
--   • welcome_tour_seen: tracking för att inte visa dashboard-touren igen
-- Idempotent — kan köras flera gånger.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS specialties JSONB DEFAULT '[]'::jsonb;

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS hourly_rate_min NUMERIC;

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS hourly_rate_max NUMERIC;

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS welcome_tour_seen TIMESTAMPTZ;

-- Befintliga aktiva kunder ska inte få welcome-touren
-- (de har redan sin dashboard etablerad)
UPDATE business_config
SET welcome_tour_seen = NOW()
WHERE welcome_tour_seen IS NULL
  AND onboarding_step >= 5;
