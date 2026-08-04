-- V83: Pensionera skills-JSONB till förmån för specialties[]
-- (tasks/resurs-masterplan.md, R1-C — skills↔specialties-konsolidering)
-- Kör manuellt i Supabase SQL Editor.
--
-- BAKGRUND: business_users har TVÅ kompetens-fält som råkat leva parallellt:
--   - skills JSONB DEFAULT '[]'  (sql/v17_dispatch.sql) — HAR INGEN
--     skriv-UI någonstans i produkten. lib/dispatch.ts:80-82 (innan denna
--     sprint) var enda platsen som läste den. I praktiken död data — ingen
--     anställd har någonsin kunnat sätta den via UI.
--   - specialties TEXT[] DEFAULT '{}' (sql/v_job_types.sql) — HAR en
--     riktig skriv-UI (app/dashboard/team/page.tsx, "Specialiteter"-
--     multiselecten) kopplad till job_types-tabellen. Detta är sanningen.
--
-- FORM-VERIFIERING (krav i planen innan denna fil skrevs): läst
-- lib/dispatch.ts — skills-värdena är en flat JSONB-array av strängar,
-- t.ex. '["el","vvs"]' (samma vokabulär som normalizeJobType() i samma
-- fil producerar: el/vvs/bygg/måleri/tak/mark/golv/allman). specialties
-- är en TEXT[] av job_types.slug-strängar (slugifyJobType(), lib/job-
-- types.ts) — samma STRÄNGFORM (lowercase, understreck), så en rak copy
-- är säker att köra utan transformation. Om ett företags job_types råkar
-- ha andra slugs än skills-vokabuläret matchar de helt enkelt inte något
-- jobb — samma "no match" som innan migrationen (aldrig sämre).
--
-- VAD DENNA MIGRATION GÖR:
--   1. För varje business_users-rad där specialties ÄR TOM och skills
--      INTE är tom: kopiera skills-arrayens strängar in i specialties.
--      Idempotent — kör den flera gånger utan att skapa dubbletter eller
--      skriva över data någon användare redan satt via UI:t (specialties
--      som redan har innehåll rörs ALDRIG).
--   2. DROPPAR INTE skills-kolumnen. Den bara dokumenteras här som död —
--      en separat städmigration senare (efter att lib/dispatch.ts-
--      fallbacken tagits bort och detta körts i produktion en tid) får
--      göra DROP COLUMN. Att droppa i samma migration som skriver om
--      data vore oåterkalleligt om copy-steget visar sig fel på något
--      håll — säkrare att låta skills ligga kvar orörd som backup.
--
-- Efter körning: lib/dispatch.ts:s resolveMemberSkills() fortsätter
-- fungera identiskt (specialties finns nu överallt där skills fanns,
-- så fallback-grenen till skills slutar triggas i praktiken — men
-- koden lämnas orörd tills en uttrycklig städsprint tar bort den).

DO $$
DECLARE
  migrated_count INTEGER;
BEGIN
  UPDATE business_users
  SET specialties = ARRAY(
    SELECT DISTINCT jsonb_array_elements_text(skills)
  )
  WHERE (specialties IS NULL OR array_length(specialties, 1) IS NULL OR array_length(specialties, 1) = 0)
    AND skills IS NOT NULL
    AND jsonb_typeof(skills) = 'array'
    AND jsonb_array_length(skills) > 0;

  GET DIAGNOSTICS migrated_count = ROW_COUNT;
  RAISE NOTICE 'v83: migrerade skills → specialties för % business_users-rader', migrated_count;
END $$;

-- Ingen DROP COLUMN skills här — se filhuvudet. Nästa steg (separat
-- migration, senare städsprint):
--   ALTER TABLE business_users DROP COLUMN IF EXISTS skills;
-- ...och ta bort skills-fallbacken i lib/dispatch.ts när den körts.

SELECT 'v83 klar — skills kopierat in i specialties där specialties var tomt (skills-kolumnen kvar, ej droppad)' AS status;
