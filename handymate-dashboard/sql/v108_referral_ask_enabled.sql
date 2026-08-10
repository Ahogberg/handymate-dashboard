-- ============================================================================
-- v108 — Referral-ask opt-in: FÅR rekommendationslänken bifogas i SMS:et?
-- ============================================================================
-- Epic C, spel 1 (tasks/hanna-sales-engine-v2-spec.md). Spec-avsnittet
-- "A. Per-spel auto-skicka (opt-in)" beskriver en JSONB-flagga
-- (hanna_autosend) för att låta Hanna SKICKA UTAN GODKÄNNANDE — det är en
-- annan fråga (och uttryckligen sekvenserad till v2.2, EFTER spel 1 enligt
-- specens egen "Sekvens"-lista). Den här kolumnen svarar på en tidigare
-- fråga i kedjan, som specen INTE tar ställning till: kombinationen av
-- spel 1 (rekommendationslänk) och spel 2 (recensions-SMS) i SAMMA
-- utskick. Det är ett byggbeslut för denna increment (app/api/cron/
-- review-requests) — inte något specen beskriver. Godkännande-kedjan för
-- SJÄLVA utskicket är oförändrad (pending_approvals, precis som innan);
-- den här flaggan styr bara om länkraden får bifogas till den texten.
--
-- Default false följer specens bärande princip #2: "Gatad som standard."
-- Måste sättas true explicit per företag (i dag: manuellt via SQL/admin —
-- ingen inställnings-UI byggd i denna increment).
--
-- Kör via Supabase MCP efter godkännande i chatten. Idempotent.
-- ============================================================================

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS referral_ask_enabled BOOLEAN DEFAULT false;

COMMENT ON COLUMN business_config.referral_ask_enabled IS
  'Epic C spel 1: när true bifogas kundens personliga rekommendationslänk (/rekommendera/[token], lib/referral/link.ts) i recensions-SMS:et (app/api/cron/review-requests). Default false — måste aktiveras uttryckligen per företag.';

-- ═══ VERIFIERING ═══
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'business_config' AND column_name = 'referral_ask_enabled';
