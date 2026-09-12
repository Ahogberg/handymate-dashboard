-- v233 (2026-09-12): checklist_template far de kolumner dess egen
-- CREATE-fil redan deklarerar.
--
-- FYNDET. Demoaterstallningen foll pa 'defaults_seed_failed'. Atta av nio
-- delseeders hade rader pa demokontot; checklist_template hade noll — pa
-- SAMTLIGA konton, aldrig nagon. Orsaken: tabellen skapades for hand i
-- Supabase-dashboarden (de fyra systemmallarna ar fran 2026-02-10) med
-- kolumnerna description/branch/is_system. Repots egen CREATE-fil
-- (sql/rot_rut_documents.sql rad 102) deklarerar i stallet category och
-- is_default — men den ar skriven CREATE TABLE IF NOT EXISTS, sa den blev
-- en tyst no-op mot en tabell som redan fanns. Koden skrevs mot filen.
-- Varje insert kastade darfor 42703, i manader, utan att nagon sag det.
--
-- Verifierat 2026-09-12 mot produktion: ett riktigt insert-forsok med
-- category och is_default svarar
--   42703: column "category" of relation "checklist_template" does not exist
--
-- Harmed matchar tabellen sin deklarerade form. De fyra systemraderna
-- (business_id IS NULL, is_system = true) ror vi inte: is_system stannar
-- och beskriver de GLOBALA mallarna, is_default beskriver en rad som
-- foljde med vid seedning. Inga rader andras av den har filen.

ALTER TABLE checklist_template ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE checklist_template ADD COLUMN IF NOT EXISTS is_default BOOLEAN DEFAULT false;
