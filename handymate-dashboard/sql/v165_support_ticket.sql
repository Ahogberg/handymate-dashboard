-- v165: Support-agentens spardningsrad. Konversationen ligger redan i
-- agent_threads/thread_message — den har tabellen ar bara en lattvikts-
-- ko-rad ovanpa, for /admin-vyn och notiser.
--
-- KORS MANUELLT i Supabase SQL Editor.

BEGIN;

CREATE TABLE public.support_ticket (
  id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  thread_id TEXT NOT NULL REFERENCES public.agent_threads(id) ON DELETE CASCADE,
  category TEXT NOT NULL
    CHECK (category IN ('cancellation', 'refund', 'gdpr', 'bug_financial', 'human_requested', 'other')),
  status TEXT NOT NULL DEFAULT 'escalated'
    CHECK (status IN ('escalated', 'in_progress', 'resolved')),
  escalated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  satisfaction TEXT CHECK (satisfaction IN ('positive', 'negative')),
  resolved_by TEXT,

  CONSTRAINT support_ticket_resolved_state CHECK (
    (status = 'resolved' AND resolved_at IS NOT NULL)
    OR (status IN ('escalated', 'in_progress') AND resolved_at IS NULL)
  )
);

CREATE INDEX idx_support_ticket_status ON public.support_ticket (status, escalated_at);
CREATE INDEX idx_support_ticket_business ON public.support_ticket (business_id);

ALTER TABLE public.support_ticket ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.support_ticket FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.support_ticket TO service_role;
CREATE POLICY support_ticket_service_role ON public.support_ticket
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

COMMIT;

-- Verifiera efterat:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_schema='public' AND table_name='support_ticket' ORDER BY ordinal_position;
