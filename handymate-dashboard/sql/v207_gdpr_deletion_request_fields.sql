-- GDPR-radering: gör den befintliga raderingsrutten verksam i live-schema.
-- KÖRS MANUELLT i Supabase SQL Editor. Repots äldre sql/gdpr.sql hade aldrig
-- körts som en versionssatt migration, så rutten läste/skrev fantomkolumner.

BEGIN;

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS deletion_requested_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

COMMENT ON COLUMN public.business_config.deletion_requested_at IS
  'Tidpunkt då företagets ägare begärde kontoradering enligt GDPR.';
COMMENT ON COLUMN public.business_config.deletion_reason IS
  'Frivillig orsak angiven vid begäran; får inte krävas för radering.';

COMMIT;
