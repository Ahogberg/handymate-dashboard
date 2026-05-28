-- v57: Lägg till is_active-kolumn på business_config för cron-iteration-filter.
--
-- Bakgrund: Karin-cron-buggen (audit 2 2026-05-20) — agenter itererar alla
-- rader i business_config oavsett om kontot är levande eller dött (test/
-- dubbletter som biz_6wunctak49). Resultat: Claude-anrop mot fel data,
-- cost-läckor, observations skapade mot orelevanta businesses.
--
-- Fix: kolumn med default true (alla befintliga businesses förblir aktiva),
-- cron-route filtrerar på is_active=true. För att markera dödä konton:
--   UPDATE business_config SET is_active=false WHERE business_id='biz_xxx';
--
-- Pilot-säkerhet: Bee Service (biz_21wswuhrbhy) får default true → fortsätter
-- fungera. Test-konton kan stängas av manuellt.

ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

-- Index för cron-iteration-prestanda (om antalet businesses växer)
CREATE INDEX IF NOT EXISTS idx_business_config_active
  ON business_config(is_active)
  WHERE is_active = true;

COMMENT ON COLUMN business_config.is_active IS
  'False = dött/test-konto, exkluderas från cron-iteration (Karin/Daniel/Lars/Hanna observations). Default true för alla befintliga.';
