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

-- project_document — lägg till saknade kolumner om tabellen redan finns
ALTER TABLE project_document
  ADD COLUMN IF NOT EXISTS project_id TEXT,
  ADD COLUMN IF NOT EXISTS business_id TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS uploaded_by TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

-- Index (kolla att kolumnen finns innan vi skapar index)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_document' AND column_name = 'project_id') THEN
    CREATE INDEX IF NOT EXISTS idx_project_document_project ON project_document(project_id);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'project_document' AND column_name = 'business_id') THEN
    CREATE INDEX IF NOT EXISTS idx_project_document_business ON project_document(business_id);
  END IF;
END $$;

ALTER TABLE project_document ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_project_document' AND tablename = 'project_document') THEN
    CREATE POLICY service_project_document ON project_document FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- OBS: Storage buckets (customer-documents, project-files) skapas
-- automatiskt via ensureBucket() i API-routerna.
-- Om du vill skapa dem manuellt: Supabase Dashboard → Storage → New bucket.
