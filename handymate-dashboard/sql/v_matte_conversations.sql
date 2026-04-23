-- Matte-konversationer — persistent chat-historik
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS matte_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL,
  user_id TEXT,
  title TEXT,
  last_message_preview TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matte_conversations_business_updated
  ON matte_conversations(business_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS matte_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES matte_conversations(id) ON DELETE CASCADE,
  business_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  agent_run_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_matte_messages_conversation
  ON matte_messages(conversation_id, created_at);

ALTER TABLE matte_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE matte_messages ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_matte_conversations' AND tablename = 'matte_conversations') THEN
    CREATE POLICY service_matte_conversations ON matte_conversations
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_matte_messages' AND tablename = 'matte_messages') THEN
    CREATE POLICY service_matte_messages ON matte_messages
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
