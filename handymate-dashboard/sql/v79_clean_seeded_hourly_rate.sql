-- v79 — Rensa historiskt seedat AI-timpris (Andreas stickprov 2026-08-03)
-- Kör manuellt i Supabase SQL Editor. Idempotent.
--
-- Bakgrund: stickprovet visade att SAMTLIGA 21 businesses har exakt 650
-- lagrat i pricing_settings.hourly_rate — kodens gamla fallback-konstant
-- som en numera borttagen onboarding-/settingsversion persisterade vid
-- kontoskapande. Ingen levande kod skriver värdet längre (verifierat via
-- grep: quotes/new:s 650 är bara klient-state som aldrig sparas, settings-
-- sidans ekonomifält skriver default_internal_hourly_cost sedan P1.3).
--
-- Konsekvens innan denna städning: AI:n läser pricing_settings.hourly_rate
-- FÖRST (app/api/quotes/ai-generate, lib/quotes/suggest-quote-draft,
-- lib/gmail/processor, app/api/sms/incoming) — den seedade 650:an skuggar
-- kundens RIKTIGA timpris i default_hourly_rate (satt via onboardingens
-- slider). Sixsaxbygg (1150 kr/h), Andreas Bygg (1025), Bee Service (750)
-- får alla AI-offerter beräknade på 650 kr/h. Fallback-kedjan som lagades
-- i P1 (2026-08-03) når aldrig fram så länge nyckeln ligger kvar.
--
-- Åtgärd: ta bort ENDAST hourly_rate-nyckeln ur pricing_settings-JSONB:n,
-- ENDAST där värdet är exakt det seedade 650 — övriga nycklar
-- (callout_fee, vat_rate, rot_enabled m.fl.) lämnas orörda, och ett
-- eventuellt framtida MEDVETET satt timpris (≠650) skulle bevaras.

-- 1. Förhandsgranska vilka rader som berörs (ska matcha stickprovet: alla)
SELECT business_id, business_name,
       pricing_settings->>'hourly_rate' AS seedat_varde,
       default_hourly_rate AS riktigt_timpris
FROM business_config
WHERE pricing_settings->>'hourly_rate' = '650';

-- 2. Städa: ta bort nyckeln (inte hela objektet)
UPDATE business_config
SET pricing_settings = pricing_settings - 'hourly_rate'
WHERE pricing_settings->>'hourly_rate' = '650';

-- 3. Verifiering A: inga 650-rader kvar (förväntat: 0 rader)
SELECT COUNT(*) AS kvar_med_650
FROM business_config
WHERE pricing_settings->>'hourly_rate' = '650';

-- 4. Verifiering B: effektivt AI-timpris per business efter städningen —
--    samma fallback-ordning som koden (hourly_rate → default_hourly_rate
--    → 650). Kontrollera att riktiga konton nu visar sitt eget timpris
--    (Sixsaxbygg 1150, Andreas Bygg 1025, Bee Service 750 osv.).
SELECT business_id, business_name,
       COALESCE(
         (pricing_settings->>'hourly_rate')::numeric,
         default_hourly_rate,
         650
       ) AS effektivt_ai_timpris
FROM business_config
ORDER BY effektivt_ai_timpris DESC;
