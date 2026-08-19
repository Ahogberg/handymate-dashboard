-- ═══════════════════════════════════════════════════════════════════════════
-- Kontroll — OperatingExperiment-fångstskydd (2026-08-19)
-- REN LÄSFIL. Ingen migration, ingen skrivning. Kör manuellt i Supabase SQL
-- Editor för att verifiera att grunden de tre datafångst-fixarna vilar på
-- faktiskt är på plats i den här miljön, innan ni litar på dem.
--
-- Bakgrund: tre läckor täpptes samma dag (se commit-loggen):
--   1. lib/debrief/create-debrief-card.ts   — debrief-kortets expires_at
--      förlängt 7 dagar → 90 dagar (livstids-dedupe gör det permanent annars).
--   2. lib/efterkalkyl/reconcile-outcomes.ts — refryser nu även V2-rader med
--      labor_cost_configured=false när business_config.default_internal_
--      hourly_cost satts i efterhand (tidigare läkte de ALDRIG).
--   3. lib/projects/create-from-lead.ts + maybe-create-from-booking.ts —
--      sätter nu current_workflow_stage_id='ps-01' vid projektets födelse
--      (de två creation-vägar som saknade det helt).
--
-- Kör satserna i ordning. Varje block har en kommentar med FÖRVÄNTAT UTFALL.
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. v138 (Outcome Quality Gate) — kolumnerna finns på project_outcome ───
-- FÖRVÄNTAT: 4 rader (calculation_version, source_counts, completeness_flags,
-- learning_blockers). Saknas någon rad → v138 är inte körd i den här miljön,
-- och läcka 2-fixen (reconcile-outcomes.ts) har inget att arbeta mot.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'project_outcome'
  AND column_name IN ('calculation_version', 'source_counts', 'completeness_flags', 'learning_blockers')
ORDER BY column_name;

-- Samma kontroll för labor_cost_configured (v73, äldre men läcka 2 läser den
-- direkt) — FÖRVÄNTAT: 1 rad, data_type boolean, is_nullable = NO.
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'project_outcome'
  AND column_name = 'labor_cost_configured';


-- ── 2. v141 (Playbook Pattern Confirmation V1) — business_knowledge.job_type ─
-- FÖRVÄNTAT: 1 rad, text, nullable = YES. 0 rader → v141 inte körd ännu
-- (Playbook-linjen, tasks/todo.md 2026-08-16 natt — känt EJ körd sedan dess).
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'business_knowledge'
  AND column_name = 'job_type';


-- ── 3. v121 — project_lesson-tabellen finns ────────────────────────────────
-- FÖRVÄNTAT: 1 rad (to_regclass hittar tabellen). NULL → v121 inte körd, och
-- debrief-kortets hela syfte (skriva bekräftade lärdomar) är dött i denna
-- miljö oavsett expires_at-fixen.
SELECT to_regclass('public.project_lesson') AS project_lesson_finns;

-- Om tabellen finns: policy-kontroll (samma form som v121:s egen
-- verifieringssats). FÖRVÄNTAT: exakt project_lesson_service_role +
-- project_lesson_tenant_member.
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'project_lesson'
ORDER BY policyname;


-- ── 4. Läcka 2 — hur många rader läker vid nästa reconcile? ────────────────
-- Räknar V2-rader som ÄNNU har labor_cost_incomplete i learning_blockers.
-- Detta är alla kandidater för läcka 2-fixen ATT DE FAKTISKT LÄKER kräver
-- ÄVEN att respektive företags business_config.default_internal_hourly_cost
-- nu är satt (>0) — annars är blockeraren fortfarande sant (kostnaden är
-- fortfarande okänd, inget att räkna om till). Se fråga 4b för den
-- korsningen.
--
-- FÖRVÄNTAT: ett tal >= 0. Detta är "hur många rader SKULLE kunna läka",
-- inte "hur många läker automatiskt" — den senare kräver 4b.
SELECT count(*) AS v2_rader_med_labor_cost_incomplete
FROM project_outcome
WHERE calculation_version = 2
  AND 'labor_cost_incomplete' = ANY(learning_blockers);

-- 4b. Samma räkning, men bara företag som FAKTISKT har satt
-- default_internal_hourly_cost > 0 idag — dessa läker på RIKTIGT vid nästa
-- lat-triggade reconcile (lib/efterkalkyl/get-insight.ts eller admin-rutten
-- /api/admin/project-outcomes/reconcile). Övriga förblir blockerade tills
-- ägaren sätter timkostnaden i Inställningar → Interna kostnader.
--
-- FÖRVÄNTAT: <= talet från frågan ovan.
SELECT count(*) AS lakr_vid_nasta_reconcile
FROM project_outcome po
JOIN business_config bc ON bc.business_id = po.business_id
WHERE po.calculation_version = 2
  AND 'labor_cost_incomplete' = ANY(po.learning_blockers)
  AND COALESCE(bc.default_internal_hourly_cost, 0) > 0;


-- ── 5. Läcka 3 — hur många projekt saknar fortfarande startsteg? ──────────
-- Historiskt fynd (2026-08-13, Golden Path-harnesset): 29/33 projekt hade
-- current_workflow_stage_id = NULL. De fyra creation-vägarna som redan
-- initierar steget (create-from-quote.ts, project-ai-engine.ts, e2e-deal-
-- flow.ts, app/api/projects/route.ts) samt de två som fixades 2026-08-19
-- (create-from-lead.ts, maybe-create-from-booking.ts) påverkar bara NYA
-- projekt framåt — INGEN backfill av befintliga null-rader ingår i denna
-- ändring (medvetet, se rapporten).
--
-- FÖRVÄNTAT: samma ordning som tidigare (många null) tills en separat
-- backfill körs — det här kontrollerar bara att talet inte fortsätter växa
-- okontrollerat efter dagens fix (jämför om en vecka).
SELECT
  count(*) FILTER (WHERE current_workflow_stage_id IS NULL) AS utan_steg,
  count(*) FILTER (WHERE current_workflow_stage_id IS NOT NULL) AS med_steg,
  count(*) AS totalt
FROM project;
