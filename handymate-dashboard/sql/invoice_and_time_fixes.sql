-- Sprint A+B: Faktura-kritiskt + Tidrapportering
-- Kör i Supabase SQL Editor

-- =============================================
-- A2: Kreditfaktura-stöd
-- =============================================
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS is_credit_note BOOLEAN DEFAULT false;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS original_invoice_id TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS credit_reason TEXT;

-- =============================================
-- A4: Automatiska betalningspåminnelser
-- =============================================
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS reminder_count INTEGER DEFAULT 0;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS last_reminder_at TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS next_reminder_at TIMESTAMPTZ;

-- =============================================
-- B1: Approval workflow
-- =============================================
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'pending';
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS approved_by TEXT;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_time_entry_approval
  ON time_entry(business_id, approval_status)
  WHERE approval_status = 'pending';

-- =============================================
-- B2: Rast/lunch-tracking
-- =============================================
ALTER TABLE time_entry ADD COLUMN IF NOT EXISTS break_minutes INTEGER DEFAULT 0;
