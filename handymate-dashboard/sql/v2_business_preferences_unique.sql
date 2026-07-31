-- v2_business_preferences_unique.sql
-- Rotorsak till dag-7-mail-spammen (2026-07-31): setBusinessPreference gör
-- upsert med ON CONFLICT (business_id, key) — utan unik constraint failar
-- upserten tyst och dubblettskydds-flaggor "fastnar" aldrig, så cron-mail
-- går om varje dag. Idempotent: säker att köra även om constrainten finns.
--
-- Körs manuellt i Supabase SQL Editor.

-- 1) Städa ev. dubbletter som hunnit uppstå (behåll senast uppdaterade raden)
DELETE FROM business_preferences a
USING business_preferences b
WHERE a.business_id = b.business_id
  AND a.key = b.key
  AND a.ctid < b.ctid;

-- 2) Unik constraint som upsertens ON CONFLICT kräver
CREATE UNIQUE INDEX IF NOT EXISTS business_preferences_business_id_key_uniq
  ON business_preferences (business_id, key);

-- 3) Verifiering: ska returnera exakt en rad med indexnamnet
SELECT indexname FROM pg_indexes
WHERE tablename = 'business_preferences'
  AND indexname = 'business_preferences_business_id_key_uniq';

-- 4) Verifiering av dag-7-flaggan för demokontot (kan vara 0 rader — cron:en
--    exkluderar numera demokontot helt, så flaggan behövs inte där):
SELECT business_id, key, value, updated_at
FROM business_preferences
WHERE key = 'onboarding_day7_email';
