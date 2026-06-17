-- cleanup_slask_test_accounts.sql
--
-- Tar bort slask-/test-konton som skapats under onboarding-testning
-- (t.ex. test+matte...@byglo.se). Körs MANUELLT i Supabase SQL Editor.
--
-- ⚠️ VIKTIGT
--   • Matchar ENDAST test+%@byglo.se → rör ALDRIG andreas@byglo.se eller
--     riktiga pilotkunder. Justera mönstret nedan om du vill smalna av.
--   • Kör STEG 1 först och GRANSKA listan innan du kör DELETE-blocket.
--   • auth-användaren (Supabase Auth) tas INTE bort av SQL — radera den
--     separat i Supabase Dashboard → Authentication → Users (eller via
--     auth.admin.deleteUser). Detta städar bara app-datan i public-schemat.

-- ───────────────────────────────────────────────────────────────────────
-- STEG 1 — FÖRHANDSGRANSKA vilka konton som matchar (kör och läs först)
-- ───────────────────────────────────────────────────────────────────────
SELECT business_id, business_name, contact_email, onboarding_step,
       onboarding_completed_at, created_at
FROM business_config
WHERE contact_email LIKE 'test+%@byglo.se'
ORDER BY created_at;

-- ───────────────────────────────────────────────────────────────────────
-- STEG 2 — RADERA (kör först när STEG 1 visar rätt konton, inget mer)
--   Kör hela blocket som en transaktion. Ordningen respekterar att
--   business_config raderas SIST (child-rader pekar på business_id).
-- ───────────────────────────────────────────────────────────────────────
BEGIN;

-- Samla berörda business_id i en temporär tabell (mönstret på ETT ställe).
CREATE TEMP TABLE _slask ON COMMIT DROP AS
  SELECT business_id
  FROM business_config
  WHERE contact_email LIKE 'test+%@byglo.se';

-- Seedad standarddata (skapas av seedAllDefaults vid finish).
DELETE FROM automation_rule      WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM lead_scoring_rule    WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM pipeline_stage       WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM quote_standard_texts WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM checklist_template   WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM price_list           WHERE business_id IN (SELECT business_id FROM _slask);

-- Importerade testkunder (från fas D / kund-importen).
DELETE FROM customer             WHERE business_id IN (SELECT business_id FROM _slask);

-- Användarrelationer, sedan själva företaget.
DELETE FROM business_users       WHERE business_id IN (SELECT business_id FROM _slask);
DELETE FROM business_config      WHERE business_id IN (SELECT business_id FROM _slask);

-- Granska antalet rader ovan. Är allt rätt → COMMIT. Annars → ROLLBACK.
COMMIT;
-- ROLLBACK;

-- ───────────────────────────────────────────────────────────────────────
-- STEG 3 — radera auth-användarna i Supabase Dashboard → Authentication
--   (sök på "test+" och ta bort). SQL kan inte röra auth.users säkert.
-- ───────────────────────────────────────────────────────────────────────
