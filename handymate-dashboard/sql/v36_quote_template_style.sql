-- v36: Per-quote template style override
-- Tidigare: alla offerter renderades med business_config.quote_template_style
-- Nu: varje offert kan override:a stilen via quotes.template_style.
-- Null = använd business default (bakåtkompatibelt).

ALTER TABLE quotes
  ADD COLUMN IF NOT EXISTS template_style TEXT;

-- Endast tillåtna värden (matchar lib/quote-templates/index.ts)
ALTER TABLE quotes
  DROP CONSTRAINT IF EXISTS quotes_template_style_valid;

ALTER TABLE quotes
  ADD CONSTRAINT quotes_template_style_valid
  CHECK (template_style IS NULL OR template_style IN ('modern', 'premium', 'friendly'));

COMMENT ON COLUMN quotes.template_style IS
  'Override för rendering-stil per offert. Null = använd business_config.quote_template_style.';
