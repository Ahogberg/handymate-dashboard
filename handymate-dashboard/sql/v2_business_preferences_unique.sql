-- v2_business_preferences_unique.sql  (OMSKRIVEN 2026-08-01 efter körfel)
--
-- Rotorsaken visade sig djupare än saknad constraint: prod-tabellen
-- business_preferences har FEL FORM. v5_learning_events.sql skapade en
-- en-rad-per-företag-profil (communication_tone m.m.); när
-- v2_business_preferences.sql senare kördes var dess CREATE TABLE IF NOT
-- EXISTS en tyst no-op. Nyckel/värde-tabellen som ALL aktiv kod använder
-- (setBusinessPreference, dag-7-flaggan, morgonbrief-cachen,
-- tool-routerns preferenser) har alltså aldrig existerat — varje anrop
-- har misslyckats tyst. Profilkolumnerna läses numera från
-- ai_learned_preferences (v63), så v5-tabellen är föräldralös.
--
-- Åtgärd: döp undan den döda tabellen (data bevaras för säkerhets skull)
-- och skapa den korrekta. Körs manuellt i Supabase SQL Editor.

-- 0) Säkerhetskoll: visa den befintliga tabellens kolumner INNAN bytet.
--    Förväntat: id, business_id, updated_at, communication_tone,
--    pricing_tendency, lead_response_style, preferred_sms_length,
--    custom_preferences (v5-formen). Ser du "key"/"value" här är tabellen
--    redan rätt — kör då INTE resten, säg till istället.
SELECT column_name FROM information_schema.columns
WHERE table_name = 'business_preferences' ORDER BY ordinal_position;

-- 1) Döp undan den föräldralösa v5-tabellen (droppas inte — ev. data kvar)
ALTER TABLE business_preferences RENAME TO business_preferences_legacy_v5;

-- 2) Skapa nyckel/värde-tabellen som koden förväntar sig (v2-specen)
CREATE TABLE business_preferences (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT DEFAULT 'agent',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, key)
);

CREATE INDEX IF NOT EXISTS idx_business_preferences_business
  ON business_preferences(business_id);

-- 3) Verifiering A: nya tabellens kolumner (ska innehålla key + value)
SELECT column_name FROM information_schema.columns
WHERE table_name = 'business_preferences' ORDER BY ordinal_position;

-- 4) Verifiering B: unik-constrainten som upsertens ON CONFLICT kräver
SELECT conname FROM pg_constraint
WHERE conrelid = 'business_preferences'::regclass AND contype = 'u';

-- 5) Nyfikenhetskoll: låg det någon data i den gamla tabellen?
SELECT count(*) AS legacy_rader FROM business_preferences_legacy_v5;
