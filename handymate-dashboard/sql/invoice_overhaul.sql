-- Invoice Overhaul Migration
-- Adds advanced line items, payment info, credit notes, partial invoices, reminders

-- ============================================================
-- 1. ALTER invoice table – new columns
-- ============================================================

-- Invoice type & credit references
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS invoice_type TEXT DEFAULT 'standard';
  -- 'standard' | 'credit' | 'partial' | 'final' | 'reminder'
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS credit_for_invoice_id TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS partial_number INT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS partial_total INT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS payment_plan_id TEXT;

-- Text blocks
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS introduction_text TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS conclusion_text TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS internal_notes TEXT;

-- Payment method & accounts (per-invoice override)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS ocr_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bankgiro_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS plusgiro_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS bank_account TEXT;

-- Penalty / reminder fields (reminder_count, last_reminder_at already exist)
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS penalty_interest NUMERIC(5,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS reminder_fee NUMERIC(10,2);

-- ROT/RUT split fields
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_work_cost NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_deduction NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_customer_pays NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rut_work_cost NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rut_deduction NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rut_customer_pays NUMERIC(12,2);
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_personal_number TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS rot_property_designation TEXT;

-- Delivery tracking
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS sent_method TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS payment_reference TEXT;

-- Attachments
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb;

-- Our/your reference
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS our_reference TEXT;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS your_reference TEXT;

-- Discount
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS discount_percent NUMERIC(5,2) DEFAULT 0;
ALTER TABLE invoice ADD COLUMN IF NOT EXISTS discount_amount NUMERIC(12,2) DEFAULT 0;

-- ============================================================
-- 2. ALTER business_config – new invoice settings
-- ============================================================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_payment_days INT DEFAULT 30;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_payment_method TEXT DEFAULT 'bankgiro';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS plusgiro TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS bank_account_number TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS invoice_prefix TEXT DEFAULT 'FV';
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS next_invoice_number INT DEFAULT 1;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS invoice_footer_text TEXT;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS penalty_interest NUMERIC(5,2) DEFAULT 8;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS reminder_fee NUMERIC(10,2) DEFAULT 60;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS max_auto_reminders INT DEFAULT 3;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS f_skatt_registered BOOLEAN DEFAULT false;
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS accent_color TEXT DEFAULT '#7c3aed';

-- ============================================================
-- 3. CREATE invoice_reminders table
-- ============================================================

CREATE TABLE IF NOT EXISTS invoice_reminders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  business_id TEXT NOT NULL REFERENCES business_config(business_id),
  invoice_id TEXT NOT NULL REFERENCES invoice(invoice_id),
  reminder_number INT NOT NULL DEFAULT 1,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  sent_method TEXT, -- 'email' | 'sms' | 'both'
  fee_amount NUMERIC(10,2) DEFAULT 0,
  penalty_interest_amount NUMERIC(10,2) DEFAULT 0,
  total_with_fees NUMERIC(12,2) DEFAULT 0,
  message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for quick lookup
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_invoice ON invoice_reminders(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_reminders_business ON invoice_reminders(business_id);

-- ============================================================
-- 4. RLS policies for invoice_reminders
-- ============================================================

ALTER TABLE invoice_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "invoice_reminders_select" ON invoice_reminders
  FOR SELECT USING (
    business_id IN (
      SELECT business_id FROM business_config WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "invoice_reminders_insert" ON invoice_reminders
  FOR INSERT WITH CHECK (
    business_id IN (
      SELECT business_id FROM business_config WHERE user_id = auth.uid()
    )
  );
