-- v72_quote_template_terms — terms_text på mallnivå (quote_templates)
--
-- Etapp 3 (mallbanken, se plans/vad-kan-vi-kopiera-snug-phoenix.md): "Spara
-- som mall" tappade tyst offertens egna Villkor-text (quotes.terms_text,
-- se sql/v_quote_terms_text.sql) eftersom quote_templates saknade
-- motsvarande kolumn. Detta lägger till den på mallen så att en sparad
-- mall återger sin Villkor-text nästa gång den används.
--
-- Kör manuellt i Supabase SQL Editor.

ALTER TABLE quote_templates
  ADD COLUMN IF NOT EXISTS terms_text TEXT;

COMMENT ON COLUMN quote_templates.terms_text IS
  'Egen Villkor-text för mallen (speglar quotes.terms_text). Nullable — om satt, förifylls offertens terms_text när mallen tillämpas. Kolumnen kan saknas tills denna migration körts; app-koden i app/api/quote-templates/route.ts hanterar det defensivt (retry utan fältet vid PGRST204).';

-- Verifiering: bekräftar att tabellen finns i prod och visar antal rader
-- (om denna query felar med "relation does not exist" finns inte
-- quote_templates i prod — utöka då migrationen med CREATE TABLE från
-- quote_overhaul.sql:69-92 innan ALTER-satsen ovan körs om).
select count(*) from quote_templates;
