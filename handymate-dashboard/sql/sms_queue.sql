-- ============================================================
-- SMS Queue — Queue SMS during night block (21–08) for morning delivery
-- ============================================================

CREATE TABLE IF NOT EXISTS sms_queue (
  queue_id TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  phone_to TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  message TEXT NOT NULL,
  send_after TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',  -- queued | sent | failed
  created_at TIMESTAMPTZ DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_sms_queue_pending
  ON sms_queue(status, send_after) WHERE status = 'queued';
