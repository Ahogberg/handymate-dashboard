-- v15: Widget guardrails — JSONB-kolumn på business_config för att begränsa
-- chattbotens scope. Krävs (tillsammans med ifylld knowledge_base) för att
-- widget_enabled ska få sättas till true i UI.
--
-- Struktur:
-- {
--   "custom_instructions": "Vad får boten svara om — t.ex. 'Bara frågor om våra tjänster och priser. Hänvisa allt annat till mejl.'",
--   "allowed_topics": ["renovering", "köksinstallation", "elarbeten"],
--   "blocked_topics": ["juridiska frågor", "konkurrenter", "andra branscher"],
--   "fallback_response": "Det vill jag inte svara fel på. Lämna dina uppgifter så hör vi av oss."
-- }
--
-- Default NULL — sidan tolkar det som "inga guardrails satta" och blockerar aktivering.

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS widget_guardrails JSONB;

COMMENT ON COLUMN business_config.widget_guardrails IS
  'Chatbot scope-config: custom_instructions, allowed_topics[], blocked_topics[], fallback_response. NULL = ej konfigurerat (blockerar widget-aktivering i UI).';
