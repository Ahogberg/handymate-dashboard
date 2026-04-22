-- Månadsrapport — Mattes automatiska affärsöversikt
-- Kör manuellt i Supabase SQL Editor

CREATE TABLE IF NOT EXISTS monthly_reviews (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id TEXT NOT NULL,
  month DATE NOT NULL,                -- Första dagen i månaden, t.ex. 2026-03-01
  data JSONB NOT NULL,                -- Rå statistik
  analysis TEXT NOT NULL,             -- Claudes text-analys
  recommendations JSONB DEFAULT '[]'::jsonb,  -- Strukturerade rekommendationer
  sent_at TIMESTAMPTZ,                -- När SMS skickades
  viewed_at TIMESTAMPTZ,              -- När hantverkaren läste rapporten
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (business_id, month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_reviews_business
  ON monthly_reviews(business_id, month DESC);

ALTER TABLE monthly_reviews ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'service_monthly_reviews' AND tablename = 'monthly_reviews') THEN
    CREATE POLICY service_monthly_reviews ON monthly_reviews
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'user_monthly_reviews' AND tablename = 'monthly_reviews') THEN
    CREATE POLICY user_monthly_reviews ON monthly_reviews
      FOR SELECT USING (
        business_id IN (
          SELECT business_id FROM business_config WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;
