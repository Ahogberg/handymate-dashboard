-- v222: "Besöket kostar inget" på bokningssidan (Varumärkeslagret yta 5, 2026-09-07)
--
-- Körs manuellt i Supabase SQL Editor. Koden är TOLERANT: booking-page-
-- routen läser kolumnen i en egen SELECT och tolkar fel/saknad som AV, så
-- pushen beror inte på migrationen. Utan den går det bara inte att slå PÅ
-- reglaget i /dashboard/settings/kundvy (toast "Inställningen kunde inte
-- sparas").
--
-- ═══ VARFÖR ═══
--
-- Designen (Bokning.dc.html) skrev "Besöket tar ungefär en timme och kostar
-- inget." för alla. Det är ett löfte som Handymate inte kan ge å firmans
-- vägnar — många tar betalt för hembesök, särskilt vid små jobb. Därför
-- bakom en inställning, default AV: sägs bara när firman själv slagit på det.
--
-- ═══ KOLLA FÖRST ═══
--   ls sql | grep v22    -- v222 ska vara ledigt (Codex delar serien)

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.business_config') IS NULL THEN
    RAISE EXCEPTION 'v222 kräver business_config';
  END IF;
END $$;

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS booking_visit_free BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN public.business_config.booking_visit_free IS
  'Bokningssidan (/site/[slug]/boka) säger "och kostar inget" om besöket bara när detta är true. Default AV — ett löfte får aldrig gå ut av misstag.';

COMMIT;

-- ═══ VERIFIERA ═══
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'business_config' AND column_name = 'booking_visit_free';
