-- ═══════════════════════════════════════════════════════════════════════════
-- v102 — Mötesassistenten: source-kolumn på call_recording
-- (2026-08-09, etapp 3 i planen "Inkorgen och samtalsvägen")
--
-- KÖRS MANUELLT av Andreas i Supabase SQL Editor.
--
-- Mötesassistenten återanvänder call_recording (alla telefonikolumner är
-- nullable) för platsbesökstranskript. Utan kolumnen renderas ett möte som
-- ett samtal utan nummer — omöjligt att skilja från trasig telefonidata.
--
--   'phone'      inkommande/utgående samtal via 46elks (default, all historik)
--   'site_visit' mötesassistenten — hantverkaren spelade in ett platsbesök.
--                INGET ljud sparas för dessa: recording_url är alltid NULL,
--                bara transkriptet finns. Medvetet beslut (2026-08-09).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.call_recording
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'phone';

-- Villkoret läggs separat och idempotent — ADD CONSTRAINT saknar IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'call_recording_source_check'
  ) THEN
    ALTER TABLE public.call_recording
      ADD CONSTRAINT call_recording_source_check
      CHECK (source IN ('phone', 'site_visit'));
  END IF;
END
$$;

-- Mötesfliken listar per företag och källa, nyast först.
CREATE INDEX IF NOT EXISTS idx_call_recording_business_source
  ON public.call_recording (business_id, source, created_at DESC);

-- Verifiering:
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'call_recording' AND column_name = 'source';
