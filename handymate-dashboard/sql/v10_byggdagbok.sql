-- v10_byggdagbok.sql
-- Utökar befintlig project_log-tabell med kundgodkännande-fält
-- Kör manuellt i Supabase SQL Editor

-- Nya kolumner för kundsignering (övriga byggdagbok-fält finns redan)
ALTER TABLE project_log
  ADD COLUMN IF NOT EXISTS signed_by_customer BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_signed_at TIMESTAMPTZ;
