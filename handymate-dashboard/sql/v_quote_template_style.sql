-- ─────────────────────────────────────────────────────────────────
-- v_quote_template_style.sql
-- Lägger till valfri offertmall-stil per företag.
-- Tre inbyggda stilar: 'modern' (default), 'premium', 'friendly'.
-- Idempotent — kan köras flera gånger.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS quote_template_style TEXT DEFAULT 'modern';

-- CHECK-constraint: bara giltiga stilar accepteras.
-- Drop+Add för att kunna utöka listan i framtida migrationer utan konflikt.
ALTER TABLE business_config
  DROP CONSTRAINT IF EXISTS quote_template_style_valid;

ALTER TABLE business_config
  ADD CONSTRAINT quote_template_style_valid
  CHECK (quote_template_style IN ('modern', 'premium', 'friendly'));

-- Backfilla NULL-värden till default
UPDATE business_config
SET quote_template_style = 'modern'
WHERE quote_template_style IS NULL;
