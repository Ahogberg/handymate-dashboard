-- v153: Nödbroms-flagga för "en väg in" — inbound single brain (SMS).
-- Kör manuellt i Supabase SQL Editor. Idempotent (kan köras flera gånger).
--
-- BAKGRUND (etapp 1, konsolideringen "en väg in"): app/api/sms/incoming/
-- route.ts körde tidigare TVÅ hjärnor på varje inkommande SMS parallellt —
-- Mattes intent-agent (autonoma DB-mutationer + egna approval-kort + ett
-- kundsvar som aldrig fungerat, eftersom det POST:ar till /api/sms/send
-- utan auth) OCH Lisa via triggerAgentFireAndForget (den som faktiskt
-- svarar kunden idag, med alla gates: killswitch, billing, ACTION_CONTRACT,
-- nattkö, opt-out). Ovanpå det kunde Matte trigga ÄNNU en agentkörning via
-- routeToAgentWithContext, helt utan idempotensnyckel.
--
-- Denna kolumn är pilotflaggan som växlar en enskild firma över till den
-- nya, enhjärnade vägen: EN dispatch (Lisa) med deterministisk kontext
-- (kund/lead-uppslag, lediga tider, lead-skapande) förberedd i koden
-- INNAN modellen kopplas in — i stället för att lita på att modellen
-- själv väljer rätt verktyg. Matte-vägen körs, när flaggan är AV, kvar
-- i skuggläge (dryRun) för jämförelse under piloten.
--
-- Default FALSE: beteendet är oförändrat för alla befintliga kunder tills
-- någon medvetet slås över. Nödbroms tills etapp 3 gör vägen permanent
-- och den gamla Matte-SMS-vägen kan tas bort helt.

ALTER TABLE business_config ADD COLUMN IF NOT EXISTS inbound_single_brain BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN business_config.inbound_single_brain IS
  'Pilotflagga (etapp 1, "en väg in"): PÅ routar inkommande SMS genom en enda agentkörning (Lisa) med deterministisk förberedd kontext, i stället för Matte+Lisa parallellt utan idempotens mellan dem. AV (default) = oförändrat legacy-beteende, men med Mattes mutationer i skuggläge. Nödbroms tills etapp 3 gör den nya vägen permanent.';
