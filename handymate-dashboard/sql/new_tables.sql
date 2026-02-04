-- =========================================
-- HANDYMATE - NYA TABELLER (ROBUST VERSION)
-- Kan köras flera gånger utan problem
-- =========================================


-- 1. TIME_ENTRY - Tidrapportering
-- =========================================
CREATE TABLE IF NOT EXISTS time_entry (
  time_entry_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  booking_id TEXT,
  customer_id TEXT,
  description TEXT,
  work_date DATE NOT NULL DEFAULT CURRENT_DATE,
  start_time TIME,
  end_time TIME,
  duration_minutes INTEGER NOT NULL DEFAULT 0,
  hourly_rate DECIMAL(10,2),
  is_billable BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS idx_time_entry_business;
DROP INDEX IF EXISTS idx_time_entry_date;
CREATE INDEX idx_time_entry_business ON time_entry(business_id);
CREATE INDEX idx_time_entry_date ON time_entry(work_date);

ALTER TABLE time_entry ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "time_entry_all" ON time_entry;
CREATE POLICY "time_entry_all" ON time_entry FOR ALL USING (true) WITH CHECK (true);


-- 2. CALL_RECORDING - Samtalsinspelningar
-- =========================================
CREATE TABLE IF NOT EXISTS call_recording (
  recording_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  customer_id TEXT,
  elks_recording_id TEXT,
  recording_url TEXT,
  duration_seconds INTEGER DEFAULT 0,
  transcript TEXT,
  transcript_summary TEXT,
  transcribed_at TIMESTAMPTZ,
  phone_number TEXT,
  direction TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Lägg till saknade kolumner om tabellen redan finns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'phone_number') THEN
    ALTER TABLE call_recording ADD COLUMN phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'direction') THEN
    ALTER TABLE call_recording ADD COLUMN direction TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcript') THEN
    ALTER TABLE call_recording ADD COLUMN transcript TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcript_summary') THEN
    ALTER TABLE call_recording ADD COLUMN transcript_summary TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'transcribed_at') THEN
    ALTER TABLE call_recording ADD COLUMN transcribed_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'elks_recording_id') THEN
    ALTER TABLE call_recording ADD COLUMN elks_recording_id TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'call_recording' AND column_name = 'recording_url') THEN
    ALTER TABLE call_recording ADD COLUMN recording_url TEXT;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_call_recording_business;
DROP INDEX IF EXISTS idx_call_recording_created;
CREATE INDEX idx_call_recording_business ON call_recording(business_id);
CREATE INDEX idx_call_recording_created ON call_recording(created_at);

ALTER TABLE call_recording ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "call_recording_all" ON call_recording;
CREATE POLICY "call_recording_all" ON call_recording FOR ALL USING (true) WITH CHECK (true);


-- 3. AI_SUGGESTION - AI-förslag
-- =========================================
CREATE TABLE IF NOT EXISTS ai_suggestion (
  suggestion_id TEXT DEFAULT gen_random_uuid()::TEXT PRIMARY KEY,
  business_id TEXT NOT NULL,
  recording_id TEXT,
  customer_id TEXT,
  suggestion_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'pending',
  action_data JSONB DEFAULT '{}',
  approved_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  confidence_score DECIMAL(3,2),
  source_text TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ
);

DROP INDEX IF EXISTS idx_ai_suggestion_business;
DROP INDEX IF EXISTS idx_ai_suggestion_status;
DROP INDEX IF EXISTS idx_ai_suggestion_created;
CREATE INDEX idx_ai_suggestion_business ON ai_suggestion(business_id);
CREATE INDEX idx_ai_suggestion_status ON ai_suggestion(status);
CREATE INDEX idx_ai_suggestion_created ON ai_suggestion(created_at);

ALTER TABLE ai_suggestion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "ai_suggestion_all" ON ai_suggestion;
CREATE POLICY "ai_suggestion_all" ON ai_suggestion FOR ALL USING (true) WITH CHECK (true);


-- 4. TELEFONI-KOLUMNER I BUSINESS_CONFIG
-- =========================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'assigned_phone_number') THEN
    ALTER TABLE business_config ADD COLUMN assigned_phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'forward_phone_number') THEN
    ALTER TABLE business_config ADD COLUMN forward_phone_number TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'call_recording_enabled') THEN
    ALTER TABLE business_config ADD COLUMN call_recording_enabled BOOLEAN DEFAULT true;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'call_recording_consent_message') THEN
    ALTER TABLE business_config ADD COLUMN call_recording_consent_message TEXT DEFAULT 'Detta samtal kan komma att spelas in för kvalitets- och utbildningsändamål.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'business_config' AND column_name = 'elks_number_id') THEN
    ALTER TABLE business_config ADD COLUMN elks_number_id TEXT;
  END IF;
END $$;


-- KLART!
SELECT 'Migration completed successfully' as status;
