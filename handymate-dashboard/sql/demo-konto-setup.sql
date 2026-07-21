-- demo-konto-setup — engångsriggning av demokontot (INTE en migration)
--
-- Demokontot är skapat: biz_0lovw5vcwzqn (andreas+demo@byglo.se,
-- "Svensson Bygg AB", bransch construction). Nya konton får plan 'starter',
-- men demon ska visa hela teamet utan uppgraderings-modaler, och
-- onboarding-stegen ska inte vara i vägen vid inloggning.
--
-- personal_phone = numret som ALLA demokunder får vid "Återställ demon" —
-- godkännanden i demon SMS:ar alltså detta nummer (presentatörens).
-- BYT 07XXXXXXXX till Christoffers/ditt riktiga mobilnummer innan körning!
--
-- Kör manuellt i Supabase SQL Editor.

UPDATE business_config
SET
  subscription_plan = 'professional',
  subscription_status = 'active',
  personal_phone = '07XXXXXXXX',
  onboarding_completed_at = COALESCE(onboarding_completed_at, NOW()),
  onboarding_step = 10
WHERE business_id = 'biz_0lovw5vcwzqn';

-- Verifiering:
SELECT business_id, business_name, subscription_plan, subscription_status,
       personal_phone, onboarding_completed_at
FROM business_config
WHERE business_id = 'biz_0lovw5vcwzqn';
