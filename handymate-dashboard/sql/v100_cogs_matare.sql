-- ============================================================================
-- v100 — COGS-mätaren: vad en kund faktiskt kostar oss
--
-- KÖRS MANUELLT I SUPABASE SQL EDITOR. Aldrig programmatiskt.
--
-- ═══ BAKGRUND ═══
--
-- Vi kunde inte svara på frågan "vad kostar kund X oss?". Två mätsystem
-- fanns, båda otillräckliga:
--
--   * sms_usage mäter vad vi TAR av kunden (0,89/0,79/0,69 kr per extra-SMS).
--     Det är en INTÄKTSTABELL. Vår inköpskostnad är 0,52 kr.
--   * usage_record var helt död — noll callsites till incrementUsage() — men
--     billing-sidan LÄSTE den och visade procent mot plangränser. Kunden såg
--     alltså alltid "0 minuter", oavsett förbrukning.
--
-- Dessutom: det dyra utgående samtalsbenet (vidarekopplingen till
-- hantverkarens mobil, 0,57 kr/min) hade ingen rad någonstans i schemat.
-- Största rörliga kostnaden per kund var osynlig.
--
-- ═══ ÄGARSKAPSGRÄNSEN — LÄS DEN HÄR INNAN DU LÄGGER TILL EN KOLUMN ═══
--
-- Det här repot har historik av samma data i fyra kopior som gled isär (se
-- kommentaren om spår D1 i components/dashboard/agentPersonas.ts). Gränsen
-- skrivs därför ut både här och som COMMENT ON TABLE, så nästa läsare inte
-- behöver hitta planen som beskrev den:
--
--   sms_usage                 → KVOT. Kundvänd gräns, hard cap,
--                               extradebitering. Denominerad i SEK VI TAR.
--   agent_runs.estimated_cost → LLM-TAK. Dygnsgovernor. Denominerad i USD.
--   cost_event (denna)        → COGS. Vår kostnad. Denominerad i ÖRE, heltal.
--   usage_record              → INGET. Avvecklas, läsarna tas bort.
--
-- cost_event är APPEND-ONLY och HÄRLEDD. Den är aldrig auktoritativ för kvot,
-- feature-gate eller fakturering. Går den sönder tappar vi insikt, inte
-- pengar — och det är designen, inte en brist.
--
-- ═══ INGEN BACKFILL ═══
--
-- Historiken går inte att rekonstruera: sms_log skrivs bara av 7 av 27
-- sändningsvägar, och samtalsben har aldrig lagrats. En rekonstruktion vore
-- en gissning som ser ut som ett mätvärde — farligaste sortens data. Mätaren
-- börjar på noll den dag den slås på.
-- ============================================================================

-- ── 1. Kostnadsboken ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.cost_event (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  -- 'sms' | 'call_out' | 'whisper' | 'llm'. Avsiktligt TEXT och inte enum:
  -- ett nytt resursslag ska inte kräva en migration för att kunna mätas.
  resource TEXT NOT NULL,
  -- Antal i resursens egen enhet: SMS-DELAR (inte meddelanden),
  -- debiterbara minuter, tokens. Enheten dokumenteras per resursslag i
  -- lib/costs/record.ts.
  units NUMERIC NOT NULL DEFAULT 0,
  -- Heltal öre. Flyttalsören blir avrundningsspöken när tusentals rader
  -- summeras, och en kostnadsrapport som inte går ihop på kronan går inte
  -- att lita på.
  cost_ore INTEGER NOT NULL DEFAULT 0,
  -- Vilken prislista raden räknades med. Gör historiken oföränderlig när
  -- priser ändras — se lib/costs/price-list.ts.
  price_version TEXT NOT NULL,
  -- Spårbarhet tillbaka till det som kostade: 'sms_log', 'call_recording',
  -- 'agent_run' + dess id. Inga kunddata, bara referenser.
  ref_type TEXT,
  ref_id TEXT,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.cost_event IS
  'COGS per företag — VÅR inköpskostnad i öre. Append-only och härledd; '
  'aldrig auktoritativ för kvot, feature-gate eller fakturering. '
  'ÄGARSKAPSGRÄNS: sms_usage äger KVOT (SEK vi tar av kunden), '
  'agent_runs.estimated_cost äger LLM-dygnstaket (USD), denna tabell äger '
  'KOSTNAD (öre). Blanda dem aldrig — lägg aldrig kvotkolumner här och '
  'aldrig kostnadskolumner i sms_usage. Se tests/cogs-matare.spec.ts, '
  'avsnittet "ägarskapsgränsen". Ingen backfill finns: mätaren börjar på '
  'noll 2026-08-08, så tomma perioder före det är avsaknad av mätning, '
  'inte avsaknad av kostnad.';

COMMENT ON COLUMN public.cost_event.units IS
  'Resursens egen enhet. sms = DELAR (ett långt SMS är flera delar och '
  'kostar flera gånger, men drar bara 1 från kundens kvot — den '
  'diskrepansen är avsiktlig och hör till prissättningen, inte mätningen).';

CREATE INDEX IF NOT EXISTS idx_cost_event_business_created
  ON public.cost_event (business_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_cost_event_business_resource_created
  ON public.cost_event (business_id, resource, created_at DESC);

-- ── 2. RLS: internt, bara service_role ─────────────────────────────────────
--
-- Till skillnad från sms_usage har cost_event INGEN tenant-läspolicy. COGS är
-- vårt tal för vår publik. En hantverkare som betalar 5 990 kr/mån ska inte
-- kunna läsa vår inköpsmarginal, och kvoten hen SKA se bor i sms_usage.
-- Mönstret är detsamma som v96_tenant_rls_and_credentials.sql rad 60-64.

ALTER TABLE public.cost_event ENABLE ROW LEVEL SECURITY;

DO $policy_cleanup$
DECLARE
  policy_name TEXT;
BEGIN
  FOR policy_name IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'cost_event'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.cost_event', policy_name);
  END LOOP;
END
$policy_cleanup$;

CREATE POLICY cost_event_service_role
  ON public.cost_event
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ── 3. sms_log får kostnadsspåret ──────────────────────────────────────────
--
-- Delräkningen fanns inte i kodbasen alls före 2026-08-08: ett 300-teckens
-- SMS kostade oss 2 x 52 öre men bokfördes som ett. En emoji tvingar hela
-- meddelandet till UCS-2 (70 tecken per del i stället för 160), så en agent
-- som lägger en emoji i ett 100-teckens SMS fördubblar kostnaden tyst.

ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS sms_parts INTEGER;
ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS cost_ore INTEGER;
ALTER TABLE public.sms_log ADD COLUMN IF NOT EXISTS price_version TEXT;

COMMENT ON COLUMN public.sms_log.sms_parts IS
  'Antal SMS-delar. NULL på rader skrivna före COGS-mätaren (2026-08-08) — '
  'de går inte att räkna om i efterhand.';

-- ── 4. usage_record märks avvecklad — OM den ens finns ─────────────────────
--
-- Droppas INTE: en DROP TABLE är oåterkallelig och ger noll värde när
-- läsarna ändå tas bort.
--
-- ═══ DEN HÄR TABELLEN FINNS INTE I PRODUKTION (verifierat 2026-08-08) ═══
--
-- Första körningen av v100 föll på 42P01: relation "public.usage_record"
-- does not exist.
--
-- Kontrollen mot produktion visade att billing_plan och billing_event DÄREMOT
-- finns. sql/billing.sql har alltså körts — men usage_record saknas ändå,
-- ensam av filens tre tabeller. Varför går inte att avgöra ur repot: den kan
-- ha droppats i efterhand, eller aldrig ha skapats. Det spelar ingen roll
-- operativt, för läsarna är borttagna i samma ändring.
--
-- Det som DOCK ändrar bilden: billing-sidan visade inte 0 för att tabellen
-- var tom. Den visade 0 för att queryn gick mot en tabell som inte finns, och
-- felet slängdes bort (`const { data: usage } = await supabase…` utan
-- error-läsning). Kunden fick en siffra som aldrig hade någon källa alls —
-- och ingen larmade, eftersom ett bortkastat fel ser ut som noll.
--
-- Kommentaren nedan sätts bara om tabellen mot förmodan finns i någon miljö.
-- Migrationen ska inte falla på dess frånvaro.

DO $usage_record_kommentar$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'usage_record'
  ) THEN
    COMMENT ON TABLE public.usage_record IS
      'AVVECKLAD 2026-08-08. Var död i praktiken: incrementUsage() hade noll '
      'callsites, så call_minutes skrevs aldrig — men billing-sidan läste '
      'tabellen och visade 0 för kunden. Räknarformad utan valuta, och '
      'dubblerade sms_usage. Fyll den inte: kostnad hör i cost_event, kvot i '
      'sms_usage. Läsarna borttagna i samma ändring.';
  ELSE
    RAISE NOTICE 'usage_record finns inte — hoppar över kommentaren. Det är '
                 'förväntat: sql/billing.sql har aldrig körts i produktion.';
  END IF;
END
$usage_record_kommentar$;

-- ============================================================================
-- VERIFIERING efter körning
-- ============================================================================
--
-- Tabellen finns, är RLS-skyddad och har exakt en policy:
--
--   SELECT relname, relrowsecurity FROM pg_class
--   WHERE relname = 'cost_event';
--   -- förväntat: cost_event | true
--
--   SELECT policyname, roles, cmd FROM pg_policies
--   WHERE tablename = 'cost_event';
--   -- förväntat: exakt EN rad, cost_event_service_role, {service_role}, ALL
--
-- sms_log har de tre nya kolumnerna:
--
--   SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'sms_log'
--     AND column_name IN ('sms_parts', 'cost_ore', 'price_version')
--   ORDER BY column_name;
--   -- förväntat: tre rader (cost_ore integer, price_version text,
--   --            sms_parts integer)
--
-- Ingen tenant kan läsa kostnadsboken (kör som authenticated, inte
-- service_role) — förväntat: noll rader eller permission denied:
--
--   SELECT count(*) FROM public.cost_event;
--
-- ── SCHEMALÄGET, KONTROLLERAT 2026-08-08 ──────────────────────────────────
--
--   SELECT t.table_name,
--          (SELECT count(*) FROM information_schema.tables i
--            WHERE i.table_schema='public' AND i.table_name=t.table_name) AS finns
--   FROM (VALUES ('billing_plan'),('usage_record'),('billing_event'),
--                ('sms_usage'),('sms_log'),('cost_event')) AS t(table_name);
--
-- Utfall efter v100: billing_plan=1, usage_record=0, billing_event=1,
-- sms_usage=1, sms_log=1, cost_event=1.
--
-- billing_plan finns, alltså svarar /api/billing och /api/billing/usage som
-- de ska — prenumerationssidan är hel. usage_record är den enda saknade, och
-- den är avvecklad ändå.
-- ============================================================================
