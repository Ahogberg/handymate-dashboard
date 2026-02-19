-- ============================================================
-- Notifications System
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
  id TEXT PRIMARY KEY DEFAULT 'notif_' || substr(md5(random()::text), 1, 12),
  business_id TEXT NOT NULL,
  user_id TEXT,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  message TEXT,
  icon TEXT DEFAULT 'bell',
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  read_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notification_business ON notification(business_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_user ON notification(user_id, is_read, created_at DESC);

-- Notification types:
-- auto_approve     – AI auto-godkände en åtgärd
-- booking_conflict – Bokningskonflikt upptäckt
-- new_lead         – Ny lead/kund
-- quote_signed     – Offert accepterad
-- quote_declined   – Offert avvisad
-- missed_call      – Missat samtal
-- invoice_paid     – Faktura betald
-- invoice_overdue  – Faktura förfallen
-- nurture_complete – Uppföljningssekvens slutförd utan konvertering
-- nurture_response – Kund svarade under aktiv sekvens
-- escalation       – Eskalering kräver manuell hantering
-- system           – Systemmeddelande
