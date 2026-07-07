-- v64_billing_event_idempotency.sql
-- Race-skydd för Stripe-webhookens idempotens. Koden kollar redan
-- billing_event.stripe_event_id före dispatch (sekventiella retries), men två
-- SAMTIDIGA leveranser av samma event kan båda passera checken innan någon
-- hunnit skriva raden. Ett partiellt unikt index gör den andra insert:en till
-- ett fel istället för en dubblett (dubbla referral-belöningar/partner-notiser).
--
-- Körs manuellt i Supabase SQL Editor.
--
-- UPPTÄCKT 2026-07-07: billing_event fanns ALDRIG i prod-databasen —
-- sql/billing.sql kördes aldrig (all billing-loggning har tyst misslyckats).
-- Kör därför HELA sql/billing.sql först (idempotent: skapar även billing_plan
-- som Stripe-checkouten kräver + usage_record + business_config-kolumner).
-- Blocket nedan gör ändå v64 självförsörjande om billing.sql hoppas över.

-- 0. Säkerställ att tabellen finns (speglar sql/billing.sql:41-50)
CREATE TABLE IF NOT EXISTS billing_event (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  stripe_event_id TEXT,
  data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billing_event_business ON billing_event(business_id);

-- 1. Rensa ev. befintliga dubbletter (behåll äldsta raden per event_id).
--    (I praktiken troligen 0 rader — inga skarpa betalningar har körts än.)
DELETE FROM billing_event a
USING billing_event b
WHERE a.stripe_event_id IS NOT NULL
  AND a.stripe_event_id = b.stripe_event_id
  AND a.ctid > b.ctid;

-- 2. Partiellt unikt index (NULL stripe_event_id tillåts fortfarande flera ggr).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_event_stripe_event_id
  ON billing_event (stripe_event_id)
  WHERE stripe_event_id IS NOT NULL;
