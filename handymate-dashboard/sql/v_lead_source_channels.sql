-- Egna lead-kanaler (manuella källor) — källa: "Var kom kunden ifrån?"
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE lead_sources
  ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'portal',
  ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#0F766E';

-- Befintliga rader är portaler med genererad portal_code/api_key
UPDATE lead_sources
  SET source_type = 'portal'
  WHERE source_type IS NULL;

-- Portalerna kräver unika portal_code/api_key (genererade via default).
-- Manuella kanaler får också default-värden, men de används aldrig.

CREATE INDEX IF NOT EXISTS idx_lead_sources_type
  ON lead_sources(business_id, source_type);
