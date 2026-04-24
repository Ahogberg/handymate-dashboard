-- Delegation-indikator på Matte-meddelanden
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE matte_messages
  ADD COLUMN IF NOT EXISTS delegated_to TEXT;
