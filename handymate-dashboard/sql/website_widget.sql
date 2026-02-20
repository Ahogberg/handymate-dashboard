-- Website Widget: AI chatbot + lead generation
-- Run in Supabase SQL Editor

-- Widget conversation history
CREATE TABLE IF NOT EXISTS widget_conversation (
  id TEXT PRIMARY KEY DEFAULT 'wconv_' || substr(md5(random()::text), 1, 9),
  business_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  visitor_name TEXT,
  visitor_phone TEXT,
  visitor_email TEXT,
  messages JSONB DEFAULT '[]',
  lead_created BOOLEAN DEFAULT false,
  deal_id TEXT,
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_widget_conv_business ON widget_conversation (business_id, created_at);
CREATE INDEX IF NOT EXISTS idx_widget_conv_session ON widget_conversation (business_id, session_id);

-- Widget config columns on business_config
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_enabled BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_color TEXT DEFAULT '#0891b2';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_welcome_message TEXT DEFAULT 'Hej! 👋 Hur kan vi hjälpa dig?';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_position TEXT DEFAULT 'right' CHECK (widget_position IN ('right', 'left'));
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_bot_name TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_max_estimate INTEGER DEFAULT 100000;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_collect_contact BOOLEAN DEFAULT true;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_book_time BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_give_estimates BOOLEAN DEFAULT true;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_ask_budget BOOLEAN DEFAULT true;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS widget_quick_questions JSONB DEFAULT '["Vad kostar renovering?", "Vilka tjänster har ni?", "Boka en tid"]';
