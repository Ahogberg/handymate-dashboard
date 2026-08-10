-- ============================================================================
-- v111 — index för calendar_watches_calendar_connection_id_fkey
-- ============================================================================
-- Uppföljning till v110 (typkonverteringen UUID→TEXT). Supabase
-- performance-advisorn flaggade FK:n som saknar ett täckande index direkt
-- efter att v110 kördes ("suboptimal query performance"). Rent tillägg,
-- ingen risk — bara ett index.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_calendar_watches_connection_id
  ON calendar_watches(calendar_connection_id);

-- ═══ VERIFIERING ═══
SELECT indexname FROM pg_indexes
WHERE tablename = 'calendar_watches' AND indexname = 'idx_calendar_watches_connection_id';
