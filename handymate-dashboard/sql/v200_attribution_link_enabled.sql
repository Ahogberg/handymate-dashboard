-- ============================================================================
-- v200 — Rekommendationslänken i "Skickat via Handymate"-stämpeln (2026-09-02)
-- ============================================================================
-- Alla kundvända dokument och mejl (offert, faktura, kundportal, e-post)
-- stämplas med "Skickat via Handymate" där ordet Handymate länkar till
-- företagets rekommendationssida /via/<referral_code>
-- (lib/branding/attribution.ts, lib/referral/codes.ts).
--
-- Den här kolumnen låter företaget stänga av LÄNKEN — texten visas alltid.
-- Default true: stämpeln med länk är på för alla konton tills ägaren
-- uttryckligen stänger av den i Inställningar → Google Recensioner.
--
-- Servern tål att kolumnen saknas: helpern tolkar undefined/null som PÅ
-- (`attribution_link_enabled !== false`), och Inställningar sparar fältet i
-- en egen update som bara loggar en varning om kolumnen inte finns än.
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS attribution_link_enabled BOOLEAN DEFAULT true;

COMMENT ON COLUMN business_config.attribution_link_enabled IS
  'När true länkar ordet Handymate i "Skickat via Handymate" (offerter, fakturor, kundportal, mejl) till företagets rekommendationssida /via/<referral_code>. Texten visas alltid; false stänger bara av länken. Default true.';

-- ═══ VERIFIERING ═══
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'business_config' AND column_name = 'attribution_link_enabled';
-- → boolean, true
