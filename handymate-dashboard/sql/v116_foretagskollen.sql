-- v116_foretagskollen.sql (2026-08-11)
--
-- Företagskollen — lead magnet-funneln på handymate.se/foretagskollen
-- (landing-repot). Två saker:
--
-- 1. landing_leads får tre nya kolumner så funnelns rapport-endpoint kan
--    spara namn/telefon + hela assessment-payloaden (svar, deterministisk
--    scoring, utm/ref/entry-attribution). Additivt — inga befintliga
--    kolumner eller RLS/grants rörs. Inserts sker server-side via
--    service-nyckeln (api/foretagskollen-report.js), precis som
--    api/save-lead.js gör idag, så anon-grantsen från v115 ("INSERT-only,
--    ingen läsning") behöver inte ändras.
--
-- 2. Ny tabell landing_events för funnel-analytics (sajten har idag NOLL
--    mätning). Skrivs ENBART server-side via api/event.js med
--    service-nyckeln → service_role-only-policy, inga anon/authenticated-
--    grants alls. Samma mönster som v115:s admin_audit_log: tabell utan
--    tenant-koppling, endast systemåtkomst.
--
-- OBS (v115-lärdomen): policyn nedan har EXPLICIT "TO service_role" —
-- utan TO-klausul defaultar Postgres till PUBLIC och tabellen hade läckt
-- till anon-nyckeln. Det var exakt den buggklass v112–v115 städade.

-- ── 1. landing_leads: nya kolumner ──────────────────────────────────────

ALTER TABLE public.landing_leads
  ADD COLUMN IF NOT EXISTS name text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS payload jsonb;

COMMENT ON COLUMN public.landing_leads.payload IS
  'Företagskollen m.fl.: assessment-svar, deterministisk scoring, attribution (utm/ref/entry). Skrivs endast server-side.';

-- ── 2. landing_events: funnel-analytics ─────────────────────────────────

CREATE TABLE IF NOT EXISTS public.landing_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event text NOT NULL,
  session_id text,
  payload jsonb,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.landing_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS landing_events_service_role ON public.landing_events;
CREATE POLICY landing_events_service_role
  ON public.landing_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

REVOKE ALL ON TABLE public.landing_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.landing_events TO service_role;

-- Index för funnel-frågor ("hur många kom till steg X per dag").
CREATE INDEX IF NOT EXISTS landing_events_event_created_idx
  ON public.landing_events (event, created_at);
CREATE INDEX IF NOT EXISTS landing_events_session_idx
  ON public.landing_events (session_id);

-- ── Verifiering (körs efteråt, läsande) ─────────────────────────────────
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='landing_leads' ORDER BY ordinal_position;
--   → id, email, company_name, source, created_at, name, phone, payload
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name='landing_events' AND grantee IN ('anon','authenticated');
--   → noll rader
--
-- SELECT policyname, roles FROM pg_policies WHERE tablename='landing_events';
--   → landing_events_service_role, {service_role}
