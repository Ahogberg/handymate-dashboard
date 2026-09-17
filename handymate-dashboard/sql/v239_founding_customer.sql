-- v239: vem är grundarkund? (docs/gtm/grundarerbjudandet-beslut-2026-09-13.md §4)
--
-- isFoundersOfferAvailable() räknar platser vid köptillfället och returnerar
-- en boolean. Den lästes i app/api/billing/route.ts och app/api/onboarding/
-- route.ts — och ingenting skrevs. Grundarstatus var ett ögonblick som
-- passerade: inget fält sa att just den här kunden fick livstidspris.
--
-- Ett löfte om LIVSTID som inte är nedskrivet per kund är det svagaste
-- stället i hela konstruktionen. Om tolv månader, när en kund hävdar sitt
-- låsta pris, finns annars bara Stripe-historik och gissningar.
--
-- Beslutsfilen: "före första riktiga grundarkunden, inte efter". Verifierat
-- 2026-09-17 att ingen riktig kund betalar ännu (den enda aktiva
-- prenumerationen är Andreas eget konto).
--
-- ═══ STÄMPLINGEN ═══
--
-- Skrivs av det delade betalflödet (lib/billing/write-billing-update.ts) när
-- checkout-sessionen bar metadata.founders = 'true' — dvs. erbjudandet var
-- tillgängligt i det ögonblick kunden sa ja. Skrivs EN gång: uppdateringen
-- filtrerar på founding_at IS NULL, så en senare checkout (uppgradering,
-- omteckning) aldrig skriver över den ursprungliga stämpeln.
--
-- Priset lagras i hela kronor exkl. moms — samma enhet som PLAN_PRICES_SEK
-- och getPlanYearlyPrice(). Det är LISTPRISET vid köpet för vald plan och
-- intervall, inte vad Stripe drog (rabattkoder ändrar det senare, inte det
-- låsta priset).
--
-- Kör: hela filen. Idempotent.

ALTER TABLE public.business_config
  ADD COLUMN IF NOT EXISTS founding_at timestamptz,
  ADD COLUMN IF NOT EXISTS founding_plan text,
  ADD COLUMN IF NOT EXISTS founding_interval text,
  ADD COLUMN IF NOT EXISTS founding_price_sek integer;

COMMENT ON COLUMN public.business_config.founding_at IS
  'När kontot blev grundarkund (erbjudandet var tillgängligt vid köpet). Skrivs en gång, aldrig över.';
COMMENT ON COLUMN public.business_config.founding_price_sek IS
  'Listpriset exkl. moms, hela kronor, för founding_plan × founding_interval vid köpet. Det låsta priset.';
