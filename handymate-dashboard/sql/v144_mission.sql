-- v144: Mission — pengamål med deadline (Goal-to-Plan V1)
--
-- KÖRS MANUELLT i Supabase SQL Editor innan chattverktyget confirm_mission
-- aktiveras (koden fail-softar tills dess: GET /api/mission/active svarar
-- { mission: null } om tabellen saknas).
--
-- Ett uppdrag är en ANVÄNDARSKAPAD entitet (som en offert): hantverkarens
-- pengamål + deadline + planen som Matte föreslog och ägaren bekräftade,
-- fryst som snapshot. Tabellen lagrar ALDRIG progress — "verifierat betalt"
-- härleds vid varje läsning ur invoice/pending_approvals (Value Ledger-
-- mönstret, lib/mission/mission-progress.ts). Det som inte lagras kan inte
-- driva isär från verkligheten.
--
-- V1 är MEDVETET bara pengamål (goal_kr + deadline). Kapacitetsmål ("fyll
-- veckan") är beslutat till V2 — därav inget goal_type-fält än: när V2
-- kommer läggs det till med DEFAULT 'money' så befintliga rader är korrekta.
--
-- Approval-länkning sker via payload->>'mission_id' i pending_approvals
-- (samma konvention som pattern_id/dedupe_key) — ingen join-tabell.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL
     OR to_regclass('public.business_users') IS NULL THEN
    RAISE EXCEPTION 'v144 kräver business_config och business_users';
  END IF;
END $$;

CREATE TABLE public.mission (
  -- 'mis_' + 12 tecken, genereras av confirm_mission-verktyget
  -- (samma id-konvention som övriga TEXT-id i kodbasen).
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL
    REFERENCES public.business_config(business_id) ON DELETE CASCADE,

  goal_kr NUMERIC NOT NULL CHECK (goal_kr > 0),
  deadline DATE NOT NULL,

  -- Inget 'draft'-läge: ett uppdrag existerar först när ägaren bekräftat i
  -- chatten. Utkastet lever i thread_message.metadata tills dess.
  -- 'expired' sätts lättjefullt vid läsning när deadline passerats
  -- (ingen cron — Hobby-planens crongräns, och läsningen är sanningen).
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'completed', 'cancelled', 'expired')),

  -- Planen som bekräftades: { steps: [{ item_id, truth_class, measure,
  -- evidence, approval_type, motivation }] } — belopp KOPIERADE från
  -- portföljen vid bekräftelsen (aldrig LLM-levererade), se
  -- lib/mission/plan-validation.ts. Högst 5 steg, minst 1.
  plan_snapshot JSONB NOT NULL,
  -- När portföljen som planen byggdes ur räknades — gör inaktualitet
  -- synlig i efterhand.
  portfolio_generated_at TIMESTAMPTZ NOT NULL,

  created_by TEXT
    REFERENCES public.business_users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  CONSTRAINT mission_state_check CHECK (
    (status = 'active' AND resolved_at IS NULL)
    OR (status IN ('completed', 'cancelled', 'expired') AND resolved_at IS NOT NULL)
  ),
  CONSTRAINT mission_plan_steps_1_till_5 CHECK (
    jsonb_typeof(plan_snapshot->'steps') = 'array'
    AND jsonb_array_length(plan_snapshot->'steps') BETWEEN 1 AND 5
  )
);

-- Max ETT aktivt uppdrag per företag — fokus är hela produktpoängen.
-- En andra INSERT med status='active' felar högt; confirm_mission fångar
-- felet och svarar "avsluta nuvarande uppdrag först".
CREATE UNIQUE INDEX idx_mission_one_active
  ON public.mission (business_id) WHERE status = 'active';

CREATE INDEX idx_mission_business_status
  ON public.mission (business_id, status);

-- RLS-lärdomen från v112–v115: allt via service_role, inget till anon.
ALTER TABLE public.mission ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.mission FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.mission TO service_role;
CREATE POLICY mission_service_role ON public.mission
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='mission' ORDER BY ordinal_position;
-- SELECT indexname FROM pg_indexes WHERE tablename='mission';
