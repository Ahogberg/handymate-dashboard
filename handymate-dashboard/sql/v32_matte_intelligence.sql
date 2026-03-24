-- V32: Matte Konversationsintelligens
-- Kör manuellt i Supabase SQL Editor

-- Tidslinje-händelser per projekt/bokning
CREATE TABLE IF NOT EXISTS project_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  created_by TEXT DEFAULT 'matte',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_project_events_project
  ON project_events(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_project_events_business
  ON project_events(business_id, created_at DESC);

ALTER TABLE project_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service project_events" ON project_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "User project_events" ON project_events FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);

-- Utöka automation_logs för Matte
ALTER TABLE v3_automation_logs
  ADD COLUMN IF NOT EXISTS channel TEXT;

-- Index för snabb entitetsuppslagning i resolver
CREATE INDEX IF NOT EXISTS idx_leads_phone_business
  ON leads(phone, business_id) WHERE phone IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_phone_business
  ON customer(phone_number, business_id) WHERE phone_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_customer_email_business
  ON customer(email, business_id) WHERE email IS NOT NULL;

NOTIFY pgrst, 'reload schema';
