-- V24: Säkerställ att dokument-tabeller existerar
-- Kör manuellt i Supabase SQL Editor

-- customer_document
CREATE TABLE IF NOT EXISTS customer_document (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_size INTEGER,
  category TEXT DEFAULT 'other',
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_customer_document_customer ON customer_document(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_document_business ON customer_document(business_id);
ALTER TABLE customer_document ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_customer_document' AND tablename = 'customer_document') THEN
    CREATE POLICY service_customer_document ON customer_document FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- project_document
CREATE TABLE IF NOT EXISTS project_document (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id TEXT NOT NULL,
  business_id TEXT NOT NULL,
  name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  category TEXT DEFAULT 'other',
  uploaded_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_project_document_project ON project_document(project_id);
CREATE INDEX IF NOT EXISTS idx_project_document_business ON project_document(business_id);
ALTER TABLE project_document ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_project_document' AND tablename = 'project_document') THEN
    CREATE POLICY service_project_document ON project_document FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- OBS: Storage buckets (customer-documents, project-files) skapas
-- automatiskt via ensureBucket() i API-routerna.
-- Om du vill skapa dem manuellt: Supabase Dashboard → Storage → New bucket.
