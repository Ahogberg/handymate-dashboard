-- Quote enhancements: numbering, terms, images, templates
-- Run in Supabase SQL Editor

-- Nya kolumner på quotes
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS quote_number TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS terms JSONB DEFAULT '{}';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS images JSONB DEFAULT '[]';
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS duplicated_from TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS template_id TEXT;
CREATE INDEX IF NOT EXISTS idx_quotes_updated_at ON quotes(updated_at);

-- Utöka job_template för rika mallar
ALTER TABLE job_template ADD COLUMN IF NOT EXISTS items JSONB DEFAULT '[]';
ALTER TABLE job_template ADD COLUMN IF NOT EXISTS rot_rut_type TEXT;
ALTER TABLE job_template ADD COLUMN IF NOT EXISTS terms JSONB DEFAULT '{}';
ALTER TABLE job_template ADD COLUMN IF NOT EXISTS is_favorite BOOLEAN DEFAULT false;
ALTER TABLE job_template ADD COLUMN IF NOT EXISTS category TEXT;

-- Accent color och default-villkor per företag
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#0891b2';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_quote_terms JSONB DEFAULT '{}';
