-- V43: Portal notification log
--
-- Spårar varje notifikation som skickats till en kund via portalen.
-- Används för:
--   1. Anti-spam: dedup av samma event till samma kund inom 1h
--   2. Tracking: open/click via Resend webhooks (framtida)
--   3. Insikter: vilka events triggar mest engagemang

CREATE TABLE IF NOT EXISTS portal_notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT NOT NULL,
  event TEXT NOT NULL,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  email_id TEXT,
  opened_at TIMESTAMPTZ,
  clicked_at TIMESTAMPTZ
);

-- Snabb lookup av "har vi skickat denna event till denna kund nyligen?"
CREATE INDEX IF NOT EXISTS idx_portal_notif_customer
  ON portal_notification_log(customer_id, sent_at DESC);

-- För business-vy / insikter
CREATE INDEX IF NOT EXISTS idx_portal_notif_business
  ON portal_notification_log(business_id, sent_at DESC);
