-- V48: Agent handoff — explicit thread-state och handoff-audit
--
-- Bygger ovanpå V21 (agent_messages, agent_memories, agent_runs).
-- Tidigare hade vi inget sätt att hålla reda på vilken agent som "äger"
-- en pågående konversation. Resultat: varje inkommande meddelande gick
-- till Matte som routade om — även om en specialist redan jobbade på
-- ärendet. Med agent_threads.current_agent_id kan vi bevara kontexten
-- över flera meddelanden.

-- 1. Trådar — en aktiv konversation per (business_id, customer_id) eller
--    per (business_id, project_id). Trackar vem som äger samtalet just nu.
CREATE TABLE IF NOT EXISTS agent_threads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  project_id TEXT,
  current_agent_id TEXT NOT NULL DEFAULT 'matte',
  context_summary TEXT,
  handoff_count INTEGER DEFAULT 0,
  last_message_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_threads_customer
  ON agent_threads(business_id, customer_id);
CREATE INDEX IF NOT EXISTS idx_agent_threads_project
  ON agent_threads(business_id, project_id) WHERE project_id IS NOT NULL;

-- 2. Handoffs — audit-trail per handoff. Skild från agent_messages som
--    är generisk inter-agent-kommunikation (request/insight/alert/handoff).
--    agent_handoffs är specifikt för thread-ownership-byten.
CREATE TABLE IF NOT EXISTS agent_handoffs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID REFERENCES agent_threads(id) ON DELETE CASCADE,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  reason TEXT,
  context_summary TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_handoffs_thread
  ON agent_handoffs(thread_id, created_at DESC);

-- 3. SMS-konversationer kopplas till thread så framtida SMS från samma
--    kund routar till nuvarande agent direkt. NULL för existerande
--    rader — backwards-compat (de behandlas som "ingen aktiv tråd",
--    Matte tar över som default).
ALTER TABLE sms_conversation
  ADD COLUMN IF NOT EXISTS thread_id UUID REFERENCES agent_threads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS current_agent TEXT;
