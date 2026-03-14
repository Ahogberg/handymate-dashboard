-- ============================================================
-- V7 T2: Prissättningsintelligens
-- Historisk prisdata + jobbklassificering för smartare offerter.
-- Kör manuellt i Supabase SQL Editor
-- ============================================================

-- 1. Pricing intelligence — aggregerad prisdata per jobbtyp
CREATE TABLE IF NOT EXISTS pricing_intelligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  job_type TEXT NOT NULL,
  avg_price NUMERIC NOT NULL DEFAULT 0,
  min_price NUMERIC NOT NULL DEFAULT 0,
  max_price NUMERIC NOT NULL DEFAULT 0,
  median_price NUMERIC NOT NULL DEFAULT 0,
  total_quotes INTEGER NOT NULL DEFAULT 0,
  won_quotes INTEGER NOT NULL DEFAULT 0,
  lost_quotes INTEGER NOT NULL DEFAULT 0,
  win_rate NUMERIC,                    -- 0.0–1.0
  avg_margin NUMERIC,                  -- genomsnittlig marginal i %
  price_trend TEXT DEFAULT 'stable',   -- 'rising' | 'falling' | 'stable'
  last_analyzed_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(business_id, job_type)
);

CREATE INDEX IF NOT EXISTS idx_pricing_intel_business
  ON pricing_intelligence(business_id);

-- RLS
ALTER TABLE pricing_intelligence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pricing_intelligence_select" ON pricing_intelligence
  FOR SELECT USING (true);

CREATE POLICY "pricing_intelligence_insert" ON pricing_intelligence
  FOR INSERT WITH CHECK (true);

CREATE POLICY "pricing_intelligence_update" ON pricing_intelligence
  FOR UPDATE USING (true);

-- 2. Nya kolumner på quotes för jobbklassificering och utfall
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS job_type TEXT,
  ADD COLUMN IF NOT EXISTS outcome TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS outcome_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS outcome_reason TEXT;

-- Kommentar:
-- job_type: fritext, t.ex. 'badrumsrenovering', 'målning', 'elinstallation'
-- outcome: 'won' | 'lost' | null (null = ej avgjord)
-- outcome_at: tidpunkt för utfall
-- outcome_reason: fritext, varför kunden tackade nej (vid lost)
