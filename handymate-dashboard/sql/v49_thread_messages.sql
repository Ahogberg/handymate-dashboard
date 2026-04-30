-- V49: Thread-meddelanden för multi-turn-konversationer
--
-- Fram till nu skickade chat-endpointen bara senaste user-meddelandet
-- vidare till Claude — agenten saknade kontext från tidigare turns.
-- Med thread_message lagrar vi varje user/assistant-turn så vi kan
-- ladda historiken och ge agenten ett "minne".
--
-- Bakåtkompat: utan thread_id (legacy chat utan customerId/projectId)
-- skrivs ingenting — endpoint fortsätter använda payload-history.

CREATE TABLE IF NOT EXISTS thread_message (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  thread_id UUID NOT NULL REFERENCES agent_threads(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  -- 'user' = hantverkaren, 'assistant' = agent-svar, 'system' = reserverat
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  -- Vilken agent som skrev meddelandet (NULL för user-meddelanden)
  agent TEXT,
  content TEXT NOT NULL,
  -- True för Matte → Karin-overlämningar; visas i UI med särskild
  -- styling och skippas när vi konverterar till Claude messages-array
  -- (de är inte del av användarkonversationen, bara metadata).
  is_handoff_announcement BOOLEAN DEFAULT FALSE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_thread_messages_thread
  ON thread_message(thread_id, created_at);

-- För framtida "Mina senaste konversationer"-vy per business
CREATE INDEX IF NOT EXISTS idx_thread_messages_business
  ON thread_message(business_id, created_at DESC);
