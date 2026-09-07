-- v224: landing_leads — e-post valfri när mobilnummer finns
--       (Varumärkeslagret yta 9, demo-offerten på handymate.se, 2026-09-08)
--
-- Körs manuellt i Supabase SQL Editor. Ofarlig att köra före landningssidan
-- deployas: befintliga ytor skickar fortfarande alltid e-post.
--
-- ═══ VARFÖR ═══
--
-- Demo-offerten på startsidan ("Skicka en offert till dig själv") har inget
-- e-postfält. Besökaren skriver namn + mobilnummer, får ett riktigt offert-SMS
-- från demo-företaget och kan kryssa i "Ja, ni får ringa mig om Handymate".
-- Först då sparas en lead — via handymate-landing/api/save-lead.js med
-- source 'demo-offert' — och den leaden HAR ingen e-post.
--
-- landing_leads.email är NOT NULL sedan tabellen skapades (alla tidigare ytor
-- fångade e-post). Utan den här ändringen svarar Supabase 23502 och leaden
-- försvinner tyst — blocket på landningen fortsätter fungera (sparandet är
-- fire-and-forget), men ingen får veta att besökaren bad om ett samtal.
--
-- Skyddet flyttas i stället till en CHECK: en lead måste ha e-post ELLER
-- telefon. En rad utan någon av dem är ingen lead, oavsett yta.

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.landing_leads') IS NULL THEN
    RAISE EXCEPTION 'v224 kräver landing_leads';
  END IF;
END $$;

ALTER TABLE public.landing_leads
  ALTER COLUMN email DROP NOT NULL;

ALTER TABLE public.landing_leads
  DROP CONSTRAINT IF EXISTS landing_leads_kontakt_check;

ALTER TABLE public.landing_leads
  ADD CONSTRAINT landing_leads_kontakt_check
  CHECK (email IS NOT NULL OR phone IS NOT NULL);

COMMENT ON COLUMN public.landing_leads.email IS
  'Valfri sedan v224 — demo-offerten (source demo-offert) sparar namn + mobil utan e-post. CHECK kräver e-post eller telefon.';

COMMIT;

-- ═══ VERIFIERA ═══
-- SELECT is_nullable FROM information_schema.columns
-- WHERE table_name = 'landing_leads' AND column_name = 'email';        -- YES
-- SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
-- WHERE conrelid = 'public.landing_leads'::regclass AND conname = 'landing_leads_kontakt_check';
-- INSERT INTO landing_leads (source) VALUES ('demo-offert');           -- ska KASTA (varken e-post eller telefon)
