-- V9: Gmail Polling — löpande mailkontakt
-- Kör manuellt i Supabase SQL Editor

-- Mailkonversationer (likt sms_conversations)
CREATE TABLE IF NOT EXISTS email_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Gmail-data
  gmail_thread_id TEXT NOT NULL,
  gmail_message_id TEXT NOT NULL UNIQUE,

  -- Matchning
  customer_id TEXT REFERENCES customer(customer_id),
  lead_id TEXT,
  matched_by TEXT, -- 'email' | 'name' | 'unmatched'

  -- Innehåll
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  body_text TEXT,
  received_at TIMESTAMPTZ,

  -- Hantering
  direction TEXT DEFAULT 'inbound', -- 'inbound' | 'outbound'
  status TEXT DEFAULT 'new',        -- 'new' | 'read' | 'replied' | 'ignored'
  agent_handled BOOLEAN DEFAULT false,
  agent_response TEXT
);

CREATE INDEX IF NOT EXISTS idx_email_conv_business ON email_conversations(business_id, status);
CREATE INDEX IF NOT EXISTS idx_email_conv_message ON email_conversations(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_customer ON email_conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_email_conv_received ON email_conversations(business_id, received_at DESC);

-- Spåra senaste poll per företag (kolumner på calendar_connection)
ALTER TABLE calendar_connection
  ADD COLUMN IF NOT EXISTS gmail_last_polled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS gmail_last_history_id TEXT;
