-- v125_backfill_project_status_completed.sql
--
-- Bakgrund: PUT /api/projects (app/api/projects/route.ts) satte ALDRIG
-- updates.status — bara sidofält (completed_at m.fl.) baserat på
-- body.status. En riktig stängning via dashboardens "Fler åtgärder" →
-- "Avslutat" körde hela kedjan (fyra-ögon, stage->ps-05,
-- autoInvoiceOnComplete, freezeProjectOutcome, skapaDebriefKort) men
-- project.status blev tyst kvar på sitt gamla värde. Upptäckt av Golden
-- Path-harnesset (Fas 2, Station 11) 2026-08-13, fixat i samma commit som
-- denna migration.
--
-- completed_at sätts BARA av en riktig stängning (blirKlart-grenen i
-- PUT /api/projects, eller mobilens complete-job-rutt som ALDRIG haft
-- denna bugg) — därför är "completed_at IS NOT NULL AND status <>
-- 'completed'" ett säkert, exakt facit för vilka projekt som verkligen
-- stängdes men aldrig fick sin statuskolumn skriven.
--
-- Blast radius vid källgranskning (2026-08-13): 3 projekt i produktion.

UPDATE project
SET status = 'completed'
WHERE completed_at IS NOT NULL
  AND status <> 'completed';
