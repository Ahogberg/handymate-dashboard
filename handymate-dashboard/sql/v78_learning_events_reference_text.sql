-- ============================================================
-- V78: learning_events.reference_id UUID → TEXT
-- Run in Supabase SQL Editor
--
-- Bugg (value-chain-plan.md VÅG 1a): lib/agent/learning-engine.ts
-- skriver reference_id: params.id från app/api/approvals/[id]/route.ts,
-- där pending_approvals-id:n är TEXT på formen `appr_<timestamp>_<slump>`
-- (se t.ex. app/api/approvals/route.ts:98, lib/automation-engine.ts:433,
-- lib/autonomy/earned-autonomy.ts:225 m.fl. — samtliga skapar samma
-- TEXT-format). sql/v5_learning_events.sql:19 deklarerade kolumnen som
-- UUID, vilket Postgres avvisar för "appr_..."-strängar. Inserten i
-- recordLearningEvent() (lib/agent/learning-engine.ts) fångas i ett
-- try/catch som bara loggar — och anroparen i approvals/[id]/route.ts
-- svälger felet helt tyst (kommentar: "Non-blocking — learning event
-- failure should not break approval flow") — så nästan inga
-- learning_events har landat i prod.
--
-- Verifierat innan denna migration skrevs:
--   - grep på recordLearningEvent(...) i hela repot: enda anroparen är
--     app/api/approvals/[id]/route.ts, och den skickar alltid params.id
--     (pending_approvals.id, TEXT/appr_-format) som referenceId. Ingen
--     kod skriver UUID-värden till reference_id — säkert att bredda
--     kolumnen till TEXT utan att bryta någon skrivare.
--   - grep på "reference_id" i hela repot: enda läsarna/skrivarna är
--     sql/v5_learning_events.sql (schema-deklarationen) och
--     lib/agent/learning-engine.ts (skrivningen). Ingen kod läser
--     reference_id och antar UUID-format (ingen ::uuid-cast, ingen FK-join
--     mot en UUID-kolumn). lib/agent/context-engine.ts och
--     lib/auto-approve-learning.ts läser learning_events men rör aldrig
--     reference_id förutom via select('*') / select('reference_id').
--   - Inga constraints/index på reference_id specifikt i v5-migrationen
--     (bara index på business_id och (business_id, preference_category)),
--     så ALTER COLUMN ... TYPE TEXT kräver ingen index-ombyggnad.
-- ============================================================

ALTER TABLE learning_events
  ALTER COLUMN reference_id TYPE TEXT USING reference_id::text;

-- ── Verifiering (kör efter ALTER) ──────────────────────────────

-- 1. Kolumntypen ska nu vara text
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'learning_events' AND column_name = 'reference_id';

-- 2. Räkna befintliga rader (för att se hur mycket som redan landat
--    trots buggen — sannolikt ett lågt antal från tiden innan denna fix)
SELECT event_type, COUNT(*) AS antal
FROM learning_events
GROUP BY event_type
ORDER BY antal DESC;

SELECT COUNT(*) AS totalt_antal_learning_events FROM learning_events;

-- 3. Stickprov: senaste 20 events, för att se att reference_id nu ser ut
--    som appr_... (efter att appen börjat skriva events post-deploy)
SELECT id, business_id, event_type, reference_id, reference_type, created_at
FROM learning_events
ORDER BY created_at DESC
LIMIT 20;
