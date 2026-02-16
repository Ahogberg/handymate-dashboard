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

-- Bankinfo kolumner (om de saknas)
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS bankgiro TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS plusgiro TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- ============================================
-- Seed: Demo-mall "Badrumsrenovering komplett"
-- Kör denna per business_id, eller hoppa över om du vill skapa manuellt.
-- Byt ut 'YOUR_BUSINESS_ID' mot faktiskt business_id.
-- ============================================
-- INSERT INTO job_template (business_id, name, description, category, rot_rut_type, is_favorite, items, terms, estimated_hours, labor_cost, total_estimate) VALUES (
--   'YOUR_BUSINESS_ID',
--   'Badrumsrenovering komplett',
--   'Komplett badrumsrenovering inkl. rivning, tätskikt, plattsättning, VVS och inredning.',
--   'Badrum',
--   'rot',
--   true,
--   '[
--     {"id":"demo_1","type":"labor","name":"Rivning befintligt badrum","quantity":8,"unit":"hour","unit_price":650,"total":5200},
--     {"id":"demo_2","type":"labor","name":"Tätskikt och plattsättning","quantity":24,"unit":"hour","unit_price":650,"total":15600},
--     {"id":"demo_3","type":"labor","name":"VVS-installation","quantity":8,"unit":"hour","unit_price":750,"total":6000},
--     {"id":"demo_4","type":"labor","name":"Slutstädning","quantity":2,"unit":"hour","unit_price":650,"total":1300},
--     {"id":"demo_5","type":"material","name":"Kakel 20x60 vit blank","quantity":12,"unit":"m2","unit_price":395,"total":4740},
--     {"id":"demo_6","type":"material","name":"Klinkerplattor 30x30","quantity":5,"unit":"m2","unit_price":495,"total":2475},
--     {"id":"demo_7","type":"material","name":"Tätskiktssystem komplett","quantity":1,"unit":"piece","unit_price":2800,"total":2800},
--     {"id":"demo_8","type":"material","name":"Duschvägg 90x200 cm","quantity":1,"unit":"piece","unit_price":4500,"total":4500},
--     {"id":"demo_9","type":"material","name":"WC Gustavsberg Nautic","quantity":1,"unit":"piece","unit_price":3200,"total":3200},
--     {"id":"demo_10","type":"material","name":"Tvättställ med blandare","quantity":1,"unit":"piece","unit_price":2800,"total":2800},
--     {"id":"demo_11","type":"material","name":"Småmaterial","quantity":1,"unit":"piece","unit_price":800,"total":800}
--   ]'::jsonb,
--   '{"payment_terms":30,"warranty_years":2,"free_text":"Priset inkluderar moms. Eventuella tilläggsarbeten debiteras separat."}'::jsonb,
--   42,
--   28100,
--   49415
-- );
