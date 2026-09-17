-- v254 (2026-09-17): id på varje mallrad i quote_templates.default_items.
--
-- Frågeflödet per jobbtyp pekar på RADER (mallradens id) i stället för på en
-- enhet — se lib/quotes/intake-questions.ts. 217 av 221 mallrader bar redan
-- ett id (qi_… ur generateItemId); de fyra utan kom från "Vad brukar ingå?"
-- (lib/quotes/job-standard-server.ts productRows), som nu sätter id på nya
-- rader. Det här backfyller de befintliga. Deterministiskt id ur mallens id
-- och radens position, så en omkörning ger samma resultat.
--
-- Ingen WHERE på business_id: det är en schemanivå-backfyllning av ett
-- saknat fält, ingen radering, och den rör bara rader som saknar id.

UPDATE public.quote_templates t
SET default_items = (
  SELECT jsonb_agg(
    CASE WHEN r ? 'id' AND jsonb_typeof(r->'id') = 'string' AND length(r->>'id') > 0 THEN r
         ELSE r || jsonb_build_object('id', 'qi_' || substr(md5(t.id || '_' || (i - 1)::text), 1, 12))
    END ORDER BY i)
  FROM jsonb_array_elements(t.default_items) WITH ORDINALITY x(r, i)
)
WHERE jsonb_typeof(t.default_items) = 'array'
  AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(t.default_items) r
    WHERE NOT (r ? 'id') OR jsonb_typeof(r->'id') <> 'string' OR length(r->>'id') = 0
  );

-- Kontroll efteråt (ska ge 0 och 221):
-- SELECT count(*) FROM quote_templates t, jsonb_array_elements(t.default_items) r WHERE NOT (r ? 'id');
-- SELECT count(*) FROM quote_templates t, jsonb_array_elements(t.default_items) r;
