-- ============================================================
-- V5: learning_events + business_preferences
-- Per-företags-inlärning — agenten lär sig av hantverkarens
-- godkännanden, avvisanden och justeringar.
-- Run in Supabase SQL Editor
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Vad hände
  event_type TEXT NOT NULL,
  -- 'approval_accepted' | 'approval_rejected' | 'approval_edited'
  -- 'sms_tone_adjusted' | 'quote_price_adjusted' | 'lead_manually_moved'

  -- Kontext
  reference_id UUID,        -- lead_id, quote_id, invoice_id etc
  reference_type TEXT,      -- 'lead' | 'quote' | 'invoice' | 'sms'

  -- Vad agenten föreslog vs vad hantverkaren faktiskt ville
  agent_suggestion JSONB,   -- vad agenten genererade
  human_override JSONB,     -- vad hantverkaren ändrade till (null om accepterat)

  -- Tolkad preferens (genereras av Claude vid inlärning)
  learned_preference TEXT,  -- ex: "Föredrar kortare SMS-ton vid offertuppföljning"
  preference_category TEXT, -- 'communication_tone' | 'pricing' | 'scheduling' | 'lead_handling'
  confidence FLOAT          -- 0.0-1.0, ökar med upprepning
);

CREATE INDEX IF NOT EXISTS idx_learning_business ON learning_events(business_id);
CREATE INDEX IF NOT EXISTS idx_learning_category ON learning_events(business_id, preference_category);

-- RLS
ALTER TABLE learning_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "learning_events_select" ON learning_events
  FOR SELECT USING (true);

CREATE POLICY "learning_events_insert" ON learning_events
  FOR INSERT WITH CHECK (true);

-- Sammanfattad preferenstabell (uppdateras nattligen)
CREATE TABLE IF NOT EXISTS business_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE UNIQUE,
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  communication_tone TEXT,     -- 'formal' | 'casual' | 'brief'
  pricing_tendency TEXT,       -- 'premium' | 'competitive' | 'flexible'
  lead_response_style TEXT,    -- 'immediate' | 'considered' | 'selective'
  preferred_sms_length TEXT,   -- 'short' | 'medium' | 'detailed'
  custom_preferences JSONB     -- övrigt som inte passar ovanstående
);

-- RLS
ALTER TABLE business_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "business_preferences_select" ON business_preferences
  FOR SELECT USING (true);

CREATE POLICY "business_preferences_insert" ON business_preferences
  FOR INSERT WITH CHECK (true);

CREATE POLICY "business_preferences_update" ON business_preferences
  FOR UPDATE USING (true);
