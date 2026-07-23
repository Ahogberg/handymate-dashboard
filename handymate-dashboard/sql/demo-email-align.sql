-- demo-email-align — spegla demokontots kontakt-mail till den nya
-- inloggnings-adressen demo@handymate.se.
--
-- Bakgrund: demokontot (biz_0lovw5vcwzqn) skapades ad hoc med
-- andreas+demo@byglo.se. Andreas byter INLOGGNINGS-mailen i Supabase
-- dashboard (Authentication -> Users -> redigera e-post -> demo@handymate.se,
-- auto-confirmed). Denna fil alignar business_config.contact_email så att
-- app-mail/identitet pekar pa samma neutrala, delade adress.
--
-- Paverkar inget floede: demo-reset gate:as pa DEMO_BUSINESS_ID (business_id),
-- inte pa mailen. Kor manuellt i Supabase SQL Editor EFTER dashboard-bytet.

UPDATE business_config
SET contact_email = 'demo@handymate.se'
WHERE business_id = 'biz_0lovw5vcwzqn';

-- Verifiering:
SELECT business_id, business_name, contact_email, personal_phone
FROM business_config
WHERE business_id = 'biz_0lovw5vcwzqn';
