-- v256: backfill av jobbtyper och kopplingen jobbtyp → upplägg
-- Kördes 2026-09-18 via MCP mot pktaqedooyzgvzwipslu.
--
-- ═══ VARFÖR ═══
-- Mätt före körning: 29 företag, 26 utan en enda jobbtyp — 12 av dem
-- färdigonboardade, 6 betalande. 14 jobbtyper i hela tabellen, 3 med upplägg.
-- 45 upplägg, 3 med job_type_slug.
--
-- Hela det nya offertflödet vilar på kedjan jobbtyp → upplägg → frågor →
-- mängd på rätt rad. I produktionen fanns den kedjan i praktiken inte, och
-- hantverkaren mötte en tom remsa. Hittat av Andreas klickprov 2026-09-18.
--
-- Två skrivvägar till job_types, båda missar befintliga företag:
--  1) ensureOnboardingJobTypes skriver ur mallarnas job_type_name, men
--     namnmappningen JOBBTYP_FOR_MALL kom 2026-09-17. Företag som seedades
--     tidigare (Svensson 2026-07-21, Bee Service 2026-03-13) fick den aldrig.
--  2) migrateServicesOfferedToJobTypes är LAT — körs bara när någon öppnar
--     /api/job-types. Elexperten hade 8 tjänster liggande sedan januari.
--
-- ═══ VAD DEN GÖR (allt additivt och idempotent) ═══
--  Steg 1  business_config.services_offered → job_types
--  Steg 2  jobbtyp ur JOBBTYP_FOR_MALL för de seedade mallar som finns
--  Steg 3  koppla upplägg → jobbtyp där job_type_slug är NULL
--
-- ═══ VAD DEN MEDVETET INTE GÖR ═══
--  Skapar INGEN jobbtyp ur ett egenhändigt namngivet upplägg. Ett upplägg som
--  heter "Offert Andersson" är inte en jobbtyp, och en remsa full av kundnamn
--  är sämre än en tom. De ligger kvar under "Övriga upplägg" — det är precis
--  vad den chippen finns för.
--  Rör INGEN befintlig rad: ingen omdöpning, ingen avarkivering, och ett
--  job_type_slug som redan är satt skrivs aldrig över.
--
-- ═══ NAMNET ═══
-- services_offered bär ibland maskinnycklar ("uttag_och_strömbrytare",
-- "säkringsbyte") och ibland visningsnamn ("Installation"). Understreck blir
-- mellanslag och första bokstaven versal, annars hade hantverkaren fått
-- "uttag_och_strömbrytare" som chip — ett tekniskt ord i UI, mot CLAUDE.md.
-- Verifierat före körning att slugen blir IDENTISK ur båda formerna för alla
-- 12 raderna, så den lata migreringen hittar dem och hoppar över.
--
-- slugifyJobType (lib/job-types.ts:24) i SQL: lower, åäö→aao,
-- [^a-z0-9]+→_, trimma _, max 40 tecken.

WITH karta(mall, jobbtyp) AS (VALUES
  ('Enkel offert','Allmänt arbete'),('Detaljerad offert med grupper','Allmänt arbete'),
  ('Löpande räkning','Allmänt arbete'),('Enkel reparation','Allmänt arbete'),
  ('Badrumsrenovering','Renovera badrum'),('Köksrenovering','Renovera kök'),
  ('Altanbygge','Bygga altan'),('Byte av elcentral','Byta elcentral'),
  ('Belysningsinstallation','Installera belysning'),('Laddbox för elbil','Installera laddbox'),
  ('Elbesiktning','Elbesiktning'),('Badrum — VVS-installation','Dra rör vid badrumsrenovering'),
  ('Byte av blandare/WC','Byta blandare'),('Akutjobb VVS','Åtgärda vattenläcka'),
  ('Värmepumpsinstallation (luft/vatten)','Installera värmepump'),
  ('Målning inomhus','Måla väggar och tak'),('Fasadmålning','Måla fasad')
),
ur_tjanster AS (
  SELECT b.business_id,
         upper(left(replace(trim(e.value #>> '{}'),'_',' '),1))
           || substr(replace(trim(e.value #>> '{}'),'_',' '),2) AS namn
  FROM business_config b, jsonb_array_elements(COALESCE(b.services_offered,'[]'::jsonb)) e
  WHERE trim(e.value #>> '{}') <> ''
),
ur_mallar AS (
  SELECT DISTINCT t.business_id, k.jobbtyp AS namn
  FROM quote_templates t JOIN karta k ON k.mall = t.name
),
onskade AS (
  SELECT business_id, namn,
         left(regexp_replace(regexp_replace(translate(lower(namn),'åäö','aao'),
              '[^a-z0-9]+','_','g'),'^_+|_+$','','g'),40) AS slug
  FROM (SELECT * FROM ur_tjanster UNION SELECT * FROM ur_mallar) x
)
INSERT INTO job_types (business_id, name, slug)
SELECT DISTINCT ON (o.business_id, o.slug) o.business_id, o.namn, o.slug
FROM onskade o
WHERE o.slug <> ''
  AND NOT EXISTS (SELECT 1 FROM job_types j
                  WHERE j.business_id = o.business_id AND j.slug = o.slug)
ORDER BY o.business_id, o.slug, o.namn;

-- Steg 3: koppla upplägg → jobbtyp. Rör bara rader där slugen saknas, och
-- bara när jobbtypen faktiskt finns — en koppling till en jobbtyp som inte
-- existerar är sämre än ingen koppling: remsan visar den aldrig.
WITH karta(mall, jobbtyp) AS (VALUES
  ('Enkel offert','Allmänt arbete'),('Detaljerad offert med grupper','Allmänt arbete'),
  ('Löpande räkning','Allmänt arbete'),('Enkel reparation','Allmänt arbete'),
  ('Badrumsrenovering','Renovera badrum'),('Köksrenovering','Renovera kök'),
  ('Altanbygge','Bygga altan'),('Byte av elcentral','Byta elcentral'),
  ('Belysningsinstallation','Installera belysning'),('Laddbox för elbil','Installera laddbox'),
  ('Elbesiktning','Elbesiktning'),('Badrum — VVS-installation','Dra rör vid badrumsrenovering'),
  ('Byte av blandare/WC','Byta blandare'),('Akutjobb VVS','Åtgärda vattenläcka'),
  ('Värmepumpsinstallation (luft/vatten)','Installera värmepump'),
  ('Målning inomhus','Måla väggar och tak'),('Fasadmålning','Måla fasad')
)
UPDATE quote_templates t
SET job_type_slug = j.slug
FROM karta k, job_types j
WHERE k.mall = t.name
  AND t.job_type_slug IS NULL
  AND j.business_id = t.business_id
  AND j.slug = left(regexp_replace(regexp_replace(translate(lower(k.jobbtyp),'åäö','aao'),
               '[^a-z0-9]+','_','g'),'^_+|_+$','','g'),40);

-- ═══ KÖRD 2026-09-18 — SKA INTE KÖRAS OM ═══
-- Satserna ovan är idempotenta (NOT EXISTS respektive job_type_slug IS NULL),
-- så en omkörning är ofarlig men meningslös. Utfall vid körningen:
--   30 jobbtyper skapade, 34 upplägg kopplade.
--
--                                  före      efter
--   Företag utan jobbtyp           26/29     18/29
--   Onboardade utan jobbtyp        12        4
--   Jobbtyper totalt               14        44
--   Jobbtyper med upplägg          3         22
--   Upplägg med jobbtyp            3/45      37/45
--   Föräldralösa kopplingar        —         0
--   Dubbletter (business_id, slug) —         0
--
-- KVAR EFTERÅT: Ekström Bygg AB (active, onboardad) har 0 jobbtyper, 0
-- upplägg OCH 0 artiklar. Backfillen kan inte hjälpa den — det finns
-- ingenting att härleda ur. Det är ett eget fel i onboardingen.
-- De två Rollprov-firmorna är testkonton.
