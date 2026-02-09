-- Schedule entries table for resource planning
CREATE TABLE IF NOT EXISTS schedule_entry (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  business_user_id TEXT NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES project(project_id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  start_datetime TIMESTAMPTZ NOT NULL,
  end_datetime TIMESTAMPTZ NOT NULL,
  all_day BOOLEAN DEFAULT false,
  type TEXT NOT NULL DEFAULT 'project' CHECK (type IN ('project', 'internal', 'time_off', 'travel')),
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled')),
  color TEXT,
  created_by TEXT REFERENCES business_users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_schedule_entry_business ON schedule_entry(business_id);
CREATE INDEX idx_schedule_entry_user ON schedule_entry(business_user_id);
CREATE INDEX idx_schedule_entry_dates ON schedule_entry(start_datetime, end_datetime);
CREATE INDEX idx_schedule_entry_project ON schedule_entry(project_id);

-- Time off requests table
CREATE TABLE IF NOT EXISTS time_off_request (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  business_user_id TEXT NOT NULL REFERENCES business_users(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  type TEXT NOT NULL DEFAULT 'vacation' CHECK (type IN ('vacation', 'sick', 'parental', 'other')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  note TEXT,
  approved_by TEXT REFERENCES business_users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_time_off_request_business ON time_off_request(business_id);
CREATE INDEX idx_time_off_request_user ON time_off_request(business_user_id);
CREATE INDEX idx_time_off_request_dates ON time_off_request(start_date, end_date);

-- RLS policies
ALTER TABLE schedule_entry ENABLE ROW LEVEL SECURITY;
ALTER TABLE time_off_request ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access schedule_entry" ON schedule_entry
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access time_off_request" ON time_off_request
  FOR ALL USING (true) WITH CHECK (true);
