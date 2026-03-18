-- V21 DEL 2: Agent-minne + inter-agent kommunikation
-- Kör manuellt i Supabase SQL Editor
-- OBS: pgvector-extensionen måste vara aktiverad i Supabase (Database → Extensions → vector)

-- 1. Aktivera pgvector
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Agent-minnen med embeddings
CREATE TABLE IF NOT EXISTS agent_memories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  memory_type TEXT NOT NULL CHECK (memory_type IN ('observation', 'pattern', 'preference', 'fact')),
  content TEXT NOT NULL,
  embedding vector(1536),
  importance_score FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
  access_count INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_agent_memories_business ON agent_memories(business_id, agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_memories_type ON agent_memories(business_id, memory_type);

-- IVFFlat-index för cosine similarity (kräver minst 1 rad, skapa efter första insert)
-- CREATE INDEX ON agent_memories USING ivfflat (embedding vector_cosine_ops) WITH (lists = 10);

-- 3. Inter-agent meddelanden
CREATE TABLE IF NOT EXISTS agent_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  from_agent TEXT NOT NULL,
  to_agent TEXT NOT NULL,
  message_type TEXT NOT NULL CHECK (message_type IN ('request', 'insight', 'alert', 'handoff')),
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'read', 'acted')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_messages_to ON agent_messages(business_id, to_agent, status);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created ON agent_messages(business_id, created_at DESC);

-- 4. RLS
ALTER TABLE agent_memories ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service agent_memories" ON agent_memories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "Service agent_messages" ON agent_messages FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "User agent_memories" ON agent_memories FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
CREATE POLICY "User agent_messages" ON agent_messages FOR ALL USING (
  business_id IN (SELECT business_id FROM business_config WHERE user_id = auth.uid())
);
