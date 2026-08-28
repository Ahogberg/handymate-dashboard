-- v179: leads.lead_number — kolumnen Golden Path skriver men som aldrig skapades i prod
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND (2026-08-28, hittad av Block A-beviset)
-- lib/leads/golden-path.ts skriver `lead_number` (L-1001, …) i varje lead-
-- insert. sql/bugfix_ids.sql skulle ha lagt till kolumnen, men den delen
-- kördes aldrig i prod: `SELECT lead_number FROM leads` ger 42703.
-- Konsekvens: varje strukturerat inflöde som går genom Golden Path — widget-
-- chatten, leads/intake, storefront-kontakt, publika bokningssidan, mejl-
-- inflödet, röst, referral — skapar kunden och faller sedan på lead-insertet.
-- `leads` har 0 rader totalt i prod. Ingen lead har någonsin sparats den vägen.
-- Golden Path-harnesset kunde inte fånga det: det går kund → offert → projekt,
-- aldrig genom lead-inflödet. Fantomkolumn-klassen (#23/#24/#27), igen.
--
-- BESLUT
-- Skapa kolumnen som bugfix_ids.sql avsåg (+ index). Backfill ur
-- project_number (gamla L-nummer låg där med P-prefix) är ofarlig — tabellen
-- är tom. Lead-räknaren (business_counters 'lead') finns redan.

BEGIN;

ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS lead_number TEXT;

UPDATE public.leads
SET lead_number = REPLACE(project_number, 'P-', 'L-')
WHERE project_number IS NOT NULL AND lead_number IS NULL;

CREATE INDEX IF NOT EXISTS idx_lead_number ON public.leads (business_id, lead_number);

COMMENT ON COLUMN public.leads.lead_number IS
  'L-<löpnummer> per företag (business_counters ''lead''), satt av Golden Path (lib/leads/golden-path.ts).';

COMMIT;

-- Verifiera efteråt:
-- SELECT lead_number FROM public.leads LIMIT 1;   -- får inte ge 42703
-- SELECT indexname FROM pg_indexes WHERE tablename = 'leads' AND indexname = 'idx_lead_number';
