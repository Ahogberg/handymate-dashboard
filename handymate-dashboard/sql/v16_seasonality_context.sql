-- V16 tillägg: Säsongsdata i agent_context
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE agent_context
  ADD COLUMN IF NOT EXISTS slow_months JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS peak_months JSONB DEFAULT '[]'::jsonb;
