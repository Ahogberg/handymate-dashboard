-- ============================================================
-- SMS Tables — sms_log and sms_conversation
-- Core tables for SMS sending, receiving, and conversation history
-- ============================================================

-- SMS Log — records all sent/received SMS messages
CREATE TABLE IF NOT EXISTS sms_log (
  sms_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  phone_from TEXT,
  phone_to TEXT,
  message TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed')),
  elks_id TEXT,
  error_message TEXT,
  message_type TEXT,
  related_id TEXT,
  trigger_type TEXT,
  trigger_id TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_business ON sms_log(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_log_phone_to ON sms_log(phone_to);
CREATE INDEX IF NOT EXISTS idx_sms_log_created ON sms_log(created_at);
CREATE INDEX IF NOT EXISTS idx_sms_log_direction ON sms_log(business_id, direction);
CREATE INDEX IF NOT EXISTS idx_sms_log_status ON sms_log(status);

-- SMS Conversation — conversation history per phone number
-- Used for AI context when responding to SMS threads
CREATE TABLE IF NOT EXISTS sms_conversation (
  id BIGSERIAL PRIMARY KEY,
  business_id TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sms_conv_business ON sms_conversation(business_id);
CREATE INDEX IF NOT EXISTS idx_sms_conv_phone ON sms_conversation(business_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_sms_conv_created ON sms_conversation(created_at);

COMMENT ON TABLE sms_log IS 'Logg över alla SMS skickade/mottagna via 46elks';
COMMENT ON TABLE sms_conversation IS 'SMS-konversationshistorik per telefonnummer, används för AI-kontext';
