-- v218 (2026-09-06) — F17 i Codex liveprov: onboardingens 850 kr/tim blev
-- 650 kr/tim i tidrapport och fakturaunderlag.
--
-- Rotorsak: business_config.pricing_settings har ett kolumn-DEFAULT som
-- innehåller "hourly_rate": 650. v79 (2026-08-03) tog bort nyckeln ur de
-- befintliga raderna men lämnade DEFAULT:en, så varje NYTT konto får 650
-- igen. resolveTimeEntryHourlyRate läser pricing_settings.hourly_rate före
-- default_hourly_rate (onboardingens slider), och 650 skuggar därmed kundens
-- riktiga pris. 7 konton skapade senaste 30 dagarna bar nyckeln.
--
-- Åtgärd: (1) DEFAULT utan hourly_rate, (2) samma städning som v79 för de
-- rader som hunnit få den seedade 650:an. Ett MEDVETET satt pris (≠ 650)
-- rörs inte. Idempotent.

ALTER TABLE public.business_config
  ALTER COLUMN pricing_settings SET DEFAULT
  '{"vat_rate": 25, "callout_fee": 495, "rot_enabled": true, "rot_percent": 30, "rut_enabled": false, "rut_percent": 50, "minimum_hours": 1, "payment_terms": 30, "warranty_years": 2}'::jsonb;

UPDATE public.business_config
   SET pricing_settings = pricing_settings - 'hourly_rate'
 WHERE pricing_settings->>'hourly_rate' = '650';

-- Verifiering:
-- SELECT column_default FROM information_schema.columns
--  WHERE table_name='business_config' AND column_name='pricing_settings';
-- SELECT count(*) FROM business_config WHERE pricing_settings->>'hourly_rate'='650'; -- 0
