-- v132_next_best_action.sql (2026-08-13)
--
-- Next Best Action Engine — en rangordnad daglig rekommendation över de
-- konkurrerande besluten i pending_approvals (curated subset, se
-- NEXT_BEST_ACTION_APPROVAL_TYPES i lib/jarvis/next-best-action-normalize.ts).
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor (eller via MCP efter "kör").
--
-- ═══ VARFÖR EGEN TABELL, INTE EN pending_approvals-RAD ═══
--
-- Måndagskortet (lib/jarvis/monday-brief.ts) är självständig information —
-- inget att peka tillbaka på. Next Best Action pekar tvärtom på en REDAN
-- EXISTERANDE pending_approvals-rad, och godkänn/avvisa måste gå via SAMMA
-- /api/approvals/[id]-exekvering som alltid gäller för den raden. Att göra
-- NBA till en egen approval_type hade krävt undantag i varenda typ-
-- uppräknande modul (lib/jarvis/approval-view.ts, lib/value/ledger.ts,
-- lib/value/recovered-revenue.ts, lib/moments/derive.ts,
-- lib/action-contract.ts) för en rad som aldrig själv godkänns. En egen,
-- liten tabell är en mindre, mer isolerad diff.
--
-- Deterministiskt id (nba_{business_id}_{ÅÅÅÅ-MM-DD}, svensk lokal dag)
-- gör en andra körning samma dag ofarlig — samma dedupe-mönster som
-- Måndagskortets mandagskortId (unik-constraint-krock = 23505, fångas i
-- lib/jarvis/next-best-action.ts, rapporteras som 'duplicate' inte fel).
--
-- RLS-mönstret är v101/v122:s tenant-medlem + service_role — se
-- sql/v122_customer_fact.sql för bakgrunden (RLS-saneringen 2026-08-11).

CREATE TABLE IF NOT EXISTS public.next_best_action (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  computed_date DATE NOT NULL,

  -- Vinnande kandidatens pending_approvals.id vid beräkningstillfället.
  -- Ingen ON DELETE-klausul: pending_approvals-rader hård-raderas aldrig
  -- i kodbasen (bara statusändring).
  top_approval_id TEXT NOT NULL REFERENCES public.pending_approvals(id),

  -- Mattes egna ord — samma beräkning som valde top_approval_id, aldrig
  -- omskriven i efterhand (Kvittoprincipen: "inget efterhandsresonemang").
  reasoning TEXT NOT NULL,

  -- Exakta business_knowledge.observation-strängar (knowledge_type=
  -- 'priority_rule') modellen citerade som utslagsgivande. Tom array om
  -- ingen enskild regel avgjorde den dagen — aldrig en gissad regelrad.
  principles_applied JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- ALLA vägda kandidater, rangordnade, top_approval_id först. Varje post
  -- bär SIN EGEN korta rationale — inte bara topplatsen — så en fallback
  -- till kandidat #2 (om #1 redan hanterats innan sidan laddas, se
  -- app/api/next-best-action/route.ts) återanvänder ett redan skrivet
  -- kvitto i stället för att hitta på ett nytt.
  -- Form: [{ approval_id, approval_type, financial_impact_kr,
  --           financial_impact_kind, urgency_note, rationale }, …]
  ranked_candidates JSONB NOT NULL,

  candidate_count INT NOT NULL,
  model TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE public.next_best_action IS
  'Next Best Action Engine: daglig, cron-beräknad rangordning av konkurrerande pending_approvals-kandidater. Pekar på en redan existerande approval — godkänn/avvisa går alltid via /api/approvals/[id], aldrig via denna tabell.';
COMMENT ON COLUMN public.next_best_action.reasoning IS
  'Skriven av samma beräkning som valde top_approval_id. Aldrig omskriven i efterhand.';
COMMENT ON COLUMN public.next_best_action.principles_applied IS
  'Exakta citat ur business_knowledge (knowledge_type=priority_rule) som avgjorde rankningen. Tom array är ett giltigt, ärligt svar.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_nba_business_date
  ON public.next_best_action (business_id, computed_date);

CREATE INDEX IF NOT EXISTS idx_nba_top_approval
  ON public.next_best_action (top_approval_id);

-- ── RLS: exakt v101/v122-mönstret ─────────────────────────────────────────

ALTER TABLE public.next_best_action ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS next_best_action_tenant_member ON public.next_best_action;
CREATE POLICY next_best_action_tenant_member
  ON public.next_best_action
  FOR SELECT
  TO authenticated
  USING (public.is_business_member(business_id));

DROP POLICY IF EXISTS next_best_action_service_role ON public.next_best_action;
CREATE POLICY next_best_action_service_role
  ON public.next_best_action
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON TABLE public.next_best_action FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.next_best_action TO authenticated;
GRANT ALL ON TABLE public.next_best_action TO service_role;

-- ═══ MANUELL VERIFIERING EFTER KÖRNING ═══
--
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'next_best_action' ORDER BY ordinal_position;
--
-- SELECT policyname, roles, cmd FROM pg_policies
--   WHERE schemaname = 'public' AND tablename = 'next_best_action';
--   → next_best_action_tenant_member (authenticated, SELECT) +
--     next_best_action_service_role (service_role, ALL)
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name = 'next_best_action' AND grantee = 'anon';
--   → noll rader
