-- V18: Offertuppföljning — saknade kolumner för cron-jobb
-- Kör manuellt i Supabase SQL Editor

-- Kolumner som cron/quote-follow-up använder
ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS follow_up_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_follow_up_at TIMESTAMPTZ;
