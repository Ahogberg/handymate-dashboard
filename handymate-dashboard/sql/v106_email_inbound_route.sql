-- ============================================================================
-- v106 — email_inbound_route: multi-tenant-routning för företagsmail → lead
-- ============================================================================
-- Epic B i lead-intake-sprinten (tasks/lead-intake-granskning-2026-08-10.md).
--
-- BAKGRUND: Postmark-webhooken (app/api/email/inbound) är env-låst till EN
-- tenant via POSTMARK_INBOUND_DEFAULT_BUSINESS_ID — dokumenterad MVP-
-- begränsning. Den här tabellen ger varje företag en egen inkommande adress
-- (t.ex. bee@leads.handymate.se) som kunden vidarebefordrar sin info@ till.
--
-- FAIL-CLOSED ÄR HELA POÄNGEN: routningen adress→business slås upp här och
-- BARA här. Okänd adress ⇒ mailet avvisas (loggat). Tenant-valet får ALDRIG
-- styras av payload-data (samma princip som SMS-fallbackens "avstå hellre
-- än gissa tenant"). Koden är oberoende av att migrationen körts: saknas
-- tabellen faller webhooken tillbaka på env-varens entenant-beteende.
--
-- DNS-FÖRUTSÄTTNING (Andreas, engångs): MX-post för leads.handymate.se →
-- Postmarks inbound-server (inbound.postmarkapp.com) + inbound-domänen
-- registrerad i Postmark-kontot. Utan den når inga mail webhooken alls.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

CREATE TABLE IF NOT EXISTS email_inbound_route (
  -- Hela adressen, alltid lowercase ('bee@leads.handymate.se').
  address TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_inbound_route_business
  ON email_inbound_route(business_id);

-- Adressen ska vara normaliserad INNAN insert — constrainten vaktar att
-- ingen kodväg smyger in versaler och skapar en rad som aldrig matchas
-- (uppslaget sker på lower(inkommande adress)).
ALTER TABLE email_inbound_route
  DROP CONSTRAINT IF EXISTS email_inbound_route_lowercase;
ALTER TABLE email_inbound_route
  ADD CONSTRAINT email_inbound_route_lowercase
  CHECK (address = lower(address));

-- RLS: enbart service_role. Webhooken och settings-API:t går båda via
-- service-role på servern; ingen klient ska kunna läsa eller skriva
-- routningen (en anställd som pekar om adressen till fel tenant vore
-- ett tenant-isolationshål).
ALTER TABLE email_inbound_route ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies
                 WHERE policyname = 'service_email_inbound_route'
                   AND tablename = 'email_inbound_route') THEN
    CREATE POLICY service_email_inbound_route ON email_inbound_route
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ═══ VERIFIERING ═══
SELECT count(*) AS antal_rutter FROM email_inbound_route;
SELECT tablename, policyname FROM pg_policies WHERE tablename = 'email_inbound_route';
