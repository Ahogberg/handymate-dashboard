-- ═══════════════════════════════════════════════════════════════════════════
-- v124 — project_lesson: index på (business_id, created_at)
-- (2026-08-13, Måndagskortet V1 — lib/jarvis/monday-brief.ts)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- v121 (project_lesson) skapade bara ett index på (business_id, job_type) —
-- rätt för offertgenereringens uppslag (lib/ai-quote-generator.ts), men
-- Måndagskortet frågar varje vecka, för VARJE aktivt företag:
--
--   .eq('business_id', businessId).gte('created_at', mondayStartIso)
--
-- Utan ett index på (business_id, created_at) blir det en sekventiell
-- scan per företag. Tabellen är liten idag, men frågan körs på en cron över
-- alla aktiva företag varje måndag — additiv, riskfri (CREATE INDEX IF NOT
-- EXISTS), ingen datamigrering.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE INDEX IF NOT EXISTS idx_project_lesson_business_created
  ON public.project_lesson (business_id, created_at DESC);

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public' AND tablename = 'project_lesson'
ORDER BY indexname;
