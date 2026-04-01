-- V10: Auto-faktura vid projektavslut
-- Kolumn styr om faktura skickas direkt (true) eller skapas som utkast (false)

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS auto_invoice_on_complete BOOLEAN DEFAULT false;

COMMENT ON COLUMN business_config.auto_invoice_on_complete IS
  'true = skicka faktura direkt vid projektavslut, false = skapa utkast + godkännande';
