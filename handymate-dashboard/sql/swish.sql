-- Swish QR-kod på fakturor
-- Lägg till swish_number i business_config om det inte redan finns
ALTER TABLE business_config ADD COLUMN IF NOT EXISTS swish_number VARCHAR(20);
