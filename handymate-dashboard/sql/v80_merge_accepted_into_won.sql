-- V80: Slå ihop "Offert accepterad" (quote_accepted / offert_accepterad) in i "Vunnen" (won)
-- Kör manuellt i Supabase SQL Editor — kör HELA blocket som en query.
--
-- ⚠️ KÖRORDNING (uppdaterad — kod-sweepen är nu genomförd och redo att
-- deployas tillsammans med denna fil):
--   1. Deploya kod-ändringarna FÖRST (committas separat av Andreas):
--      lib/pipeline/stages.ts, lib/pipeline.ts (DEFAULT_STAGES),
--      lib/pipeline/automations.ts (handleQuoteAccepted borttagen — ersatt av
--      WonModal), lib/pipeline-ai.ts, lib/demo/seed-demo-account.ts,
--      lib/cash-radar.ts + lib/cash-radar-data.ts, app/api/quotes/accept,
--      app/api/quotes/public/[token], app/api/invoices/send,
--      app/api/invoices/[id]/send-via-fortnox, app/api/projects/route.ts,
--      app/dashboard/settings/page.tsx.
--   2. Kör DENNA migration EFTER deploy. Om den körs innan kod-deployen är
--      klar kommer de ~7 kvarvarande moveDeal({ toStageSlug: 'quote_accepted' })-
--      anropen att kasta "Stage 'quote_accepted' not found" så fort steget
--      är borttaget här.
--
-- Idempotent / no-op-säker: businesses som redan saknar quote_accepted/
-- offert_accepterad (t.ex. skapade efter kod-deployen i steg 1, eller som
-- redan migrerats en gång) berörs inte av UPDATE/DELETE-satserna nedan —
-- WHERE-villkoren matchar då helt enkelt noll rader. Filen kan köras säkert
-- flera gånger.
--
-- Bakgrund: v27/v28 seedade historiskt både svenska ('offert_accepterad')
-- och engelska ('quote_accepted') slugs beroende på seed-version. v28 (som
-- lib/pipeline/stages.ts och lib/pipeline.ts DEFAULT_STAGES redan speglar)
-- migrerade i sin tid alla 'offert_accepterad'-deals till 'quote_accepted'
-- och tog bort de gamla raderna — så i normalfallet ska bara 'quote_accepted'
-- finnas kvar i prod. Migrationen hanterar ändå båda slug-varianterna
-- defensivt, ifall någon business av någon anledning missade v28.

-- ═══════════════════════════════════════════════════════════════════════
-- 0. FÖRHANDSGRANSKNING — kör och läs igenom INNAN du kör resten av filen
-- ═══════════════════════════════════════════════════════════════════════

-- 0a. Hur många accepterad-steg finns, och hur många deals står i dem?
SELECT
  ps.business_id,
  ps.id AS stage_id,
  ps.slug,
  ps.name,
  COUNT(d.id) AS deals_in_stage
FROM pipeline_stage ps
LEFT JOIN deal d ON d.stage_id = ps.id
WHERE ps.slug IN ('quote_accepted', 'offert_accepterad')
GROUP BY ps.business_id, ps.id, ps.slug, ps.name
ORDER BY ps.business_id;

-- 0b. Finns det businesses med ett accepterad-steg men INGET won-steg?
--     (skulle blockera migreringen av just de dealsen — utred manuellt om
--     denna lista inte är tom)
SELECT DISTINCT ps.business_id
FROM pipeline_stage ps
WHERE ps.slug IN ('quote_accepted', 'offert_accepterad')
AND NOT EXISTS (
  SELECT 1 FROM pipeline_stage w
  WHERE w.business_id = ps.business_id AND w.is_won = true
);

-- ═══════════════════════════════════════════════════════════════════════
-- 1. Flytta alla deals som står i ett accepterad-steg till business-ägarens
--    vunnen-steg (identifierat via is_won=true, inte hårdkodad slug — vissa
--    businesses kan i teorin ha döpt om 'won'-steget via Stage Settings).
--    Sätter won_at/closed_at precis som moveDeal() gör vid en vanlig flytt.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE deal
SET
  stage_id = won.id,
  won_at = COALESCE(deal.won_at, now()),
  closed_at = COALESCE(deal.closed_at, now()),
  stage_updated_at = now()
FROM pipeline_stage accepted
JOIN pipeline_stage won
  ON won.business_id = accepted.business_id AND won.is_won = true
WHERE deal.stage_id = accepted.id
AND accepted.slug IN ('quote_accepted', 'offert_accepterad')
AND accepted.business_id = deal.business_id;

-- ═══════════════════════════════════════════════════════════════════════
-- 2. pipeline_activity — historikrader ska behållas (de är facts om vad som
--    hände), men FK:erna till stegen vi tar bort i steg 3 måste nollas
--    (samma mönster som v28 använde). Bara from_stage_id/to_stage_id på
--    RADER SOM PEKAR PÅ DE SPECIFIKA ACCEPTERAD-STEGEN nollas — övriga
--    aktivitetsraders FK-kopplingar rörs inte.
-- ═══════════════════════════════════════════════════════════════════════

UPDATE pipeline_activity pa
SET from_stage_id = NULL
FROM pipeline_stage ps
WHERE pa.from_stage_id = ps.id
AND ps.slug IN ('quote_accepted', 'offert_accepterad');

UPDATE pipeline_activity pa
SET to_stage_id = NULL
FROM pipeline_stage ps
WHERE pa.to_stage_id = ps.id
AND ps.slug IN ('quote_accepted', 'offert_accepterad');

-- ═══════════════════════════════════════════════════════════════════════
-- 3. Ta bort accepterad-steget per business. Vid det här laget ska INGEN
--    deal längre peka på dessa rader (steg 1) och INGEN pipeline_activity
--    referera dem (steg 2) — DELETE:en är annars blockerad av FK-constraints
--    (deal.stage_id NOT NULL REFERENCES pipeline_stage(id)), vilket är en
--    avsiktlig säkerhetsspärr: om denna DELETE failar med en FK-violation
--    betyder det att steg 1 missade något — utred INNAN du tvingar igenom.
-- ═══════════════════════════════════════════════════════════════════════

DELETE FROM pipeline_stage
WHERE slug IN ('quote_accepted', 'offert_accepterad');

-- ═══════════════════════════════════════════════════════════════════════
-- 4. VERIFIERING — alla tre queries ska returnera 0 rader
-- ═══════════════════════════════════════════════════════════════════════

-- 4a. Inga accepterad-steg kvar
SELECT * FROM pipeline_stage WHERE slug IN ('quote_accepted', 'offert_accepterad');

-- 4b. Inga deals kvar som pekar på ett numera obefintligt stage_id
SELECT d.id, d.business_id, d.stage_id
FROM deal d
LEFT JOIN pipeline_stage ps ON ps.id = d.stage_id
WHERE ps.id IS NULL;

-- 4c. Ingen pipeline_activity-rad refererar ett numera obefintligt stage_id
SELECT pa.id, pa.business_id, pa.from_stage_id, pa.to_stage_id
FROM pipeline_activity pa
WHERE (pa.from_stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pipeline_stage ps WHERE ps.id = pa.from_stage_id))
   OR (pa.to_stage_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM pipeline_stage ps WHERE ps.id = pa.to_stage_id));

NOTIFY pgrst, 'reload schema';
