-- ============================================================
-- V5: agent_context — tolkad företagsstatus
-- Uppdateras nattligen av Claude. Agenten läser detta
-- istället för att göra tunga queries live per samtal.
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS agent_context (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  generated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Tolkad status
  open_leads_count INTEGER DEFAULT 0,
  overdue_invoices_count INTEGER DEFAULT 0,
  todays_jobs JSONB DEFAULT '[]'::jsonb,
  pending_approvals_count INTEGER DEFAULT 0,

  -- Claudes analys
  business_health TEXT DEFAULT 'strong',
  key_insights JSONB DEFAULT '[]'::jsonb,
  recommended_priorities JSONB DEFAULT '[]'::jsonb,

  -- Metadata
  model_used TEXT,
  tokens_used INTEGER DEFAULT 0,

  UNIQUE(business_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_context_business ON agent_context(business_id);

-- RLS
ALTER TABLE agent_context ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_context_select" ON agent_context
  FOR SELECT USING (true);

CREATE POLICY "agent_context_insert" ON agent_context
  FOR INSERT WITH CHECK (true);

CREATE POLICY "agent_context_update" ON agent_context
  FOR UPDATE USING (true);
