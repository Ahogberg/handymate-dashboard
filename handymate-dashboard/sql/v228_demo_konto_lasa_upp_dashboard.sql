-- Demokontot stod parkerat mitt i en onboarding-replay och kom aldrig in i
-- dashboarden.
--
-- Bakgrund (2026-09-10). demo@handymate.se är biz_0lovw5vcwzqn (Svensson
-- Bygg AB) — INTE biz_demo_ekstrom, som är ett separat, helt tomt konto som
-- landningssidans demo-offert skriver till.
--
-- Mot produktionsdatan stod inloggningskontot på onboarding_step = 2 med
-- onboarding_completed_at = NULL. Dashboardgrinden i app/dashboard/layout.tsx
-- kräver onboarding_completed_at ELLER onboarding_step >= 9, och skickar
-- annars vidare till /onboarding. Att logga in som demo@handymate.se
-- hamnade alltså i onboardingguiden, inte i produkten — bakom grinden låg
-- 90 godkännandekort, 146 notiser och 11 affärer som ingen kunde se.
--
-- Det är inget fel i mekanismen. POST /api/admin/demo-onboarding-replay
-- ("Visa onboardingen" i PresenterBar) sätter avsiktligt completed_at till
-- NULL och step till 1 så en presentatör kan gå igenom flödet. Kontot var
-- kvarlämnat mitt i en sådan replay som aldrig kördes klart.
--
-- Den här filen gör samma sak som finalize (POST /api/onboarding) gör i
-- slutet av flödet: step 10 + completed_at. Replay-knappen fungerar
-- oförändrat efteråt och kan nollställa igen när som helst.
--
-- Avgränsat till ett business_id och till just det halvfärdiga läget:
-- WHERE-villkoret rör inget konto som redan är klart eller som står mitt i
-- en pågående replay på steg 1.

UPDATE business_config
SET onboarding_step = 10,
    onboarding_completed_at = NOW(),
    updated_at = NOW()
WHERE business_id = 'biz_0lovw5vcwzqn'
  AND onboarding_completed_at IS NULL
  AND onboarding_step = 2;
