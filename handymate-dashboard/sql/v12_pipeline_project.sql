-- V12: Automatiskt projekt vid pipeline-stegbyte
-- Kör manuellt i Supabase SQL Editor

-- 1. Markera vilket pipeline-steg som skapar projekt
ALTER TABLE pipeline_stages
  ADD COLUMN IF NOT EXISTS creates_project BOOLEAN DEFAULT false;

-- Sätt active_job som default projekt-skapare
UPDATE pipeline_stages
  SET creates_project = true
  WHERE key = 'active_job';

-- 2. Nya kolumner på project för lead-koppling
ALTER TABLE project
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS source_lead_data JSONB;
-- quote_id finns redan från offert-skapande

-- Index för att snabbt kolla om lead redan har projekt
CREATE INDEX IF NOT EXISTS idx_project_lead_id ON project(lead_id) WHERE lead_id IS NOT NULL;
