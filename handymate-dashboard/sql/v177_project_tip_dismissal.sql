-- v177: "Lars tipsar" — avvisade/accepterade tips per projekt (2026-08-28)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Lars föreslår arbetsuppgifter ur projektets steg och data (lib/tasks/
-- lars-tips.ts) — deterministiskt, noll tokens, max två åt gången. Ett tips
-- blir en uppgift först när hantverkaren trycker. "Inte aktuellt" måste
-- kommas ihåg per projekt och tips — annars tjatar Lars om samma sak varje
-- gång sidan laddas. Accepterade tips loggas här också, så samma tips inte
-- föreslås igen när uppgiften är klar/borttagen.
--
-- Liten tabell, inte JSON på project: raden bär vem/när, och tip_key är
-- stabil (regelns id), inte texten.

BEGIN;

CREATE TABLE IF NOT EXISTS public.project_tip_dismissal (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  project_id TEXT NOT NULL
    REFERENCES public.project(project_id) ON DELETE CASCADE,
  tip_key TEXT NOT NULL,
  outcome TEXT NOT NULL DEFAULT 'dismissed'
    CHECK (outcome IN ('dismissed', 'accepted')),
  task_id TEXT,
  decided_by TEXT,
  decided_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT project_tip_dismissal_one_per_tip UNIQUE (project_id, tip_key)
);

CREATE INDEX IF NOT EXISTS idx_project_tip_dismissal_business_project
  ON public.project_tip_dismissal (business_id, project_id);

ALTER TABLE public.project_tip_dismissal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.project_tip_dismissal FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_tip_dismissal TO service_role;
CREATE POLICY project_tip_dismissal_service_role ON public.project_tip_dismissal
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name FROM information_schema.columns WHERE table_name='project_tip_dismissal' ORDER BY ordinal_position;
