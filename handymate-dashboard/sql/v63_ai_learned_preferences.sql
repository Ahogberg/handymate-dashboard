-- v63_ai_learned_preferences.sql
-- AI-lärda preferenser (1 rad/företag). Separeras från key/value-tabellen
-- business_preferences (v2) — tidigare låg dessa sammanfattningskolumner i ett
-- v5-schema med SAMMA tabellnamn (IF NOT EXISTS → tyst överhoppat), så agentens
-- inlärning läste/skrev kolumner som inte fanns och lärde sig aldrig.
-- Körs manuellt i Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS ai_learned_preferences (
  business_id TEXT PRIMARY KEY,
  communication_tone TEXT,      -- 'formal' | 'casual' | 'brief'
  pricing_tendency TEXT,        -- 'premium' | 'competitive' | 'flexible'
  lead_response_style TEXT,     -- 'immediate' | 'considered' | 'selective'
  preferred_sms_length TEXT,    -- 'short' | 'medium' | 'detailed'
  custom_preferences JSONB,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE ai_learned_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_learned_preferences_policy ON ai_learned_preferences;
CREATE POLICY ai_learned_preferences_policy ON ai_learned_preferences FOR ALL USING (true) WITH CHECK (true);
