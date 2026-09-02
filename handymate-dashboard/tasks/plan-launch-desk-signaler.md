# Actionplan: Webbplatssignaler i Launch Desk (pass 1b, 2026-09-02)

Program: docs/gtm/LANSERINGSBOOST_PROGRAM.md. Repo: handymate-dashboard/.
Svenska kommentarer/UI, riktiga å/ä/ö. Läs varje fil innan du ändrar.
BÖRJA SKRIVA KOD INOM 10 MINUTER — läs bara filerna som nämns här.
Rör INTE app/foretagsskannern, StepImportData eller lib/foretagsskannern
(ett parallellt pass äger dem).

## Idé
För varje importerat Launch Desk-konto med `website` läser vi kontots
EGEN sajt (bara den, aldrig kataloger) med den SSRF-skyddade hämtning som
redan finns, och härleder deterministiska signaler utan AI. Signalerna
sparas i `gtm_account.brief_source_snapshot.signals` (JSONB utan CHECK —
ingen migration) och AI-utkastet (lib/launch-desk/brief.ts) öppnar med
den starkaste signalen, ur deras egen sajt. Volym och personlighet.

## Del 1 — lib/launch-desk/signaler.ts (ren, testbar)
- `harledSignaler(text: string, html: string, now: Date)` →
  `Array<{ key, label, evidence, styrka: 1|2|3 }>` med nycklar:
  - `ingen_bokning`: inga ord som boka|bokning|onlinebokning|kalender +
    inget formulär (`<form`) ⇒ styrka 2
  - `bara_telefon`: telefonnummer finns men ingen e-post/formulär ⇒ 2
  - `svarstid`: "svarar inom 24/48 timmar|återkommer" ⇒ 1
  - `gammalt_artal`: ©-år eller "uppdaterad" äldre än now−2 år ⇒ 1
  - `sasong`: sommarstängt|semesterstängt|vinterstängt ⇒ 1
  - `anstaller`: "vi söker|lediga tjänster|rekryterar|anställer" ⇒ 3
  - `rot_nämns`: rot|rut-avdrag nämns ⇒ 1 (positivt: de gör privatjobb)
  - `recensioner`: "reco|trustpilot|google recensioner|omdömen" ⇒ 1
  - `tjanster`: lista av 3–8 tjänsteord (samma keyword-lista som
    lib/launch-desk/scoring.ts:8–11 + branschord) ⇒ 1
  Evidence = citatet (max 120 tecken) ur texten. Ingen signal utan citat.
- `valjOppning(signaler)` → den starkaste signalen (styrka desc, sedan
  ordningen ovan) eller null.
- Typ `GtmSignal` + `GtmSignalSnapshot = { fetched_at, url, signals, text_chars }`.

## Del 2 — app/api/admin/launch/accounts/[id]/signaler/route.ts (POST, isAdmin)
- Hämta kontot, kräv `website`. Normalisera med normalizeWebsiteUrl och
  blockera privata/reserverade adresser med isBlockedHostname/
  isPrivateOrReservedIp (lib/onboarding/website-scrape.ts) — samma
  SSRF-skydd som app/api/onboarding/scrape-website/route.ts (läs den och
  återanvänd dess hämtning, bryt ut till en delad helper om den är
  inline). Timeout 8 s, max 1 MB, htmlToExtractableText.
- Kör harledSignaler, spara `brief_source_snapshot = { ...befintligt,
  signals: snapshot }` (läs befintligt först, skriv aldrig över andra
  nycklar). Svara med snapshoten. logAdminAction.
- Fel (hämtning misslyckas) ⇒ 200 med { ok: false, reason } och
  snapshot { fetched_at, url, signals: [], error } så UI:t kan visa
  "Sajten gick inte att läsa".
- Lägg rutten i tests/facit-route-auth-inventory.spec.ts om
  inventariet kräver (isAdmin är känd grind).
- app/api/admin/launch/signaler/batch/route.ts (POST, isAdmin): kör samma
  för upp till 25 konton i status imported/qualified som saknar
  snapshot.signals, sekventiellt, returnerar antal ok/fel. Ingen cron i
  detta pass.

## Del 3 — brief.ts läser signalerna
- `buildBriefSourceSnapshot`: ta med `signals` (max 5, label+evidence).
- Prompten: om signaler finns, instruera modellen att ÖPPNA med den
  starkaste (valjOppning) och citera deras egen formulering, aldrig
  hitta på något som inte står i evidence. `opening_angle` ska nämna
  signalen. Utan signaler: som i dag.
- Lägg till `brief_source_snapshot?: Record<string, unknown>` i
  GtmAccount-typen (lib/launch-desk/types.ts).
- Kostnadsmätning på brief-anropet: meterDirectLlmCall finns i
  lib/agents/shared/cost-guard.ts men kräver businessId. Lägg en
  konstant HUS_BUSINESS_ID = process.env.HANDYMATE_HOUSE_BUSINESS_ID och
  mät bara om den finns (fail-soft, annars som i dag). Dokumentera
  variabeln i .env.local.example.

## Del 4 — UI i app/admin/launch/page.tsx (AccountDrawer)
- Ny sektion "Signaler från deras sajt" ovanför "Personligt
  kontaktunderlag": knapp "Läs sajten" (POST signaler), lista med
  label + citat + styrka som prickar, tid för hämtning, felläge. Knapp
  "Läs 25 sajter" i listvyn (batch) med resultat.
- Utkastet visar vilken signal det öppnade med (opening_angle).

## Facit: tests/launch-desk-signaler.spec.ts (browserlöst)
- harledSignaler: fixtur-HTML per signal ⇒ exakt nyckel + citat; sida med
  bokningsformulär ⇒ ingen ingen_bokning; ingen signal utan evidence;
  valjOppning väljer styrka 3 före 2.
- signaler-rutten: isAdmin, isBlockedHostname/isPrivateOrReservedIp
  används, brief_source_snapshot merge (inte overwrite) — källskanning.
- brief.ts: snapshot innehåller signals, prompten innehåller "öppna med"
  och "aldrig hitta på"; mätningen bara med HUS_BUSINESS_ID.
Uppdatera tests/launch-desk*.spec.ts som låser snapshotens form.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/launch-desk-signaler.spec.ts $(ls tests | grep -i "launch" | sed 's#^#tests/#' | tr '\n' ' ') tests/facit-route-auth-inventory.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits. Rapportera ändrade filer, exakta testsiffror, avvikelser.
