-- ============================================================================
-- v109 — email_inbound_route.last_received_at: live-kvitto i mailguiden
-- ============================================================================
-- Epic B, del av B5 (tasks/todo.md). Webhooken (app/api/email/inbound)
-- skriver denna kolumn vid VARJE lyckad routningsträff — både när ett mail
-- blir ett lead OCH när det är Gmails vidarebefordringsmail-bekräftelse.
-- Settings-kortet visar "Senast mottaget: <tid>" eller "Väntar på första
-- mailet" utifrån värdet — kunden ser att kopplingen faktiskt fungerar
-- innan första riktiga leadet kommer in.
--
-- Best-effort i koden: saknas kolumnen (migrationen ej körd) sväljs felet
-- tyst i webhooken, precis som routningsuppslaget i v106.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

ALTER TABLE email_inbound_route ADD COLUMN IF NOT EXISTS last_received_at TIMESTAMPTZ;

COMMENT ON COLUMN email_inbound_route.last_received_at IS
  'Senaste lyckade routningsträff (lead ELLER Gmail-bekräftelsemail). Skrivs av app/api/email/inbound. NULL = inget mail mottaget än på adressen.';

-- ═══ VERIFIERING ═══
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'email_inbound_route' AND column_name = 'last_received_at';
