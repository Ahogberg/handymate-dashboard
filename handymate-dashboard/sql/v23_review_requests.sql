-- V23: Komplettera review_request-tabellen
-- Kör manuellt i Supabase SQL Editor

ALTER TABLE review_request
  ADD COLUMN IF NOT EXISTS review_url TEXT,
  ADD COLUMN IF NOT EXISTS sms_text TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'sent'
    CHECK (status IN ('sent', 'clicked', 'reviewed'));

-- Service role access
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_review_request' AND tablename = 'review_request') THEN
    CREATE POLICY service_review_request ON review_request FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
