-- v142: project_checklist-driften — project_id och notes saknas i livetabellen
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- UPPTÄCKT AV FLYWHEEL-BEVISET 2026-08-17 (tests/e2e-golden-path/
-- flywheel.spec.ts, första skarpa körningen): livetabellen project_checklist
-- SAKNAR kolumnerna project_id och notes, trots att den avsedda formen
-- (sql/rot_rut_documents.sql rad 100-114) har båda. Tabellen skapades
-- uppenbarligen tidigare i en annan form, och rot_rut_documents.sql:s
-- CREATE TABLE IF NOT EXISTS hoppade då tyst över den — klassisk
-- migrationsdrift som IF NOT EXISTS maskerar.
--
-- KONSEKVENS I PROD: varje skrivning mot tabellen inkluderar project_id —
-- POST /api/projects/[id]/checklists, approvals-fallen 'checklist_forslag'
-- och 'playbook_kickoff_suggestion' — så SAMTLIGA checklist-skapanden har
-- failat (42703) sedan tabellen skapades. Tabellen har noll rader.
-- Egenkontroll-agentens checklistförslag har alltså aldrig kunnat landa.
--
-- Tabellen är TOM ⇒ additiva kolumner är riskfria; NOT NULL går inte att
-- addera utan default på befintliga rader men här finns inga rader — vi
-- följer ändå husets mjuka-referens-konvention (som project_lesson.project_id,
-- sql/v121) och lämnar kolumnen nullable: varje verklig skrivväg sätter den
-- alltid, och en FK/NOT NULL-åtstramning kan göras senare som eget beslut.

ALTER TABLE project_checklist
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

CREATE INDEX IF NOT EXISTS idx_project_checklist_project
  ON project_checklist(project_id);

COMMENT ON COLUMN project_checklist.project_id IS
  'Projektet checklistan tillhör. Saknades i livetabellen t.o.m. 2026-08-17 (migrationsdrift, se v142) — alla skrivningar failade tyst tills dess.';

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
--   SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'project_checklist' ORDER BY ordinal_position;
--   → ska innehålla project_id och notes
--
-- Skarpt bevis direkt efteråt: kör flywheel-beviset
--   npx playwright test --project=flywheel
-- Station 8 skriver en riktig kontrollpunkt via godkännande-API:t.
