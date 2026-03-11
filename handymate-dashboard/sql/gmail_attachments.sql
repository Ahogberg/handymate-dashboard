-- Gmail attachment tracking
-- Run after pilot_fixes.sql (creates customer_document)

ALTER TABLE customer_document
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'upload',
  ADD COLUMN IF NOT EXISTS lead_id TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT;  -- internal storage path for signed-URL generation

-- Index for looking up attachments by lead
CREATE INDEX IF NOT EXISTS idx_customer_document_lead ON customer_document(lead_id) WHERE lead_id IS NOT NULL;
