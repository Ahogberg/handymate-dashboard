-- V18: Quote UX förbättringar — kundbetalningsvillkor
-- Kör manuellt i Supabase SQL Editor

-- Kundspecifika betalningsvillkor
ALTER TABLE customer
  ADD COLUMN IF NOT EXISTS default_payment_days INTEGER DEFAULT 30,
  ADD COLUMN IF NOT EXISTS invoice_email BOOLEAN DEFAULT true;
