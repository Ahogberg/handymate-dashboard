-- ═══════════════════════════════════════════════════════════════════════════
-- v103 — Exakt ett projekt per accepterad offert
-- (2026-08-09, Project System Audit P0-2)
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor. Kör STEG 1 först och läs
-- resultatet innan steg 2 körs.
--
-- ═══ VARFÖR ═══
--
-- Tre skapare kan göra projekt ur samma offert:
--   lib/projects/create-from-quote.ts   (signering/portal/internt accept)
--   lib/autopilot/trigger.ts            (autopilotpaketet)
--   lib/e2e-deal-flow.ts                (deal-flödet — kollar deal_id, INTE quote_id)
--
-- Alla tre är check-then-insert: två samtidiga accept-händelser (kunden
-- signerar samtidigt som autopiloten kör) passerar båda kontrollen och
-- skapar två projekt. Två projekt ur samma offert är förstadiet till två
-- fakturor för samma arbete.
--
-- Regeln hör hemma i databasen — koden kan bara minska fönstret, aldrig
-- stänga det. Skaparna är uppdaterade att fånga 23505 och returnera det
-- befintliga projektet, så en kollision blir ett lugnt "finns redan".
-- ═══════════════════════════════════════════════════════════════════════════

-- ── STEG 1: Finns dubbletter redan? ──
--
-- Indexet går inte att skapa om prod redan har två projekt på samma offert.
-- Den här listan MÅSTE vara tom innan steg 2. Är den inte tom: titta på
-- raderna (har båda fakturor? tid? material?) och arkivera manuellt den av
-- dubbletterna som är tom — sätt dess quote_id till NULL i stället för att
-- radera, så historiken finns kvar:
--
--   UPDATE public.project SET quote_id = NULL WHERE project_id = '<tomma dubblettens id>';

SELECT
  p.business_id,
  p.quote_id,
  COUNT(*) AS antal_projekt,
  ARRAY_AGG(p.project_id ORDER BY p.created_at) AS projekt,
  ARRAY_AGG(p.status ORDER BY p.created_at) AS statusar
FROM public.project p
WHERE p.quote_id IS NOT NULL
GROUP BY p.business_id, p.quote_id
HAVING COUNT(*) > 1
ORDER BY antal_projekt DESC;

-- ── STEG 2: Regeln. Körs när listan ovan är tom. ──

CREATE UNIQUE INDEX IF NOT EXISTS project_one_per_quote
  ON public.project (business_id, quote_id)
  WHERE quote_id IS NOT NULL;

-- Verifiering:
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'project' AND indexname = 'project_one_per_quote';
