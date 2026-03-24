-- V33: Matte Sprint 2 — kalenderslots, bilageflaggning
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE email_conversations
  ADD COLUMN IF NOT EXISTS attachment_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS has_images BOOLEAN DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_pending_approvals_matte
  ON pending_approvals(business_id, status, created_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_booking_scheduled
  ON booking(business_id, scheduled_start, status)
  WHERE status NOT IN ('cancelled', 'completed');

NOTIFY pgrst, 'reload schema';
