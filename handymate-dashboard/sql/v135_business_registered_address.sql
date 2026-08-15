-- Strukturerad registrerad adress för business_config (2026-08-15).
--
-- Bolagsverket-uppslaget (org.nr → namn/adress/bolagsform, se
-- lib/bolagsverket/client.ts + app/onboarding/components/Step2Business.tsx)
-- behöver en plats att landa den strukturerade adressen i. Ett enda,
-- ostrukturerat `address TEXT`-fält finns redan (sql/new_tables.sql) men
-- är dött i det nuvarande onboarding-flödet (skrivs inte av
-- Step2Business.tsx/types-redesign.ts) och håller inte isär gata/postnummer/
-- ort — Bolagsverket levererar redan strukturerad data, och framtida ytor
-- (fakturaavsändare, kartvisning) vinner på struktur. Det gamla `address`-
-- fältet rörs INTE (ingen backfill, ingen migrering av data) — det är dött,
-- inte fel, och en tyst datamigrering hör inte hemma i samma commit som en
-- ny funktion.
--
-- Nullable, ingen default: ett osatt fält ska aldrig se ut som en tom
-- adress — samma ärlighetsprincip som revenue_target_annual_sek (v128)
-- och margin_target_percent (v134).
ALTER TABLE business_config
  ADD COLUMN IF NOT EXISTS address_street text,
  ADD COLUMN IF NOT EXISTS address_postal_code text,
  ADD COLUMN IF NOT EXISTS address_city text;

COMMENT ON COLUMN business_config.address_street IS
  'Gatuadress, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';
COMMENT ON COLUMN business_config.address_postal_code IS
  'Postnummer, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';
COMMENT ON COLUMN business_config.address_city IS
  'Postort, källa Bolagsverket eller manuell ifyllning. Null = okänd/ej ifylld.';
