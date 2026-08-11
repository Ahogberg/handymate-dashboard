-- v118_meeting_context.sql (2026-08-11)
--
-- Meeting Intelligence Epic 0/1 — se docs/audits/MEETING_INTELLIGENCE_ARCHITECTURE.md.
--
-- 1. P0-FIX: Google-kalenderimporten har sannolikt tyst misslyckats sedan
--    start — båda syncvägarna insertar type='external' men CHECK-constrainten
--    (sql/schedule_tables.sql:12) tillåter bara
--    ('project','internal','time_off','travel'), och cronen kontrollerade
--    aldrig insert-felet. Constrainten utökas med 'external'.
--
-- 2. Epic 1-kolumner: call_recording.booking_id (mötestranskript ↔ bokning)
--    och schedule_entry.customer_id (externa kalenderhändelser ska kunna
--    kundattribueras via attendee-upplösning). Additivt, nullable, inga
--    RLS-/grant-ändringar — båda tabellerna är redan tenant-låsta (v101/v112).

-- ── 1. Relaxa schedule_entry.type-CHECK:en ──────────────────────────────

ALTER TABLE public.schedule_entry
  DROP CONSTRAINT IF EXISTS schedule_entry_type_check;

ALTER TABLE public.schedule_entry
  ADD CONSTRAINT schedule_entry_type_check
  CHECK (type IN ('project', 'internal', 'time_off', 'travel', 'external'));

-- ── 2. Kopplingskolumner ────────────────────────────────────────────────

ALTER TABLE public.call_recording
  ADD COLUMN IF NOT EXISTS booking_id TEXT;

COMMENT ON COLUMN public.call_recording.booking_id IS
  'Mötesassistenten: vilken bokning platsbesöket gällde. Soft TEXT-länk till booking.booking_id (husets konvention — inga FK på booking).';

ALTER TABLE public.schedule_entry
  ADD COLUMN IF NOT EXISTS customer_id TEXT;

COMMENT ON COLUMN public.schedule_entry.customer_id IS
  'Kundattribution för externa kalenderhändelser (attendee-email → lib/matte/resolver.ts). NULL för interna poster.';

CREATE INDEX IF NOT EXISTS idx_schedule_entry_customer
  ON public.schedule_entry (business_id, customer_id)
  WHERE customer_id IS NOT NULL;

-- ── Verifiering (körs efteråt, läsande) ─────────────────────────────────
-- SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname='schedule_entry_type_check';
--   → innehåller 'external'
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='call_recording' AND column_name='booking_id';
--   → 1 rad
--
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='schedule_entry' AND column_name='customer_id';
--   → 1 rad
--
-- Efter nästa sync-calendars-körning (var 6:e timme):
-- SELECT count(*) FROM schedule_entry WHERE type='external';
--   → > 0 för konton med kopplad Google-kalender (beviset på att importen
--     faktiskt var trasig och nu fungerar)
