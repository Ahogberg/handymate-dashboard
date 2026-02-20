-- Pilot Feedback Runda 2: Tasks + Deal Notes
-- Run in Supabase SQL Editor

-- Tasks - arbetsuppgifter kopplade till deals, kunder, projekt
CREATE TABLE IF NOT EXISTS task (
  id TEXT PRIMARY KEY DEFAULT 'task_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'done')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  due_date DATE,
  due_time TIME,
  assigned_to TEXT,
  customer_id TEXT,
  deal_id TEXT,
  project_id TEXT,
  completed_at TIMESTAMPTZ,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_task_business ON task(business_id);
CREATE INDEX IF NOT EXISTS idx_task_deal ON task(deal_id);
CREATE INDEX IF NOT EXISTS idx_task_customer ON task(customer_id);
CREATE INDEX IF NOT EXISTS idx_task_status ON task(business_id, status);

-- Deal notes - fria anteckningar på deals
CREATE TABLE IF NOT EXISTS deal_note (
  id TEXT PRIMARY KEY DEFAULT 'dnote_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  deal_id TEXT NOT NULL,
  content TEXT NOT NULL,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_note_deal ON deal_note(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_note_business ON deal_note(business_id);

-- RLS policies
ALTER TABLE task ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_note ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS task_business_policy ON task
  FOR ALL USING (business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
  ));

CREATE POLICY IF NOT EXISTS deal_note_business_policy ON deal_note
  FOR ALL USING (business_id IN (
    SELECT business_id FROM business_config WHERE user_id = auth.uid()
  ));
