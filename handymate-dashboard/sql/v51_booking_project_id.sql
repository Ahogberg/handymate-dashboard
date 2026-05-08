-- V51: Booking-typ-differentiering (project_id + kind)
--
-- Lägger grunden för Modell B-flödet i mobile Verksamhet-tabben:
-- - booking.project_id: länk till project för "projekt-bokningar"
--   (renders som projekt-kort med stage-band + "dag X av Y").
--   NULL = lös bokning (offertbesök, service, felanmälan).
-- - booking.kind: kategori för lösa pass. Renderas som pill i UI.
--   För projekt-bokningar är fältet irrelevant (visar projekt-banner istället).
--
-- Design-doc: tasks/booking-type-implementation.md
-- Validerad av: Andreas + Christoffer (pilot)
--
-- Kör manuellt i Supabase SQL Editor.

-- ─────────────────────────────────────────────────────────────────
-- DEL 1: project_id (FK med ON DELETE SET NULL)
-- ON DELETE SET NULL behåller booking-historiken om projekt raderas
-- — viktigt för audit + tidsraporter som länkar mot booking_id.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS project_id TEXT REFERENCES project(project_id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_booking_project
  ON booking(business_id, project_id)
  WHERE project_id IS NOT NULL;

COMMENT ON COLUMN booking.project_id IS
  'Länk till project om bokningen tillhör ett pågående projekt. NULL = lös bokning.';

-- ─────────────────────────────────────────────────────────────────
-- DEL 2: kind (enum för lösa pass-kategorier)
-- Default 'standard' fyller existerande rader vid ALTER. CHECK-
-- constraint validerar att framtida insert/update håller sig till
-- de fyra giltiga värdena.
-- ─────────────────────────────────────────────────────────────────

ALTER TABLE booking
  ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'standard';

ALTER TABLE booking
  DROP CONSTRAINT IF EXISTS booking_kind_check;

ALTER TABLE booking
  ADD CONSTRAINT booking_kind_check
  CHECK (kind IN ('service', 'offer', 'emergency', 'standard'));

CREATE INDEX IF NOT EXISTS idx_booking_kind
  ON booking(business_id, kind)
  WHERE kind <> 'standard';

COMMENT ON COLUMN booking.kind IS
  'Booking-kategori för lösa pass: service, offer (offertbesök), emergency (felanmälan), standard (default — projekt-bokningar har detta värde men det renderas inte i UI).';

-- ─────────────────────────────────────────────────────────────────
-- VERIFIERING
-- Förvänta: alla existerande booking-rader har kind='standard' och
-- project_id=NULL (eftersom kolumnen är ny). project_id-FK tillåter
-- fortsatt INSERT av rader utan project_id.
-- ─────────────────────────────────────────────────────────────────

SELECT
  COUNT(*) AS total_bookings,
  COUNT(project_id) AS with_project,
  COUNT(*) FILTER (WHERE kind = 'standard') AS kind_standard,
  COUNT(*) FILTER (WHERE kind <> 'standard') AS kind_other
FROM booking;
