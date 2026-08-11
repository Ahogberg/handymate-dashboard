-- v117_partner_commission_v2.sql (2026-08-11)
--
-- Partnerprogram v2: provisionstrappa per partner, provisionsliggare,
-- utbetalningsbatchar (självfaktureringsunderlag) och uppföljningar.
--
-- Bakgrund: dagens provisionssystem har ALDRIG fungerat (0 partner-referrals,
-- 0 partner_events i prod 2026-08-11) — kedjan var trasig i fyra led, se
-- commit-historiken för lib/partners/* och lib/referral/discounts.ts.
-- Rent bord: ingen datamigrering behövs.
--
-- Affärsmodellen (Andreas beslut 2026-08-11):
--  - Trappa per partner (t.ex. 20/25/30 %) baserad på AKTIVA BETALANDE
--    kunder den månaden. Uppnådd sats gäller hela kundstocken (tier_mode
--    'book'), växlingsbar till marginalmodell per partner ('marginal').
--  - Månad 1-12 per kund på trappsatsen, därefter EVIG basnivå (10 %
--    default) så länge kunden betalar.
--  - Basen är FAKTISKT betalt via Stripe — ingen provision på obetalda
--    månader. Varje provisionsbelopp blir en granskningsbar rad.
--
-- OBS (v115-lärdomen): alla policys nedan har EXPLICIT TO-klausul — utan
-- den defaultar Postgres till PUBLIC och tabellen läcker till anon-nyckeln.

-- ── 1. Trappkonfiguration per partner ───────────────────────────────────

ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS commission_tiers JSONB
    DEFAULT '[{"min":0,"rate":0.20},{"min":6,"rate":0.25},{"min":16,"rate":0.30}]'::jsonb,
  ADD COLUMN IF NOT EXISTS base_rate_after NUMERIC DEFAULT 0.10,
  ADD COLUMN IF NOT EXISTS tier_mode TEXT DEFAULT 'book'
    CHECK (tier_mode IN ('book','marginal')),
  ADD COLUMN IF NOT EXISTS ladder_months INTEGER DEFAULT 12;

COMMENT ON COLUMN public.partners.commission_tiers IS
  'Trappa: [{"min":antal aktiva kunder,"rate":sats}] sorterad stigande, första min=0. NULL/tom → legacy commission_rate.';
COMMENT ON COLUMN public.partners.base_rate_after IS
  'Evig basnivå efter ladder_months betalda månader per kund (default 10 %).';
COMMENT ON COLUMN public.partners.tier_mode IS
  'book = uppnådd sats gäller hela kundstocken; marginal = bara kunder över tröskeln (band efter converted_at stigande).';

-- ── 2. Typfix: partner_events.business_id UUID → TEXT ───────────────────
-- Tabellen har 0 rader (alla inserts har tyst misslyckats sedan start —
-- business_id-värdena är text 'biz_…'). Säkert att byta typ.
--
-- ORDNING SPELAR ROLL (lärdom från första körförsöket 2026-08-11):
-- Postgres vägrar ALTER COLUMN TYPE på en kolumn som en policy refererar
-- ("0A000: cannot alter type of a column used in a policy definition").
-- v112-policyn partner_events_tenant_member använder business_id::text i
-- sin USING-sats — den MÅSTE droppas FÖRE typbytet och återskapas efter.

DROP POLICY IF EXISTS partner_events_tenant_member ON public.partner_events;

ALTER TABLE public.partner_events
  ALTER COLUMN business_id TYPE TEXT USING business_id::text;

-- Återskapa utan ::text-casten (kolumnen är nu TEXT).
CREATE POLICY partner_events_tenant_member
  ON public.partner_events
  FOR ALL
  TO authenticated
  USING (public.is_business_member(business_id))
  WITH CHECK (public.is_business_member(business_id));
-- partner_events_service_role från v112 refererar inte kolumnen och behålls.

-- ── 3. Utbetalningsbatchar (före liggaren så FK:n löser) ────────────────

CREATE TABLE IF NOT EXISTS public.partner_payout_batch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  period TEXT NOT NULL,                        -- 'YYYY-MM' underlagsperiod
  total_sek NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','paid')),
  statement JSONB,                             -- fryst underlag vid skapandet (självfakturering)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  paid_by TEXT,
  UNIQUE (partner_id, period)
);

-- ── 4. Provisionsliggaren — en rad per partner × kund × månad ───────────

CREATE TABLE IF NOT EXISTS public.partner_commission_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id),
  business_id TEXT NOT NULL,
  referral_id TEXT REFERENCES public.referrals(id),
  period TEXT NOT NULL,                        -- 'YYYY-MM' = betalningsmånaden
  customer_month INTEGER NOT NULL,             -- 1..N, räknare av BETALDA månader (obetald månad avancerar inte)
  base_amount_sek NUMERIC NOT NULL,            -- faktiskt betalt, ex moms
  rate NUMERIC NOT NULL,
  amount_sek NUMERIC NOT NULL,                 -- round(base * rate); NUMERIC utan positivitetskrav (manuella justeringsrader vid ev. återbetalning)
  rate_source TEXT NOT NULL CHECK (rate_source IN ('tier','base_rate','legacy_rate','adjustment')),
  tier_snapshot JSONB,                         -- {active_count, tiers, tier_mode, band} vid ackrual — satsen utvärderas vid FÖRSTA ackrual, sena betalningar ändrar inte skrivna rader
  source_billing_event_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'accrued' CHECK (status IN ('accrued','paid')),
  payout_batch_id UUID REFERENCES public.partner_payout_batch(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  paid_at TIMESTAMPTZ,
  UNIQUE (partner_id, business_id, period)     -- idempotensankare för motorn
);

CREATE INDEX IF NOT EXISTS idx_pcl_partner_period
  ON public.partner_commission_ledger (partner_id, period);
CREATE INDEX IF NOT EXISTS idx_pcl_partner_status
  ON public.partner_commission_ledger (partner_id, status);

-- ── 5. Partneruppföljningar (Uppföljning 1/2/3 per kund) ────────────────

CREATE TABLE IF NOT EXISTS public.partner_followups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id UUID NOT NULL REFERENCES public.partners(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  followup_nr SMALLINT NOT NULL CHECK (followup_nr IN (1,2,3)),
  done_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (partner_id, business_id, followup_nr)
);

CREATE INDEX IF NOT EXISTS idx_partner_followups_partner
  ON public.partner_followups (partner_id);

-- ── 6. RLS: service_role-only på alla tre nya tabellerna ────────────────
-- Partnerportalen och admin går ALLTID via service-role-API-routes
-- (partner_token-cookien resp. isAdmin) — inga authenticated-policys behövs.

ALTER TABLE public.partner_payout_batch ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_payout_batch_service_role ON public.partner_payout_batch;
CREATE POLICY partner_payout_batch_service_role
  ON public.partner_payout_batch FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.partner_payout_batch FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_payout_batch TO service_role;

ALTER TABLE public.partner_commission_ledger ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_commission_ledger_service_role ON public.partner_commission_ledger;
CREATE POLICY partner_commission_ledger_service_role
  ON public.partner_commission_ledger FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.partner_commission_ledger FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_commission_ledger TO service_role;

ALTER TABLE public.partner_followups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS partner_followups_service_role ON public.partner_followups;
CREATE POLICY partner_followups_service_role
  ON public.partner_followups FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.partner_followups FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.partner_followups TO service_role;

-- ── 7. Motorns frågeväg ─────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_billing_event_type_created
  ON public.billing_event (event_type, created_at);

-- ── Verifiering (körs efteråt, läsande) ─────────────────────────────────
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name='partner_events' AND column_name='business_id';
--   → text
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='partners' AND column_name IN
--   ('commission_tiers','base_rate_after','tier_mode','ladder_months');
--   → 4 rader
--
-- SELECT grantee, privilege_type FROM information_schema.role_table_grants
--   WHERE table_name IN ('partner_commission_ledger','partner_payout_batch','partner_followups')
--   AND grantee IN ('anon','authenticated');
--   → noll rader
--
-- SELECT tablename, policyname, roles FROM pg_policies
--   WHERE tablename LIKE 'partner%' ORDER BY tablename;
--   → alla nya med {service_role}, partner_events med tenant+service_role
