-- ═══════════════════════════════════════════════════════════════════════════
-- v121 — project_lesson: bekräftade lärdomar från projektdebriefen
-- (2026-08-12, Project Debrief Capture)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- ═══ VARFÖR ═══
--
-- När ett projekt stängs har systemet redan efterkalkyl-deltat (timmar/
-- belopp/marginal vs offert — lib/efterkalkyl/freeze-outcome.ts). Den här
-- tabellen lagrar hantverkarens EGNA svar på ett par korta frivilliga
-- frågor som ställs vid stängningen (project_debrief-kortet,
-- lib/debrief/create-debrief-card.ts). Ägarens svar är sanningen — ingen
-- AI-inferens. Nästa offertgenerering av samma jobbtyp läser raderna
-- (lib/ai-quote-generator.ts) och tar höjd för dem.
--
-- RLS-mönstret är IDENTISKT med v101 (public.is_business_member,
-- två policyer, explicit TO-klausul, REVOKE/GRANT) — se den filen för
-- bakgrunden till varför alla nya tabeller härdas så här från start.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_lesson (
  id TEXT PRIMARY KEY DEFAULT ('lesson_' || replace(gen_random_uuid()::text, '-', '')),
  business_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  quote_id TEXT,
  job_type TEXT,
  lesson_text TEXT NOT NULL,
  impact_hint TEXT,
  source TEXT NOT NULL DEFAULT 'debrief',
  confirmed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.project_lesson IS
  'Bekräftade lärdomar från projektdebriefen — hantverkarens egna svar på debrief-kortet, ingen AI-inferens. impact_hint bär frågan svaret hörde till. Läses av lib/ai-quote-generator.ts vid nästa offert av samma jobbtyp.';

CREATE INDEX IF NOT EXISTS idx_project_lesson_business_job_type
  ON public.project_lesson (business_id, job_type);

ALTER TABLE public.project_lesson ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_lesson_tenant_member ON public.project_lesson;
CREATE POLICY project_lesson_tenant_member
  ON public.project_lesson
  FOR ALL
  TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));

DROP POLICY IF EXISTS project_lesson_service_role ON public.project_lesson;
CREATE POLICY project_lesson_service_role
  ON public.project_lesson
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.project_lesson FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.project_lesson TO authenticated;
GRANT ALL ON TABLE public.project_lesson TO service_role;

COMMIT;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- Policyerna: exakt project_lesson_tenant_member + project_lesson_service_role.
SELECT schemaname, tablename, policyname, roles, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'project_lesson'
ORDER BY policyname;
