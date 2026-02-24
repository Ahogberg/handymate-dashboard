-- ============================================================
-- Tidrapportering Overhaul
-- GPS check-in/out, reseersättning, traktamente, löneunderlag
-- ============================================================

-- ===========================
-- 1. time_entry – nya kolumner
-- ===========================

-- GPS check-in/check-out (timestamptz)
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_in_time TIMESTAMPTZ;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_out_time TIMESTAMPTZ;

-- GPS-koordinater (check-in)
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_in_lat NUMERIC(10,7);
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_in_lng NUMERIC(10,7);
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_in_address TEXT;

-- GPS-koordinater (check-out)
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_out_lat NUMERIC(10,7);
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_out_lng NUMERIC(10,7);
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS check_out_address TEXT;

-- Övertid
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS overtime_minutes INTEGER DEFAULT 0;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS overtime_type TEXT CHECK (overtime_type IN ('ob1', 'ob2', 'overtime_50', 'overtime_100'));
-- ob1 = OB-tillägg kväll/helg
-- ob2 = OB-tillägg natt/storhelg
-- overtime_50 = övertid +50%
-- overtime_100 = övertid +100%

-- Intern lönekostnad
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS cost_rate NUMERIC(10,2);

-- Arbetstyp-enum (komplement till work_type FK)
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS work_category TEXT DEFAULT 'work' CHECK (work_category IN ('work', 'travel', 'material_pickup', 'meeting', 'admin'));
-- work = arbete
-- travel = restid
-- material_pickup = materialhämtning
-- meeting = möte
-- admin = administration

-- ===========================
-- 2. travel_entry – reseersättning
-- ===========================

CREATE TABLE IF NOT EXISTS travel_entry (
  id TEXT PRIMARY KEY DEFAULT 'trv_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  business_user_id TEXT,
  time_entry_id TEXT,
  project_id TEXT,
  customer_id TEXT,
  date DATE NOT NULL,

  -- Resa
  from_address TEXT,
  to_address TEXT,
  distance_km NUMERIC(10,1),
  vehicle_type TEXT DEFAULT 'car' CHECK (vehicle_type IN ('car', 'company_car', 'public_transport', 'bicycle')),
  mileage_rate NUMERIC(10,2) DEFAULT 25.0, -- Skatteverket 2024: 25 kr/km egen bil
  total_amount NUMERIC(10,2),

  -- Traktamente
  has_overnight BOOLEAN DEFAULT false,
  meals_provided TEXT DEFAULT 'none' CHECK (meals_provided IN ('none', 'breakfast', 'lunch', 'dinner', 'full')),
  allowance_amount NUMERIC(10,2) DEFAULT 0,

  description TEXT,
  approved BOOLEAN DEFAULT false,
  invoiced BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_travel_entry_business ON travel_entry(business_id);
CREATE INDEX IF NOT EXISTS idx_travel_entry_user ON travel_entry(business_user_id);
CREATE INDEX IF NOT EXISTS idx_travel_entry_date ON travel_entry(date);

-- ===========================
-- 3. business_users – löneinställningar
-- ===========================

ALTER TABLE business_users ADD COLUMN IF NOT EXISTS hourly_wage NUMERIC(10,2);
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS employment_type TEXT DEFAULT 'employee' CHECK (employment_type IN ('owner', 'employee', 'contractor'));
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS ob1_rate NUMERIC(5,2) DEFAULT 1.3;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS ob2_rate NUMERIC(5,2) DEFAULT 1.7;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS overtime_50_rate NUMERIC(5,2) DEFAULT 1.5;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS overtime_100_rate NUMERIC(5,2) DEFAULT 2.0;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS vacation_days_total INTEGER DEFAULT 25;
ALTER TABLE business_users ADD COLUMN IF NOT EXISTS vacation_days_used INTEGER DEFAULT 0;

-- ===========================
-- 4. business_config – tidrapportinställningar
-- ===========================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS time_rounding TEXT DEFAULT 'none' CHECK (time_rounding IN ('none', '15min', '30min'));
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS require_gps_checkin BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS require_project BOOLEAN DEFAULT true;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS standard_work_hours NUMERIC(4,1) DEFAULT 8.0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS overtime_after NUMERIC(4,1) DEFAULT 8.0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS break_after_hours NUMERIC(4,1) DEFAULT 5.0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_break_minutes INTEGER DEFAULT 30;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS mileage_rate NUMERIC(10,2) DEFAULT 25.0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS allowance_full_day NUMERIC(10,2) DEFAULT 290.0;  -- Skatteverket 2024
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS allowance_half_day NUMERIC(10,2) DEFAULT 145.0;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS ob1_rate NUMERIC(5,2) DEFAULT 1.3;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS ob2_rate NUMERIC(5,2) DEFAULT 1.7;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS overtime_50_rate NUMERIC(5,2) DEFAULT 1.5;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS overtime_100_rate NUMERIC(5,2) DEFAULT 2.0;

-- ===========================
-- 5. Indexes
-- ===========================

CREATE INDEX IF NOT EXISTS idx_time_entry_check_in ON time_entry(check_in_time) WHERE check_in_time IS NOT NULL AND check_out_time IS NULL;
CREATE INDEX IF NOT EXISTS idx_time_entry_work_category ON time_entry(work_category);
