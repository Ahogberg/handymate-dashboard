-- v10_vehicles.sql
-- Fordonshantering och körrapporter
-- Kör manuellt i Supabase SQL Editor

-- ===== Fordon =====
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  name TEXT NOT NULL,               -- "Volvo V70", "Servicebilen"
  reg_number TEXT,                  -- "ABC123"
  billing_type TEXT DEFAULT 'km',   -- 'km' | 'mil' | 'hour' | 'day'
  rate NUMERIC(10,2) NOT NULL DEFAULT 0, -- pris per enhet
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_vehicles_business ON vehicles(business_id);

-- ===== Körrapporter =====
CREATE TABLE IF NOT EXISTS vehicle_reports (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  vehicle_id TEXT REFERENCES vehicles(id),
  project_id TEXT REFERENCES project(project_id),
  lead_id TEXT REFERENCES leads(lead_id),
  business_user_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  report_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Körsträcka
  start_address TEXT,
  end_address TEXT,
  distance NUMERIC(10,1),           -- km eller mil
  distance_unit TEXT DEFAULT 'km',
  google_maps_url TEXT,             -- sparad Maps-länk

  -- Alternativt: tid eller dag
  hours NUMERIC(10,2),
  days NUMERIC(10,2),

  -- Beräknat
  amount NUMERIC(10,2),             -- rate × distance/hours/days
  billable BOOLEAN DEFAULT true,
  invoiced BOOLEAN DEFAULT false,

  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_vehicle_reports_business ON vehicle_reports(business_id, report_date);
CREATE INDEX IF NOT EXISTS idx_vehicle_reports_project ON vehicle_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_vehicle_reports_vehicle ON vehicle_reports(vehicle_id);

-- RLS
ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY vehicles_policy ON vehicles
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY vehicle_reports_policy ON vehicle_reports
  FOR ALL USING (true) WITH CHECK (true);
