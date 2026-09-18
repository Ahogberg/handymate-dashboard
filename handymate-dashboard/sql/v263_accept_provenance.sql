-- v263: EN sanning för vem som registrerade accepten.
--
-- Bakgrund (mätt i prod 2026-09-18): tre vägar sätter quotes.status='accepted'
-- — kundens signering, kundportalens knapp och hantverkarens interna accept —
-- men ingen av dem lämnade en maskinläsbar markör för VILKEN väg det var.
-- Den interna rutten försökte skriva `accepted_manually`, en kolumn som ALDRIG
-- funnits i prod; felgrenen under den föll tillbaka på en update som tappade
-- även `accepted_at`. Följden: en offert som hantverkaren själv markerade som
-- accepterad såg i databasen exakt ut som en offert kunden signerat, och
-- gränssnittet skrev "Offert signerad av kund" om båda.
--
-- `accepted_via` delar vokabulär med finalizerns `source`
-- (lib/quotes/finalize-accepted.ts) så att de inte kan drifta isär.
-- `accepted_by` fylls bara av den interna vägen: den inloggade användaren.
-- `accepted_manually` införs INTE — accepted_via ersätter idén.
BEGIN;

ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS accepted_via text;
ALTER TABLE public.quotes ADD COLUMN IF NOT EXISTS accepted_by text;

ALTER TABLE public.quotes DROP CONSTRAINT IF EXISTS quotes_accepted_via_check;
ALTER TABLE public.quotes ADD CONSTRAINT quotes_accepted_via_check
  CHECK (accepted_via IS NULL OR accepted_via IN ('signering', 'kundportal', 'internt'));

COMMENT ON COLUMN public.quotes.accepted_via IS
  'Vägen accepten kom in: signering | kundportal | internt. Samma vokabulär som finalizerns source.';
COMMENT ON COLUMN public.quotes.accepted_by IS
  'Bara för accepted_via=''internt'': den inloggade användare som registrerade accepten.';

-- Ingen backfill. De 8 historiska accepterna saknar bevis för sin väg, och en
-- gissning här hade varit sämre än ett ärligt NULL.
COMMIT;
