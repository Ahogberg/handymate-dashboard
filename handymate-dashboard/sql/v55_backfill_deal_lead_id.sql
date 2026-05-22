-- v55_backfill_deal_lead_id.sql
-- Etapp 5 av projekt-konsolidering (2026-05-22).
--
-- Bakgrund: audit-rapport 2026-05-20 flaggade "brytpunkt 1: deal.lead_id
-- saknas" som FK-gap mellan lead→deal. Vid verifiering 2026-05-22 visade
-- det sig att kolumnen redan finns sedan v37_golden_path.sql:
--
--   ALTER TABLE deal ADD COLUMN IF NOT EXISTS lead_id TEXT;
--   CREATE INDEX idx_deal_lead ON deal(lead_id) WHERE lead_id IS NOT NULL;
--
-- intake-routen (app/api/leads/intake/route.ts:189-198) sätter lead_id
-- vid Golden Path auto-deal-creation. Gap: widget-chat (website widget)
-- och manuell pipeline-skapande sätter inte lead_id — antingen för att
-- det inte finns en lead-rad (widget) eller för att det är manuellt
-- skapande utan lead-koppling (pipeline).
--
-- Detta backfill identifierar deals som SKULLE kunna ha lead_id satt
-- via customer_id-brygga eller quote_id-brygga, sedan andreas granskar.
--
-- DRY-RUN-disciplin (samma som Etapp 1 och Etapp 2.3):
--   1. Kör Del A (verifiering) — bekräfta att kolumnen finns
--   2. Kör Del B (per-deal dry-run) — granska mapping
--   3. Del C (UPDATE) kommenterad ut tills Andreas godkänner

-- ============================================================
-- DEL A — VERIFIERING (kör först)
-- ============================================================

-- A.1: bekräfta att deal.lead_id-kolumnen finns
SELECT
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'deal' AND column_name = 'lead_id';
-- Förväntat: 1 rad. Om 0 rader → kör v37_golden_path.sql först.

-- A.2: räkning per status
SELECT
  COUNT(*) AS total_deals,
  COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS med_lead_id,
  COUNT(*) FILTER (WHERE lead_id IS NULL) AS utan_lead_id,
  ROUND(100.0 * COUNT(*) FILTER (WHERE lead_id IS NOT NULL) / NULLIF(COUNT(*), 0), 1)
    AS pct_med_koppling
FROM deal;

-- A.3: aktuella deal-källor (sources) för deals utan lead_id
SELECT
  source,
  COUNT(*) AS antal,
  COUNT(*) FILTER (WHERE customer_id IS NOT NULL) AS har_customer,
  COUNT(*) FILTER (WHERE quote_id IS NOT NULL) AS har_quote
FROM deal
WHERE lead_id IS NULL
GROUP BY source
ORDER BY antal DESC;
-- Visar fördelning av deals utan lead_id per source-typ.
-- 'manual', 'website_widget', 'ai' etc — vilka är kandidater för backfill?

-- ============================================================
-- DEL B — PER-DEAL DRY-RUN (kör efter A)
-- ============================================================

WITH backfill_candidates AS (
  SELECT
    d.id AS deal_id,
    d.title,
    d.source,
    d.customer_id,
    d.quote_id,
    d.created_at,
    -- Källa 1: lead via customer_id (oftast 1:1 men kan vara 1:N)
    (SELECT lead_id FROM leads l
       WHERE l.business_id = d.business_id
         AND l.customer_id = d.customer_id
         AND d.customer_id IS NOT NULL
       ORDER BY l.created_at ASC
       LIMIT 1
    ) AS lead_via_customer,
    -- Källa 2: lead via quote_id (om quote har lead_id)
    (SELECT q.lead_id FROM quotes q
       WHERE q.quote_id = d.quote_id
         AND q.lead_id IS NOT NULL
       LIMIT 1
    ) AS lead_via_quote,
    -- Räkna hur många leads kunden har — om > 1 är customer-bryggan osäker
    (SELECT COUNT(*) FROM leads l
       WHERE l.business_id = d.business_id
         AND l.customer_id = d.customer_id
         AND d.customer_id IS NOT NULL
    ) AS antal_leads_pa_kunden
  FROM deal d
  WHERE d.lead_id IS NULL
)
SELECT
  deal_id,
  title,
  source,
  to_char(created_at, 'YYYY-MM-DD') AS skapad,
  customer_id,
  quote_id,
  -- Prioritet: quote-bryggan är säkrare (direkt-koppling) än customer-bryggan
  COALESCE(lead_via_quote, lead_via_customer) AS forslag_lead_id,
  CASE
    WHEN lead_via_quote IS NOT NULL THEN 'quote_bridge (säker)'
    WHEN lead_via_customer IS NOT NULL AND antal_leads_pa_kunden = 1 THEN 'customer_bridge_unique'
    WHEN lead_via_customer IS NOT NULL AND antal_leads_pa_kunden > 1 THEN 'customer_bridge_AMBIVALENT'
    ELSE 'no_match'
  END AS källa,
  antal_leads_pa_kunden
FROM backfill_candidates
ORDER BY created_at DESC NULLS LAST;

-- ============================================================
-- DEL C — UPDATE (avkommentera EFTER Andreas-godkännande)
-- ============================================================
--
-- VARNING: customer_bridge ger ambivalent resultat om kunden har flera
-- leads. Backfilla BARA via quote-bryggan + customer-bryggan när kunden
-- har exakt 1 lead. Andra fall: lämna NULL — manuell granskning krävs.
--
-- BEGIN;
--
-- -- Sub-steg 1: backfill via quote_id-bryggan (säker)
-- UPDATE deal d
-- SET lead_id = q.lead_id
-- FROM quotes q
-- WHERE d.quote_id = q.quote_id
--   AND d.lead_id IS NULL
--   AND q.lead_id IS NOT NULL;
--
-- -- Sub-steg 2: backfill via customer_id-bryggan (säker bara om unikt)
-- UPDATE deal d
-- SET lead_id = matched.lead_id
-- FROM (
--   SELECT
--     d2.id AS deal_id,
--     (SELECT lead_id FROM leads l
--        WHERE l.business_id = d2.business_id
--          AND l.customer_id = d2.customer_id
--        LIMIT 1
--     ) AS lead_id
--   FROM deal d2
--   WHERE d2.lead_id IS NULL
--     AND d2.customer_id IS NOT NULL
--     AND (
--       SELECT COUNT(*) FROM leads l
--         WHERE l.business_id = d2.business_id
--           AND l.customer_id = d2.customer_id
--     ) = 1
-- ) matched
-- WHERE d.id = matched.deal_id
--   AND matched.lead_id IS NOT NULL;
--
-- -- Verifiering före COMMIT
-- SELECT
--   COUNT(*) FILTER (WHERE lead_id IS NOT NULL) AS med_lead_id_efter,
--   COUNT(*) FILTER (WHERE lead_id IS NULL) AS utan_lead_id_efter
-- FROM deal;
--
-- -- Om allt ser bra ut:
-- COMMIT;
-- -- Annars:
-- -- ROLLBACK;

-- ============================================================
-- ANMÄRKNINGAR
-- ============================================================
--
-- 1. Widget-chat (app/api/widget/chat/route.ts:295) skapar deals
--    UTAN att skapa lead-rad i leads-tabellen. Dessa kommer alltid
--    sakna lead_id eftersom det inte finns en lead att referera till.
--    Loggat som TD-72.
--
-- 2. Manuella pipeline-deals (app/api/pipeline/deals/route.ts:328)
--    skapas typiskt utan lead-koppling. Det är OK — hantverkare lägger
--    in deals direkt utan att de kom från en specifik lead.
--
-- 3. Daniel/Hanna lead-källa-analys: kommer i framtida agent-arbete.
--    Idag läser de redan från leads-tabellen direkt; backfilen
--    möjliggör senare per-deal-aggregation.
