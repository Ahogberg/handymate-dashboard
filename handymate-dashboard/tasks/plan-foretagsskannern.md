# Actionplan: Företagsskannern (pass 1a, 2026-09-02)

Program: docs/gtm/LANSERINGSBOOST_PROGRAM.md. Repo: handymate-dashboard/.
Svensk UI, riktiga å/ä/ö, ljust tema, teal #0F766E, mobilvänligt.
Läs varje fil innan du ändrar. BÖRJA SKRIVA KOD INOM 10 MINUTER — läs bara
de filer som nämns här, utforska inte hela repot.

## Idé
En publik sida på app.handymate.se/foretagsskannern (ingen inloggning).
Besökaren laddar upp en kundlista-CSV (och valfritt en faktura-CSV från
Fortnox/Visma) — allt parsas I WEBBLÄSAREN, inget skickas till servern.
Sidan visar riktiga fynd i samma stil som onboardingens genomgång
(lib/onboarding/company-scan-rows.ts) + vad teamet gör åt varje fynd.
CTA "Skapa konto och ta med underlaget": underlaget läggs i
sessionStorage och onboardingens importsteg erbjuder att importera det.
Ingen trial, inga agenter — bara räknefrågor och ett ärligt resultat.

## Del 1 — lib/foretagsskannern/skanna.ts (ren, DOM-fri, testbar)
- `skannaKundlista(text: string)`: använd `parseCsvCustomers` från
  lib/customers/csv.ts. Returnera `{ kunder: antal, utanTelefon, utanEpost,
  dubbletter (samma normaliserade telefon eller e-post), exempelNamn: 3 }`.
  Normalisera telefon med lib/phone-normalize (samma som normalize.ts i
  launch-desk gör).
- `skannaFakturor(text: string)`: egen tolerant parser (återanvänd
  `parseCustomerCsv` för rader/rubriker); leta rubriker (case-insensitive,
  svenska/engelska): fakturanummer|invoice, förfallodatum|due, belopp|total|
  amount, betald|paid|status, kund|customer. Returnera `{ fakturor,
  oppna, forfallna, forfalletBelopp (kr), aldstaForfallnaDagar }`. Rader
  utan tolkbart belopp/datum ignoreras — aldrig gissade tal. Om ingen
  rubrik matchar ⇒ null (visa "kunde inte läsa fakturafilen").
- `byggFynd(kund, faktura, now)` → `Array<{ key, text, agent?, uppfoljning }>`
  i samma anda som buildScanRows (bara sanna rader, n>0), t.ex.
  "184 kunder hittade", "23 kunder saknar telefonnummer — Lisa kan inte nå
  dem", "7 dubbletter", "12 förfallna fakturor, 48 300 kr — Karin
  förbereder påminnelser du godkänner". Använd teamGorNarDuAktiverar-
  idiomet (egen karta här, samma ton). Tomt ⇒ [].
- `HANDOFF_KEY = 'hm_foretagsskannern_underlag'`, `skrivUnderlag(...)`,
  `lasOchRensaUnderlag()` (sessionStorage, tyst vid privat läge, samma
  mönster som app/onboarding/step2-draft.ts). Underlaget = { kunder:
  parseCsvCustomers-resultatet (max 5 000), fynd, skannatAt }. Inga
  fakturarader sparas (bara talen).

## Del 2 — app/foretagsskannern/page.tsx (publik, client component)
- Ingen auth. Layout som onboardingens ob-* klasser om de går att
  återanvända utan dashboard-layout; annars en enkel egen sida. Rubrik:
  "Se vad Handymate hittar i din firma. På tio sekunder, utan konto."
  Undertext: "Filen läses i din webbläsare och skickas ingenstans."
- Två filfält: Kundlista (CSV) obligatorisk, Fakturor (CSV) valfri, med
  "Så exporterar du från Fortnox/Visma" som utfällbar text (kort, ärlig).
- Efter parsning: fynden animeras in rad för rad (samma känsla som
  components/tour/CompanyScan.tsx men utan nätverk), sedan två knappar:
  "Skapa konto och ta med underlaget" → skrivUnderlag + router.push
  ('/registrera?via=skanner') och "Börja om".
- Fel: fil > 2 MB, ingen rubrik, 0 rader ⇒ svensk feltext, inga kraschar.
- Ingen tracking utöver ett anrop POST /api/foretagsskannern/spar (Del 4).
- Lägg sidan i middleware/robots om publika sidor listas någonstans
  (kolla app/jamfor som förebild). Titel/metadata på svenska.

## Del 3 — handoff till onboardingen
- app/onboarding/components/StepImportData.tsx: vid mount, om
  lasOchRensaUnderlag() ger kunder ⇒ visa en ruta "Du har N kunder från
  Företagsskannern" med knapp "Importera dem" som kör samma POST
  /api/customers/import som CSV-vägen (samma kvitto), och "Hoppa över".
  Rör inte Fortnox-vägen.
- app/onboarding/page.tsx: variant-stämpeln i saveProgress
  (`variant: studioMode ? 'studio' : 'classic'`) ska bli 'skanner' när
  URL:en vid första laddning har ?via=skanner ELLER när underlaget fanns —
  läs hur variant normaliseras i app/api/onboarding/route.ts
  (normaliseraVariant) och lib/onboarding/funnel.ts (OnboardingVariant) och
  lägg till 'skanner' där. Uppdatera tests/onboarding-funnel.spec.ts om
  varianttypen låses.
- app/registrera: om ?via=skanner finns, behåll parametern in i /onboarding
  (läs hur registrera navigerar vidare).

## Del 4 — spår utan personuppgifter
- app/api/foretagsskannern/spar/route.ts (POST, publik): body
  { steg: 'skannad' | 'konto', kunder: number, fakturor: number }.
  Fail-closed IP-tak via checkPublicRateLimitDb (lib/rate-limit-db.ts)
  30/h, honeypot-fält `_hp` som storefront/contact. Skriver en rad i
  automation_activity? NEJ (kräver business_id). Skriv i stället till
  tabellen platform_health_check? NEJ. Använd `gtm_activity`? NEJ. Lösning:
  console.info + Sentry-breadcrumb via rapporteraTillSentry (lib/
  observability/sentry.ts) med nivå 'info' — ingen ny tabell i detta pass.
  Lägg rutten i PUBLIC_BY_DESIGN i tests/facit-route-auth-inventory.spec.ts
  med motivering + i KRAVER_PUBLIKT_TAK.

## Facit: tests/foretagsskannern.spec.ts (browserlöst)
- skannaKundlista: fixtur med 5 rader (2 utan telefon, 1 dubblett på
  telefon 070-1234567 vs +46701234567) ⇒ exakta tal.
- skannaFakturor: Fortnox-liknande rubriker ⇒ öppna/förfallna/belopp
  exakt; okända rubriker ⇒ null; ogiltiga belopp ignoreras.
- byggFynd: bara sanna rader; tomt ⇒ []; texterna innehåller talen.
- sidan: ingen fetch av filer till servern (källskanning: inga `fetch(`
  med filinnehåll; enda fetch är /api/foretagsskannern/spar), texten
  "skickas ingenstans", HANDOFF_KEY används, router.push('/registrera?via=skanner').
- StepImportData: läser lasOchRensaUnderlag och POST:ar till
  /api/customers/import.
- spar-rutten: checkPublicRateLimitDb + _hp; inventariet uppdaterat.
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/foretagsskannern.spec.ts tests/onboarding-funnel.spec.ts tests/customer-csv.spec.ts tests/customer-import-receipt.spec.ts tests/facit-route-auth-inventory.spec.ts tests/onboarding-setup-studio.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Inga commits. Rapportera ändrade filer, exakta testsiffror, avvikelser.
