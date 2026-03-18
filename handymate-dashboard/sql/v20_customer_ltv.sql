-- V20: Kundlivstidsvärde (Customer Lifetime Value)
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS lifetime_value NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS job_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_job_date DATE,
  ADD COLUMN IF NOT EXISTS avg_job_value NUMERIC(10,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_payment_days INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ltv_updated_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_customer_ltv ON customer(business_id, lifetime_value DESC);
CREATE INDEX IF NOT EXISTS idx_customer_last_job ON customer(business_id, last_job_date);
