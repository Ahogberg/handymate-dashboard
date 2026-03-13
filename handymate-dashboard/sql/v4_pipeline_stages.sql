-- ============================================================
-- V4: Pipeline Stages — Leads-pipeline med 8 systemsteg
-- Run in Supabase SQL Editor
-- ============================================================

-- 1. Ny tabell: pipeline_stages (för leads-tratten)
-- OBS: Separat från pipeline_stage (som är för deals/affärer)
CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  key TEXT NOT NULL,              -- systeminternt, ändras aldrig (t.ex. 'new_lead')
  label TEXT NOT NULL,            -- visas i UI, kan bytas av hantverkaren
  sort_order INTEGER NOT NULL,
  is_system BOOLEAN DEFAULT true, -- systemsteg kan inte raderas
  color TEXT DEFAULT '#6B7280',   -- hex-färg för Kanban-kolumnen
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(business_id, key)
);

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_business ON pipeline_stages(business_id);
CREATE INDEX IF NOT EXISTS idx_pipeline_stages_key ON pipeline_stages(business_id, key);

-- RLS
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access pipeline_stages" ON pipeline_stages FOR ALL USING (true) WITH CHECK (true);

-- 2. Lägg till pipeline_stage_key på leads-tabellen
-- Automationer skriver alltid till pipeline_stage_key, aldrig till fritext-status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'leads' AND column_name = 'pipeline_stage_key'
  ) THEN
    ALTER TABLE leads ADD COLUMN pipeline_stage_key TEXT DEFAULT 'new_lead';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_pipeline_stage ON leads(pipeline_stage_key);
