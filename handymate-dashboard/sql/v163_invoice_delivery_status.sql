-- v163: invoice.delivery_status — skiljer "bokfört i Fortnox men ej
-- levererat till kund" från övriga tillstånd.
--
-- KÖRS MANUELLT i Supabase SQL Editor.
--
-- BAKGRUND
-- Enat fakturautskick (docs/superpowers/specs/
-- 2026-08-20-enat-fakturautskick-fortnox-design.md): Fortnox-synk sker
-- nu FÖRE kundutskick i samma flöde. Om Fortnox-steget lyckas men
-- email/SMS misslyckas är fakturan korrekt bokförd men aldrig levererad
-- — invoice.status (draft/sent/paid/...) räcker inte för att uttrycka
-- det tillståndet utan att kollidera med fortnox_sync_status (v58,
-- som redan äger Fortnox-sidans state).
--
-- MODELL
--   NULL/'pending'        → ej försökt levererat än, eller aldrig
--                            aktuellt (Fortnox ej kopplat — vanliga
--                            invoice.status räcker då som idag).
--   'delivered'           → email eller SMS gick faktiskt ut.
--   'delivery_failed'     → Fortnox-steget (om aktuellt) lyckades,
--                            men kundleveransen misslyckades. Retry
--                            ska bara göra om LEVERANSEN, aldrig
--                            Fortnox-anropet.

BEGIN;

ALTER TABLE invoice
  ADD COLUMN IF NOT EXISTS delivery_status TEXT
  CHECK (delivery_status IS NULL OR delivery_status IN ('pending', 'delivered', 'delivery_failed'));

COMMENT ON COLUMN invoice.delivery_status IS
  'Kundleveransens tillstånd, skilt från fortnox_sync_status (v58, bokföringssidan). NULL/pending=ej klart, delivered=kunden fick den, delivery_failed=bokfört men ej levererat — retry ska bara göra om kundleveransen.';

COMMIT;

-- Verifiera efteråt:
-- SELECT column_name, data_type FROM information_schema.columns
--   WHERE table_name = 'invoice' AND column_name = 'delivery_status';
