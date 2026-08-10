-- ============================================================================
-- v110 — calendar_watches.calendar_connection_id: typmismatch UUID vs TEXT
-- ============================================================================
-- Google-synk-diagnosen 2026-08-10 (tasks/google-synk-diagnos-2026-08-10.md,
-- systemfel 3): calendar_connection.id är TEXT (t.ex. "gcal_..."), men
-- calendar_watches.calendar_connection_id är UUID sedan sql/v38_calendar_realtime.sql.
-- Varje insert i calendar_watches (registerCalendarWatch i
-- lib/google-calendar-watch.ts) failar därför tyst — Postgres kan aldrig
-- casta ett TEXT-id som "gcal_1234_abc" till UUID. Realtidswebhooken ser
-- sedan aldrig en matchande rad och loggar "Unknown channel" för ALLA
-- företag, inte bara enskilda konton.
--
-- FK:n läggs NOT VALID (samma mönster som sql/v87 och sql/v107): befintliga
-- (troligen redan trasiga/tomma) rader blockerar inte konverteringen,
-- valideras separat när det passar.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

-- ── 1. Kolumntypen ─────────────────────────────────────────────────
ALTER TABLE calendar_watches
  ALTER COLUMN calendar_connection_id TYPE TEXT USING calendar_connection_id::text;

-- ── 2. FK mot calendar_connection.id (NOT VALID — validera separat) ─
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'calendar_watches_calendar_connection_id_fkey') THEN
    ALTER TABLE calendar_watches
      ADD CONSTRAINT calendar_watches_calendar_connection_id_fkey
      FOREIGN KEY (calendar_connection_id) REFERENCES calendar_connection(id) ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

-- ═══ VERIFIERING ═══
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'calendar_watches' AND column_name = 'calendar_connection_id';

SELECT conname, pg_get_constraintdef(oid)
FROM pg_constraint
WHERE conname = 'calendar_watches_calendar_connection_id_fkey';
