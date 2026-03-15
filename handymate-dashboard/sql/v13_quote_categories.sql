-- v13: Produktkategorier för offertrader
-- Kör manuellt i Supabase SQL Editor

-- Fasta systemkategorier
CREATE TABLE IF NOT EXISTS quote_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  rot_eligible BOOLEAN DEFAULT false,
  rut_eligible BOOLEAN DEFAULT false,
  is_system BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0
);

-- Seed systemkategorier
INSERT INTO quote_categories (slug, label, rot_eligible, rut_eligible, sort_order) VALUES
  ('arbete_el',      'Arbete — El',             true,  false, 1),
  ('arbete_vvs',     'Arbete — VVS',            true,  false, 2),
  ('arbete_bygg',    'Arbete — Bygg',           true,  false, 3),
  ('arbete_maleri',  'Arbete — Måleri',          true,  false, 4),
  ('arbete_rut',     'Arbete — RUT',             false, true,  5),
  ('material_el',    'Material — El',            false, false, 6),
  ('material_vvs',   'Material — VVS',           false, false, 7),
  ('material_bygg',  'Material — Bygg',          false, false, 8),
  ('hyra',           'Hyra / Maskin',             false, false, 9),
  ('ue',             'Underentreprenör',          false, false, 10),
  ('resa',           'Resekostnad',               false, false, 11),
  ('ovrigt',         'Övrigt',                    false, false, 12)
ON CONFLICT (slug) DO NOTHING;

-- Egna kategorier per företag
CREATE TABLE IF NOT EXISTS custom_quote_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  slug TEXT NOT NULL,
  label TEXT NOT NULL,
  rot_eligible BOOLEAN DEFAULT false,
  rut_eligible BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, slug)
);

-- Kategori per offertrad
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS category_slug TEXT;
