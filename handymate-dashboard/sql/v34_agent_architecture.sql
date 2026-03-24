-- V34: Agent-arkitektur + Morning Brief
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE pending_approvals
  ADD COLUMN IF NOT EXISTS routed_agent TEXT,
  ADD COLUMN IF NOT EXISTS routed_by TEXT DEFAULT 'matte';

CREATE INDEX IF NOT EXISTS idx_invoice_overdue
  ON invoice(business_id, status, due_date) WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_quotes_stale
  ON quotes(business_id, status, created_at) WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_leads_active
  ON leads(business_id, status, score) WHERE status NOT IN ('won', 'lost', 'completed');

NOTIFY pgrst, 'reload schema';
