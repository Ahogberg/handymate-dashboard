-- V11 Ersättningar (mil, traktamente, OB-tillägg)
-- Kör manuellt i Supabase SQL Editor
-- =============================================================================

-- 1. ALLOWANCE_TYPES — Ersättningstyper
-- =============================================================================
CREATE TABLE IF NOT EXISTS allowance_types (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,           -- 'mileage' | 'daily' | 'hourly' | 'fixed'
  rate NUMERIC NOT NULL,        -- belopp per enhet
  unit TEXT,                    -- 'km', 'dag', 'tim', 'st'
  is_taxable BOOLEAN DEFAULT true,
  billable_to_customer BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allowance_types_business ON allowance_types(business_id);

ALTER TABLE allowance_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allowance_types_all" ON allowance_types;
CREATE POLICY "allowance_types_all" ON allowance_types FOR ALL USING (true) WITH CHECK (true);

-- 2. ALLOWANCE_REPORTS — Rapporterade ersättningar
-- =============================================================================
CREATE TABLE IF NOT EXISTS allowance_reports (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL,
  business_user_id TEXT,
  allowance_type_id TEXT REFERENCES allowance_types(id),
  project_id TEXT,
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity NUMERIC NOT NULL,
  amount NUMERIC NOT NULL,       -- rate × quantity
  description TEXT,
  billable BOOLEAN DEFAULT false,
  invoiced BOOLEAN DEFAULT false,
  from_address TEXT,
  to_address TEXT,
  distance_km NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_allowance_reports_business ON allowance_reports(business_id, report_date);
CREATE INDEX IF NOT EXISTS idx_allowance_reports_project ON allowance_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_allowance_reports_user ON allowance_reports(business_user_id);

ALTER TABLE allowance_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "allowance_reports_all" ON allowance_reports;
CREATE POLICY "allowance_reports_all" ON allowance_reports FOR ALL USING (true) WITH CHECK (true);

-- 3. SEED-FUNKTION — Systemtyper vid onboarding
-- Anropas från API:et, inte direkt i SQL
-- Standardsatser (Skatteverket 2025):
--   Milersättning: 25 kr/km (skattefri gräns)
--   Traktamente Sverige: 290 kr/dag
--   OB Kväll (18-22): 50% påslag → beräknas per timpris
--   OB Natt (22-06): 70% påslag → beräknas per timpris
