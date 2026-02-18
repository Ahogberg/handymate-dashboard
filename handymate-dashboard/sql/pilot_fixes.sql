-- ============================================
-- Pilot Fixes: Missing columns and new features
-- Run in Supabase SQL Editor
-- ============================================

-- ==========================================
-- FIX 1: Quotes - ROT/RUT columns (from rot_rut_documents.sql)
-- ==========================================
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS personnummer TEXT;
ALTER TABLE quotes ADD COLUMN IF NOT EXISTS fastighetsbeteckning TEXT;

-- Invoice ROT/RUT
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS personnummer TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS fastighetsbeteckning TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_rut_status TEXT DEFAULT 'pending';

-- Customer personal data
ALTER TABLE customer ADD COLUMN IF NOT EXISTS personal_number TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS property_designation TEXT;

-- ==========================================
-- FIX 2: Customer types + company fields
-- ==========================================
ALTER TABLE customer ADD COLUMN IF NOT EXISTS customer_type TEXT DEFAULT 'private';
ALTER TABLE customer ADD COLUMN IF NOT EXISTS org_number TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS contact_person TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS invoice_address TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS visit_address TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS reference TEXT;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS apartment_count INTEGER;

-- ==========================================
-- FIX 3: Customer documents
-- ==========================================
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

-- Drop + recreate policy (PostgreSQL doesn't support IF NOT EXISTS for policies)
DROP POLICY IF EXISTS customer_document_policy ON customer_document;
CREATE POLICY customer_document_policy ON customer_document
  FOR ALL USING (true) WITH CHECK (true);

-- ==========================================
-- FIX 4: Pipeline stages - allow custom stages
-- ==========================================
-- Update is_system to false for non-terminal stages (allow editing)
UPDATE pipeline_stage SET is_system = false WHERE slug NOT IN ('won', 'lost');

-- ==========================================
-- Storage bucket for customer documents
-- ==========================================
-- Run in Supabase Dashboard > Storage:
-- Create bucket: "customer-documents" (public: false)
-- Policy: Allow authenticated users to upload/read/delete
