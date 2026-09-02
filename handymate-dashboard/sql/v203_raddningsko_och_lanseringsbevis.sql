-- OBS: kördes i Supabase under namnet v203_raddningsko_och_lanseringsbevis (2026-09-02) — filen omdöpt till v203 eftersom v202 togs av attribution_link_enabled på main samma dag. Innehållet oförändrat.
-- v202: Räddningskön + lanseringsbevis (docs/launch/FORSTA_10_KUNDER_BEVIS_OCH_RADDNING.md, 2026-09-02).
--
-- raddningsarende — en rad per (företag, signal) som är öppen; den dagliga
-- körningen /api/cron/raddningsko uppdaterar last_seen_at och stänger
-- automatiskt när signalen försvunnit. support_ticket duger inte: dess
-- thread_id är NOT NULL (bara agentskapade ärenden) och kategorierna är
-- kundavsikt, inte risk.
--
-- lanseringsbevis — de manuella stationerna i Grind B (lib/launch/
-- readiness.ts MANUAL_LAUNCH_PROOFS) får en riktig rad i stället för en
-- konstant med status 'manual'.
--
-- Båda service_role-only (RLS på, inga policyer, revoke), som v165/v191.

CREATE TABLE IF NOT EXISTS public.raddningsarende (
  id text PRIMARY KEY DEFAULT ('rsk_' || replace(gen_random_uuid()::text, '-', '')),
  business_id text NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  signal text NOT NULL CHECK (signal IN (
    'onboarding_stannat', 'ingen_verifierad_kanal', 'ingen_aktivering',
    'ingen_offert', 'inget_uppdrag', 'integration_bruten',
    'misslyckad_handling', 'fastnat_kort', 'falsk_framgang', 'manuell_fix_kravdes')),
  severity text NOT NULL DEFAULT 'medel' CHECK (severity IN ('hog', 'medel', 'lag')),
  status text NOT NULL DEFAULT 'oppet' CHECK (status IN ('oppet', 'pagaende', 'last', 'avfardat')),
  summary text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  owner text,
  atgard text,
  resolved_at timestamptz,
  resolved_by text
);

CREATE UNIQUE INDEX IF NOT EXISTS raddningsarende_oppet_idx
  ON public.raddningsarende (business_id, signal)
  WHERE status IN ('oppet', 'pagaende');

CREATE INDEX IF NOT EXISTS raddningsarende_status_idx
  ON public.raddningsarende (status, last_seen_at DESC);

ALTER TABLE public.raddningsarende ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.raddningsarende FROM anon, authenticated, PUBLIC;

CREATE TABLE IF NOT EXISTS public.lanseringsbevis (
  id text PRIMARY KEY DEFAULT ('lbv_' || replace(gen_random_uuid()::text, '-', '')),
  station text NOT NULL CHECK (station IN (
    'proof_stripe', 'proof_lisa', 'proof_email', 'proof_google', 'proof_ios', 'proof_fortnox')),
  business_id text REFERENCES public.business_config(business_id) ON DELETE SET NULL,
  evidence text NOT NULL,
  evidence_url text,
  proven_by text NOT NULL,
  proven_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  revoke_reason text
);

CREATE INDEX IF NOT EXISTS lanseringsbevis_station_idx
  ON public.lanseringsbevis (station, proven_at DESC);

ALTER TABLE public.lanseringsbevis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.lanseringsbevis FROM anon, authenticated, PUBLIC;

-- Facit efter körning:
--   SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('raddningsarende','lanseringsbevis');
--   → båda true
--   SELECT indexname FROM pg_indexes WHERE tablename = 'raddningsarende';
--   → raddningsarende_pkey, raddningsarende_oppet_idx, raddningsarende_status_idx
