-- ============================================================
-- v2 — business_knowledge.dedup_key för cross-run observation-dedup
--
-- Bakgrund: Karin/Daniel/Lars/Hanna kör söndag + onsdag i cron.
-- Med 90-180d data-fönster kan agenten generera "samma" observation
-- (BRF Lindgården stale, badrum över budget) flera körningar i rad.
-- Utan dedup → duplicater i business_knowledge + push-notis-spam.
--
-- Strategi v1: applikations-härledd dedup_key från
--   (agent_id, knowledge_type, normalized_title)
-- normalized_title = lowercase + strip siffror/datum.
--
-- v2: agenter kan sätta dedup_key själva via observation-output
-- (t.ex. "stale_quote:${quote_id}") för mer precis dedup. Stödjs
-- av kolumnen redan v1 — agenter prompt-instrueras senare.
--
-- Fönster (i lib/agents/shared/dedup.ts):
--   - anomaly: 48h (akuta värt påminna om snabbare)
--   - default: 168h (7 dagar)
-- Per-typ-tuning baserat på pilot-data → TD-46.
--
-- Kör manuellt i Supabase SQL Editor.
-- ============================================================

ALTER TABLE business_knowledge
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

COMMENT ON COLUMN business_knowledge.dedup_key IS
  'Frivillig nyckel för cross-run dedup. Härleds i applikationskod från (agent_id, knowledge_type, normalized_title) — eller sätts av agent själv (v2). Används av saveAndPush() innan INSERT för att skip:a duplicater inom DEDUP_WINDOWS_HOURS-fönstret per knowledge_type.';

CREATE INDEX IF NOT EXISTS idx_bk_dedup
  ON business_knowledge(business_id, agent_id, dedup_key)
  WHERE status = 'active' AND dedup_key IS NOT NULL;

-- Verifiering:
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'business_knowledge' AND column_name = 'dedup_key';
--   → returnerar 1 rad: dedup_key | text | YES
