-- ============================================================
-- V4: Seed 8 systemsteg per företag i pipeline_stages
-- Run in Supabase SQL Editor AFTER v4_pipeline_stages.sql
-- ============================================================

CREATE OR REPLACE FUNCTION seed_v4_pipeline_stages(p_business_id TEXT)
RETURNS void AS $$
BEGIN
  INSERT INTO pipeline_stages (business_id, key, label, sort_order, is_system, color)
  VALUES
    (p_business_id, 'new_lead',      'Ny lead',          1,  true, '#8B5CF6'),
    (p_business_id, 'contacted',     'Kontaktad',        2,  true, '#3B82F6'),
    (p_business_id, 'quote_sent',    'Offert skickad',   3,  true, '#F59E0B'),
    (p_business_id, 'quote_opened',  'Offert öppnad',    4,  true, '#F97316'),
    (p_business_id, 'active_job',    'Aktivt jobb',      5,  true, '#0F766E'),
    (p_business_id, 'invoiced',      'Fakturerad',       6,  true, '#6366F1'),
    (p_business_id, 'completed',     'Avslutad',         7,  true, '#22C55E'),
    (p_business_id, 'lost',          'Förlorad',         99, true, '#EF4444')
  ON CONFLICT (business_id, key) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Seed för alla befintliga företag
SELECT seed_v4_pipeline_stages(business_id) FROM business_config;

-- Migrera befintliga leads som har status men saknar pipeline_stage_key
-- Mappa gamla status-värden till nya pipeline_stage_key
UPDATE leads SET pipeline_stage_key = 'new_lead'    WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'new';
UPDATE leads SET pipeline_stage_key = 'contacted'   WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'contacted';
UPDATE leads SET pipeline_stage_key = 'quote_sent'  WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'quote_sent';
UPDATE leads SET pipeline_stage_key = 'quote_sent'  WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'qualified';
UPDATE leads SET pipeline_stage_key = 'completed'   WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'won';
UPDATE leads SET pipeline_stage_key = 'lost'        WHERE (pipeline_stage_key IS NULL OR pipeline_stage_key = '') AND status = 'lost';
