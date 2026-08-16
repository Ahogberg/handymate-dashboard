-- ═══════════════════════════════════════════════════════════════════════════
-- v141 — business_knowledge.job_type: Playbook Pattern Confirmation V1
-- (Debrief → Playbook, V2-lagret, tasks/todo.md 2026-08-16 natt)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- V1 (Project Debrief Capture, 2026-08-12/13) är redan skarp: en ägares
-- bekräftade svar vid projektstängning blir en rad i project_lesson, och
-- offertgenereringen (lib/ai-quote-generator.ts, fetchRecentLessons) läser
-- dem för just DET jobbet. V2 lägger till ett steg ovanpå: när flera
-- lärdomar upprepar samma tema för SAMMA jobbtyp, föreslås mönstret som en
-- bekräftbar, företagsomfattande regel — ett kort i pending_approvals
-- (approval_type='playbook_pattern_confirmation') som vid godkännande
-- skriver EN rad i business_knowledge. Den regeln ska sedan forma VARJE
-- framtida offert av den jobbtypen, inte bara den enskilda offert
-- lärdomen kom ifrån — därför behöver raden veta vilken jobbtyp den
-- gäller.
--
-- Ingen ny tabell: business_knowledge har redan knowledge_type 'pattern'
-- ("återkommande beteende") i sin CHECK-constraint sedan tabellens
-- ursprungliga skapelse (sql/v_agent_observations.sql, rad 23) — vidgad
-- sedan dess av v129 (business_rule) och v131 (priority_rule), men
-- 'pattern' fanns med redan från start. (lib/agents/daniel/
-- observation-prompt.ts producerar enstaka 'pattern'-rader via den
-- befintliga nattliga agent-observations-pipen (cron 5 6 * * 0,3), men
-- UTAN job_type — de raderna förblir job_type IS NULL efter denna
-- migration och kan därför aldrig matcha en jobbtyp-specifik fråga.
-- Ingen kollision med den nya, job_type-scopade användningen.)
--
-- ═══ ADDITIV OCH SÄKER ═══
--
-- job_type är NULLABLE — alla befintliga rader (business_rule/
-- priority_rule/insight/anomaly/recommendation/pattern) får NULL och
-- fortsätter fungera oförändrat. Verifierat (grep över lib/ + app/,
-- 2026-08-16): INGEN befintlig läsning av business_knowledge filtrerar på
-- job_type idag — fetchBusinessRules() (lib/ai-quote-generator.ts:261),
-- Next Best Action-motorn, priority-rules/business-rules-rutterna och
-- observations-rutterna läser alla utan job_type-villkor. Att lägga till
-- kolumnen kan alltså inte ändra beteendet hos någon befintlig query.
--
-- Funktionen är inert i prod tills denna fil körts manuellt — koden som
-- läser job_type (lib/ai-quote-generator.ts, fetchConfirmedPatterns) har
-- samma arSchemaSaknas-fail-safe som resten av filen och degraderar till
-- tom lista om kolumnen saknas.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE business_knowledge
  ADD COLUMN IF NOT EXISTS job_type TEXT;

CREATE INDEX IF NOT EXISTS idx_business_knowledge_business_type_jobtype
  ON business_knowledge (business_id, knowledge_type, job_type);

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
--   SELECT column_name, data_type, is_nullable FROM information_schema.columns
--   WHERE table_name = 'business_knowledge' AND column_name = 'job_type';
--   → text, YES (nullable)
--
--   SELECT indexname FROM pg_indexes WHERE tablename = 'business_knowledge';
--   → ska innehålla idx_business_knowledge_business_type_jobtype
