-- v210: Bee Service — konsolidera fyra konton till ett
--
-- Bakgrund (2026-09-04): Christoffers anställde Darius kunde inte skapa kunder,
-- och Christoffer hittade inte en kund som bevisligen fanns. Utredningen visade
-- att "Bee Service" finns som FYRA business_config-rader med tre olika
-- Christoffer-inloggningar. Loggar någon in i fel konto ser de en främmande
-- kundlista — och biz_4awmqezu3ns står dessutom på onboarding_step 4, vilket
-- låser användaren i onboardingflödet.
--
-- Inventering före (verifierad via MCP 2026-09-04):
--   biz_21wswuhrbhy         79 kunder, 18 offerter, 26 projekt, 3 användare  ← BEHÅLLS (huvudkonto)
--   biz_6wunctak49          21 kunder (17 unika), 22 deals, 2 offerter       ← BEHÅLLS, döps om
--   biz_4awmqezu3ns          0 kunder, 0 deals, 0 offerter, 1 användare      ← RADERAS
--   bee_services_ab_te6uga   0 kunder, 0 deals, 0 offerter, 0 användare      ← RADERAS
--
-- De två som raderas innehåller ENBART konfiguration (produkter, automations-
-- regler, pipeline-steg, agentkörningar) — ingen kund-, affärs- eller
-- fakturadata. Verifierat genom att räkna varje tabell med business_id.
--
-- biz_6wunctak49 raderas INTE: 17 av dess 21 kunder finns ingen annanstans
-- (BRF Baggen 3, BRF Prästgårdshusen, BRF Roddaren 27, Svenska kyrkan m.fl.).
-- Permanent dataförlust är en P0-stoppregel. Det döps i stället om så att
-- ingen loggar in där av misstag; beslut om migrering eller radering tas
-- separat med Christoffer.

BEGIN;

-- ── 1. Före-bild ───────────────────────────────────────────────────────────
SELECT 'FÖRE' AS steg, business_id, business_name, subscription_status,
       onboarding_step,
       (SELECT count(*) FROM customer c WHERE c.business_id = bc.business_id) AS kunder,
       (SELECT count(*) FROM deal d WHERE d.business_id = bc.business_id) AS deals
FROM business_config bc
WHERE business_name ILIKE '%bee%'
ORDER BY kunder DESC;

-- ── 2. Skyddsspärr ─────────────────────────────────────────────────────────
-- Raderingen får bara gå igenom om kontona fortfarande är tomma på affärsdata.
-- Har någon hunnit lägga in en kund sedan inventeringen avbryts hela körningen.
DO $$
DECLARE
  v_kunder bigint;
  v_deals  bigint;
  v_quotes bigint;
BEGIN
  SELECT count(*) INTO v_kunder FROM customer
   WHERE business_id IN ('biz_4awmqezu3ns','bee_services_ab_te6uga');
  SELECT count(*) INTO v_deals FROM deal
   WHERE business_id IN ('biz_4awmqezu3ns','bee_services_ab_te6uga');
  SELECT count(*) INTO v_quotes FROM quotes
   WHERE business_id IN ('biz_4awmqezu3ns','bee_services_ab_te6uga');

  IF v_kunder > 0 OR v_deals > 0 OR v_quotes > 0 THEN
    RAISE EXCEPTION
      'AVBRYTER: kontona är inte längre tomma (kunder=%, deals=%, offerter=%). Inventera om innan radering.',
      v_kunder, v_deals, v_quotes;
  END IF;
END $$;

-- ── 3. Radera de två tomma kontona ─────────────────────────────────────────
-- Barnrader först (alla tabeller med business_id), business_config sist.
DO $$
DECLARE
  r record;
  v_total bigint := 0;
  v_n bigint;
BEGIN
  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'business_id'
      AND c.table_name <> 'business_config'
      AND t.table_type = 'BASE TABLE'
  LOOP
    EXECUTE format('DELETE FROM public.%I WHERE business_id IN ($1,$2)', r.table_name)
      USING 'biz_4awmqezu3ns', 'bee_services_ab_te6uga';
    GET DIAGNOSTICS v_n = ROW_COUNT;
    IF v_n > 0 THEN
      RAISE NOTICE 'Raderade % rader ur %', v_n, r.table_name;
      v_total := v_total + v_n;
    END IF;
  END LOOP;
  RAISE NOTICE 'Totalt % barnrader raderade', v_total;
END $$;

DELETE FROM business_config
 WHERE business_id IN ('biz_4awmqezu3ns','bee_services_ab_te6uga');

-- ── 4. Döp om det gamla kontot som behåller sin data ───────────────────────
-- Syftet är att ingen ska logga in där av misstag. Datan är orörd.
UPDATE business_config
   SET business_name = 'Bee Service AB (GAMMALT – använd ej)'
 WHERE business_id = 'biz_6wunctak49';

-- ── 5. Efter-bild ──────────────────────────────────────────────────────────
SELECT 'EFTER' AS steg, business_id, business_name, subscription_status,
       onboarding_step,
       (SELECT count(*) FROM customer c WHERE c.business_id = bc.business_id) AS kunder,
       (SELECT count(*) FROM deal d WHERE d.business_id = bc.business_id) AS deals
FROM business_config bc
WHERE business_name ILIKE '%bee%'
ORDER BY kunder DESC;

-- Kvarvarande auth-användare utan företag efter raderingen (förväntat: den
-- Christoffer-inloggning som ägde biz_4awmqezu3ns). De får "Inget företag
-- kopplat till kontot" vid inloggning — vilket är bättre än att hamna i fel
-- konto. Radera dem manuellt i Supabase-dashboarden om ni vill städa helt.
SELECT 'HEMLÖSA INLOGGNINGAR' AS steg, au.id, au.email
FROM auth.users au
WHERE NOT EXISTS (SELECT 1 FROM business_config bc WHERE bc.user_id::text = au.id::text)
  AND NOT EXISTS (SELECT 1 FROM business_users bu WHERE bu.user_id::text = au.id::text)
  AND au.email ILIKE '%thanger%';

COMMIT;

-- KVAR EFTER DENNA MIGRATION (beslut med Christoffer):
--   Ska de 17 unika kunderna i biz_6wunctak49 migreras till biz_21wswuhrbhy,
--   eller är de inaktuella och kontot kan raderas helt? Ingen brådska —
--   omdöpningen stoppar felinloggningarna redan nu.
