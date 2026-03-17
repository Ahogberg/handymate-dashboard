-- V17: Fältrapporter med kundsignering
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS field_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  project_id TEXT,
  customer_id TEXT,
  title TEXT NOT NULL,
  description TEXT,
  work_performed TEXT,
  materials_used TEXT,
  report_number TEXT,
  status TEXT DEFAULT 'draft',
  -- 'draft' | 'sent' | 'signed' | 'rejected'
  signed_at TIMESTAMPTZ,
  signed_by TEXT,
  signature_token TEXT UNIQUE DEFAULT 'fr-' || replace(gen_random_uuid()::text, '-', ''),
  customer_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS field_report_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES field_reports(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  type TEXT DEFAULT 'after',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_field_reports_business ON field_reports(business_id);
CREATE INDEX IF NOT EXISTS idx_field_reports_token ON field_reports(signature_token);
CREATE INDEX IF NOT EXISTS idx_field_reports_project ON field_reports(project_id);
CREATE INDEX IF NOT EXISTS idx_field_report_photos_report ON field_report_photos(report_id);

ALTER TABLE field_reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_report_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service field_reports" ON field_reports FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service field_report_photos" ON field_report_photos FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "User field_reports" ON field_reports FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User field_report_photos" ON field_report_photos FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
