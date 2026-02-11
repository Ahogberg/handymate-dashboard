-- Job Templates table
CREATE TABLE IF NOT EXISTS job_template (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  branch TEXT,
  estimated_hours NUMERIC,
  labor_cost NUMERIC,
  materials JSONB DEFAULT '[]',
  total_estimate NUMERIC,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_job_template_business ON job_template(business_id);
CREATE INDEX IF NOT EXISTS idx_job_template_branch ON job_template(branch);

-- Add AI columns to quotes table
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ai_generated BOOLEAN DEFAULT false;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS ai_confidence NUMERIC;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_image_url TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS source_transcript TEXT;
