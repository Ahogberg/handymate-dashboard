-- V10: Offert-förbättringar — per-rad ROT/RUT + versionering
-- Kör manuellt i Supabase SQL Editor

-- 1. Per-rad ROT/RUT-typ (komplement till befintliga is_rot/rut_eligible booleans)
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS rot_rut_type TEXT DEFAULT NULL;
  -- NULL = ingen avdrag, 'rot' = ROT 30%, 'rut' = RUT 50%
  -- Synkas med is_rot_eligible/is_rut_eligible för bakåtkompatibilitet

-- 2. Offert-versionering
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_quote_id TEXT,
  ADD COLUMN IF NOT EXISTS version_label TEXT;
  -- ex: "Version 1", "Med uppgradering", "Exkl. material"

-- Index för versionsgruppering
CREATE INDEX IF NOT EXISTS idx_quotes_parent ON quotes(parent_quote_id);
