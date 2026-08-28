-- v178: sann installationssignal för hemsidewidgeten (2026-08-28)
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- widget_enabled bevisar bara att ägaren har aktiverat funktionen i
-- Handymate. widget_conversation bevisar först att någon har öppnat chatten.
-- Mellan dessa lägen saknades helt bevis för att loadern faktiskt finns på
-- företagets hemsida. UI:t fick därför inte kalla widgeten "kopplad".
--
-- BESLUT
-- Den publika config-rutten sparar senast observerade laddning, throttlat till
-- högst en skrivning per företag och timme. Endast host + tid sparas; ingen IP,
-- sökväg, query eller besökaridentitet. Fälten är observationsbevis, inte ett
-- löfte om att en konversation eller lead fungerar.

BEGIN;

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS widget_last_seen_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS widget_last_seen_host TEXT;

COMMENT ON COLUMN public.business_config.widget_last_seen_at IS
  'Senaste observerade GET /api/widget/config från installerad loader; throttlad till max en skrivning per timme.';

COMMENT ON COLUMN public.business_config.widget_last_seen_host IS
  'Hostname från Origin/Referer vid senaste loader-observation; aldrig full URL eller IP.';

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'business_config'
--   AND column_name IN ('widget_last_seen_at', 'widget_last_seen_host')
-- ORDER BY column_name;
