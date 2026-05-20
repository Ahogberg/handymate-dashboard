-- v_quote_terms_text — egen 'Villkor'-text per offert
--
-- Pilot-feedback 2026-05-20: 'Villkor'-sektionen i färdig offert
-- ('Offerten gäller till X. Eventuellt tilläggsarbete...') är hardcoded
-- i quote-templates. Christoffer kunde inte redigera. Detta fält tillåter
-- egen text per offert — om satt, ersätter den hardcoded default-texten.
--
-- Kör manuellt i Supabase SQL Editor.

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS terms_text TEXT;

COMMENT ON COLUMN quotes.terms_text IS
  'Egen Villkor-text per offert. Om satt, ersätter hardcoded default-text i quote-templates (modern/friendly/premium). Annars används default: "Offerten gäller till X. Eventuellt tilläggsarbete debiteras enligt löpande räkning. Alla priser är exkl. moms."';
