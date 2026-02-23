-- Storefront: AI-genererad hemsida för hantverkare
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS storefront (
  id TEXT PRIMARY KEY DEFAULT 'sf_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL UNIQUE,
  slug TEXT UNIQUE,
  is_published BOOLEAN DEFAULT false,

  -- AI-genererat innehåll
  hero_headline TEXT,
  hero_description TEXT,
  about_text TEXT,
  hero_image_url TEXT,
  gallery_images JSONB DEFAULT '[]',
  color_scheme TEXT DEFAULT 'blue',
  service_descriptions JSONB DEFAULT '{}',

  -- SEO
  meta_title TEXT,
  meta_description TEXT,

  -- Statistik
  page_views INTEGER DEFAULT 0,
  contact_form_submissions INTEGER DEFAULT 0,

  -- Sektioner: vilka som visas och ordning
  sections JSONB DEFAULT '["hero","services","about","gallery","reviews","contact"]',

  -- Widget-koppling
  show_chat_widget BOOLEAN DEFAULT false,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for slug lookup
CREATE INDEX IF NOT EXISTS idx_storefront_slug ON storefront(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_storefront_business ON storefront(business_id);
