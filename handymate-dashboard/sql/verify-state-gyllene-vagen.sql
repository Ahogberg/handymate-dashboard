-- ═══════════════════════════════════════════════════════════════════════════
-- LÄGESKOLL INFÖR GYLLENE VÄGEN — 2026-08-07
--
-- Kör i Supabase SQL Editor (HANDYMATE-projektet). Klistra HELA resultatet
-- tillbaka till Claude.
--
-- Det här är INGEN migration. Filen ändrar ingenting och tar inget
-- versionsnummer — den läser bara. Samma mönster som
-- verify-migrations-status.sql.
--
-- Varför den finns: dagens tolv ändringar är verifierade av facit som läser
-- SQL-FILER och KÄLLKOD. De är gröna för att koden är skriven rätt. Ingenting
-- av det bevisar vad som faktiskt gäller i databasen. Det gör den här.
--
-- Kör avsnitten ETT I TAGET — de returnerar olika former.
-- ═══════════════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────────────────
-- 1. ÄR MIGRATIONERNA KÖRDA?
--
-- true = kolumnen/tabellen/indexet som migrationen skulle skapa finns.
-- ───────────────────────────────────────────────────────────────────────────
SELECT 'v96 tabellen business_integration_credentials' AS kontroll,
  EXISTS (SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'business_integration_credentials') AS ok
UNION ALL
SELECT 'v96 funktionen is_business_member',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'is_business_member')
UNION ALL
-- Utan SECURITY DEFINER kan funktionen inte läsa medlemskapstabellen åt en
-- inloggad användare. Då NEKAR varje policy som anropar den allt — och
-- isoleringen ser ut att fungera, av helt fel skäl.
SELECT 'v96 is_business_member är SECURITY DEFINER',
  COALESCE((SELECT p.prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
            WHERE n.nspname = 'public' AND p.proname = 'is_business_member' LIMIT 1), false)
UNION ALL
SELECT 'v97 funktionen sign_quote_with_options',
  EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
          WHERE n.nspname = 'public' AND p.proname = 'sign_quote_with_options')
UNION ALL
SELECT 'v98 index quotes_business_year_number_unique',
  EXISTS (SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'quotes_business_year_number_unique')
UNION ALL
SELECT 'v98 constraint quotes_parent_version_unique',
  EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotes_parent_version_unique');


-- ───────────────────────────────────────────────────────────────────────────
-- 2. HUR SER POLICYERNA UT? (en ögonblicksbild — INTE beviset)
--
-- Codex granskning 2026-08-08 hade rätt: den här läser vad databasen SÄGER om
-- sig själv. Beviset att isoleringen HÅLLER är cross-tenant-provet
-- (tests/tenant-isolation.integration.spec.ts) som faktiskt försöker läsa fel
-- tenants rader med en riktig session. Kör båda; lita bara på provet.
--
-- DET DU VILL SE: rls_pa = true på varje tabell, och för `authenticated` att
-- BÅDE qual OCH with_check innehåller is_business_member(business_id). En
-- policy med rätt qual men with_check = NULL/true släpper igenom SKRIVNINGAR
-- till andras rader trots att läsningen filtreras.
--
-- DET SOM ÄR ILLA: qual eller with_check = `true` för authenticated, eller
-- rls_pa = false. (`true` för service_role är väntat och rätt.)
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  p.tablename,
  c.relrowsecurity AS rls_pa,
  p.policyname,
  p.roles::text AS roller,
  p.cmd,
  p.qual,
  p.with_check
FROM pg_policies p
JOIN pg_class c ON c.relname = p.tablename
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = p.schemaname
WHERE p.schemaname = 'public'
  AND p.tablename IN (
    'project', 'project_change', 'project_material',
    'time_entry', 'supplier_invoices', 'business_config',
    'business_integration_credentials'
  )
ORDER BY p.tablename, p.policyname;


-- ───────────────────────────────────────────────────────────────────────────
-- 3. KÖRS V98 UTAN ATT FAILA?
--
-- v98 skapar ett unikt index men städar INTE upp befintliga dubbletter.
-- generateQuoteNumber räknar årets rader och adderar ett, utan lås — två
-- samtidiga skapanden får samma nummer.
--
-- BÅDA FRÅGORNA SKA GE NOLL RADER. Träffar → numrera om innan v98 körs,
-- annars stannar migrationen halvvägs.
-- ───────────────────────────────────────────────────────────────────────────
-- Uttrycket är avsiktligt IDENTISKT med v98:s indexdefinition (UTC-år). Med
-- lokal tid hade den här kollen kunnat visa noll och migrationen ändå fastna
-- på en offert skapad kring årsskiftet.
SELECT business_id,
       EXTRACT(YEAR FROM created_at AT TIME ZONE 'UTC')::int AS ar_utc,
       quote_number,
       COUNT(*) AS antal
FROM quotes
WHERE quote_number IS NOT NULL
GROUP BY 1, 2, 3
HAVING COUNT(*) > 1
ORDER BY antal DESC;

SELECT parent_quote_id, version_number, COUNT(*) AS antal
FROM quotes
WHERE parent_quote_id IS NOT NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1;


-- ───────────────────────────────────────────────────────────────────────────
-- 4. VILKA AUTOMATIONER LEVER?
--
-- Crons loggar inte enhetligt. Bättre signal är vad de PRODUCERAR: varje
-- nattsvep som fungerar lämnar kort efter sig.
--
-- DET VIKTIGASTE: finns `missad_intakt`? Intäktssvepet var dött i veckor på
-- grund av en kolumn som inte fanns.
--
-- OBS (Codex, 2026-08-08): frånvaro bevisar INTE att cronen är död — det kan
-- också betyda att inga kvalificerade fynd fanns. Saknas typen: skapa ett
-- känt fynd i testföretaget (signerad ÄTA utan faktura) och se om nästa
-- nattkörning plockar upp det. Först det skiljer "död" från "inget att hitta".
--
-- Se också efter `karin_deadline` (bolagskalenderns påminnelser) och
-- `review_auto_invoice` (fakturautkast efter avslutat projekt).
-- ───────────────────────────────────────────────────────────────────────────
SELECT approval_type,
       COUNT(*) AS antal,
       MIN(created_at) AS forsta,
       MAX(created_at) AS senaste
FROM pending_approvals
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY approval_type
ORDER BY senaste DESC;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. FORTNOX VERKLIGA LÄGE
--
-- Rådet antog att kopplingen finns men aldrig verifierats mot ett riktigt
-- kundkonto. Den här visar vem som faktiskt är kopplad.
--
-- ═══ INGA TOKENS I UTDATAN ═══
--
-- Frågan returnerar med flit BARA om en token finns, aldrig själva värdet.
-- Resultatet klistras tillbaka i en chatt — en levande Fortnox-token som
-- hamnar där är en läcka, inte en felsökning.
-- ───────────────────────────────────────────────────────────────────────────
SELECT
  business_id,
  (fortnox_access_token IS NOT NULL) AS har_token,
  fortnox_token_expires_at,
  (fortnox_token_expires_at < NOW()) AS utgangen,
  updated_at
FROM business_integration_credentials
ORDER BY updated_at DESC NULLS LAST;

-- Om avsnitt 1 visade att v96 INTE är körd ligger kredentialerna kvar i
-- business_config. Kör då den här i stället — samma regel, inga tokens ut:
--
--   SELECT business_id,
--          (fortnox_access_token IS NOT NULL) AS har_token,
--          fortnox_token_expires_at
--   FROM business_config
--   WHERE fortnox_access_token IS NOT NULL;
