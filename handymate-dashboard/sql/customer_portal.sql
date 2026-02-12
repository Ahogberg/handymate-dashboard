-- Customer portal access
ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_token_created_at TIMESTAMPTZ;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_last_visited_at TIMESTAMPTZ;
ALTER TABLE customer ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_customer_portal_token ON customer(portal_token);

-- Customer messages
CREATE TABLE IF NOT EXISTS customer_message (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL,
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_customer_message_customer ON customer_message(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_message_business ON customer_message(business_id);
