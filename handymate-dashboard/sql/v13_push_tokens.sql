-- v13: Expo push tokens för mobilappen
-- Körs manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT REFERENCES business_config(business_id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT, -- 'ios' | 'android'
  created_at TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index för snabb lookup per business
CREATE INDEX IF NOT EXISTS idx_push_tokens_business_id ON push_tokens(business_id);

-- RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "push_tokens_select_own" ON push_tokens
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "push_tokens_insert_own" ON push_tokens
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "push_tokens_delete_own" ON push_tokens
  FOR DELETE USING (
    business_id IN (
      SELECT business_id FROM business_users WHERE user_id = auth.uid()
    )
  );

-- Service role behöver full access för server-side push-utskick
CREATE POLICY "push_tokens_service_role" ON push_tokens
  FOR ALL USING (auth.role() = 'service_role');
