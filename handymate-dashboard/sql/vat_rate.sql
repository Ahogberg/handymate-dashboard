-- ============================================================
-- VAT Rate — Add default_vat_rate column to business_config
-- Allows per-business VAT rate configuration (default 25%)
-- ============================================================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS default_vat_rate NUMERIC DEFAULT 25;

COMMENT ON COLUMN business_config.default_vat_rate IS 'Standard momssats i procent (25 = 25%). Används av agent tools och offert/faktura-generering.';
