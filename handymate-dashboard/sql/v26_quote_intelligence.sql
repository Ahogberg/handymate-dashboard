-- V26: Offert-intelligens — index för snabb matchning
-- Kör manuellt i Supabase SQL Editor

CREATE INDEX IF NOT EXISTS idx_quotes_accepted ON quotes(business_id, status)
  WHERE status = 'accepted';

CREATE INDEX IF NOT EXISTS idx_quotes_category ON quotes(business_id)
  WHERE status IN ('accepted', 'completed');

CREATE INDEX IF NOT EXISTS idx_time_entry_project ON time_entry(project_id)
  WHERE project_id IS NOT NULL;
