-- v195 — ÄTA-dokumentet: fryst momssats, foton på ÄTA, städade radnamn.
-- MANUELL migration (MCP efter "kör"). Innehåller en UPDATE (backfill av items).
--
-- VARFÖR: Etapp A-C bygger ett riktigt ÄTA-dokument (PDF, portalvy, foton). Det
-- kräver tre saker som schemat idag saknar:
--   1. project_change.vat_rate — momssatsen ska FRYSAS på ÄTA:n när den skapas
--      (från business_config.default_vat_rate, se sql/vat_rate.sql), inte räknas
--      om i efterhand. Ändras företagets momssats senare får gamla ÄTA:er ändå
--      rätt moms på sitt dokument — samma princip som offertens vat_rate.
--   2. project_document.change_id — ÄTA-foton lagras som project_document-rader
--      (bucket project-files, kategori 'ata') kopplade till en specifik ÄTA i
--      stället för bara till projektet.
--   3. Normalisering av project_change.items: rader sparade innan ÄTA-formuläret
--      krävde ett namn nycklades bara på `description`. UI:t som filtrerar på
--      `item.name` tappar då raden helt — totalen blir 0 fast raden har ett pris
--      (prod: biz_0lovw5vcwzqn har ÄTA med namnlösa rader). Backfillen ger dem
--      `name` (ur `description`, annars 'Arbete') och `unit` ('st') en gång.
--
-- Ingen `locked_at`-kolumn läggs till — låsning härleds ur status
-- (isAtaEditable i lib/ata/lifecycle.ts), precis som idag.

BEGIN;

-- 1. Momssatsen fryses per ÄTA vid skapande.
ALTER TABLE project_change ADD COLUMN IF NOT EXISTS vat_rate NUMERIC DEFAULT 25;

-- 2. ÄTA-foton = project_document-rader kopplade till en specifik ÄTA.
ALTER TABLE project_document ADD COLUMN IF NOT EXISTS change_id TEXT;

CREATE INDEX IF NOT EXISTS idx_project_document_change
  ON project_document(business_id, change_id)
  WHERE change_id IS NOT NULL;

-- 3. Backfill: rader utan `name` eller `unit` normaliseras en gång.
--    COALESCE gör satsen idempotent — kör den igen och redan normaliserade
--    rader får samma värde tillbaka, ingenting skrivs sönder.
UPDATE project_change pc
SET items = normaliserat.items
FROM (
  SELECT
    rad.change_id,
    jsonb_agg(
      rad.item
        || jsonb_build_object('name', COALESCE(rad.item->>'name', rad.item->>'description', 'Arbete'))
        || jsonb_build_object('unit', COALESCE(rad.item->>'unit', 'st'))
      ORDER BY rad.ord
    ) AS items
  FROM project_change src,
       jsonb_array_elements(src.items) WITH ORDINALITY AS rad(item, ord)
  WHERE src.items IS NOT NULL
    AND jsonb_typeof(src.items) = 'array'
    AND EXISTS (
      SELECT 1 FROM jsonb_array_elements(src.items) i2
      WHERE (i2->>'name') IS NULL OR (i2->>'unit') IS NULL
    )
  GROUP BY rad.change_id
) AS normaliserat
WHERE pc.change_id = normaliserat.change_id;

COMMIT;

-- ── Verifiering (kör manuellt efter migrationen) ─────────────────────────
--
-- Kolumnerna finns:
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'project_change' AND column_name = 'vat_rate'; -- 1 rad
-- SELECT column_name FROM information_schema.columns
--  WHERE table_name = 'project_document' AND column_name = 'change_id'; -- 1 rad
--
-- Ingen kvarvarande namnlös rad:
-- SELECT count(*) FROM project_change, jsonb_array_elements(items) i
--  WHERE items IS NOT NULL AND jsonb_typeof(items) = 'array' AND i->>'name' IS NULL; -- 0
-- SELECT count(*) FROM project_change, jsonb_array_elements(items) i
--  WHERE items IS NOT NULL AND jsonb_typeof(items) = 'array' AND i->>'unit' IS NULL; -- 0
--
-- Stickprov mot det drabbade kontot:
-- SELECT change_id, items FROM project_change WHERE business_id = 'biz_0lovw5vcwzqn';
