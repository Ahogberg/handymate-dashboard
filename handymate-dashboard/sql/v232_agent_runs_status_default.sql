-- v232 (2026-09-12): agent_runs.status tappar sin DEFAULT.
--
-- Kolumnen bar DEFAULT 'running' sedan den forsta agent-migrationen.
-- Raden skrivs dock alltid EFTER att korningen avslutats, och samtliga
-- fem insert-stallen i koden satter status uttryckligen till 'completed'
-- (lib/agents/shared/cost-guard.ts, lib/agent/orchestrator.ts,
-- lib/egenkontroll/analyze-and-queue.ts, app/api/agent/trigger/route.ts,
-- lib/demo/seed-demo-account.ts). Ingen lasare filtrerar pa status och
-- ingen kod UPDATE:ar den.
--
-- Matt i produktion 2026-09-12: 1362 rader, alla 'completed'. Defaulten
-- har alltsa aldrig anvants. Kvar var bara risken: en framtida insert som
-- glommer faltet hade fatt raden att pasta att korningen PAGAR, for
-- alltid. Utan default blir samma rad NULL — okant, vilket det ar.
--
-- Ingen radata andras: DROP DEFAULT ror inga befintliga rader.

ALTER TABLE agent_runs ALTER COLUMN status DROP DEFAULT;
