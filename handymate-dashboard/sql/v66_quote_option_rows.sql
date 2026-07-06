-- v66_quote_option_rows.sql — Tillvalsrader. Körs manuellt i Supabase FÖRE
-- deploy av tillvals-UI:t (quotes-API:t failar numera högljutt på ogiltig
-- item_type → option-rader före migreringen = misslyckade sparningar).
ALTER TABLE quote_items DROP CONSTRAINT IF EXISTS quote_items_item_type_check;
ALTER TABLE quote_items ADD CONSTRAINT quote_items_item_type_check
  CHECK (item_type IN ('item','heading','text','subtotal','discount','option'));
-- Kundens val (initieras från option_default vid skapande; skrivs vid signering)
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_selected BOOLEAN DEFAULT false;
-- Hantverkarens "Förvald"-toggle
ALTER TABLE quote_items ADD COLUMN IF NOT EXISTS option_default BOOLEAN DEFAULT false;
-- Juridiskt spår: valda/bortvalda tillval med belopp vid signeringsögonblicket
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS signed_options JSONB;
