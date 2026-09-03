# Actionplan: lanseringssidan + tidskalkylen (2026-09-03, Andreas: "Bygg detta")

Bakgrund och beslut, i tur och ordning — läs dem, de styr varje val nedan:

1. Företagsskannern (app/foretagsskannern) duger INTE som lead magnet överst
   i tratten. Den kräver en CSV-export ur Fortnox/Visma (fyra menyklick, på
   dator) och att en främling laddar upp sin kundlista elva dagar innan vi
   ens finns. Filen lämnar visserligen aldrig webbläsaren — men besökaren kan
   inte verifiera det påståendet, så det är inget argument. Skannern blir
   STEG TVÅ för den redan intresserade, inte första mötet.
2. I stället: en kalkyl som räknar på BESÖKARENS EGNA TAL. 60 sekunder på en
   telefon, inget att ladda upp, inget att lita på oss med.
3. E-postfångst som FAKTISKT SPARAR, i båda ändarna. Dagens skanner sparar
   ingenting alls (bara en anonym Sentry-breadcrumb), och HTML-utkastet till
   nedräkningssidan sparade heller ingenting men sa ändå "Tack! Vi hörs den
   14:e" — ett löfte till en människa som ingenting kunde hålla. Det får
   aldrig hända igen.
4. Nedräkningssidan blir hero fram till lansering. Timern går till
   14 september 2026 kl 09:00 (+02:00, Sverige är på sommartid).

Repo: handymate-dashboard/. Next.js 14 App Router, Tailwind, svensk UI med
riktiga å/ä/ö, ljust tema, teal #0F766E som primärfärg, mobilförst.
BÖRJA SKRIVA KOD INOM 10 MINUTER. Ingen migration behövs. Inga commits.

---

## ÄRLIGHETSREGLERNA — bryt aldrig mot dessa, de är hela poängen

**A. Varje tal i kalkylens svar ska gå att spåra till något besökaren själv
skrivit in.** Fällan med räknesnurror är en insmugen branschsiffra ("i snitt
förlorar hantverkare 23 %") presenterad som ett faktum om just deras firma.
Har vi inte en siffra så FRÅGAR vi efter den — vi antar den aldrig. Därför är
fråga 3 nedan (hur många av tio missade samtal som hade blivit jobb) en
FRÅGA och inte en konstant. Skriv ut "Dina siffror, vår räkning. Vi har inte
lagt till något." under resultatet, och se till att det är sant.

**B. LISA SVARAR INTE I TELEFON.** Hon FÅNGAR kontakten. Det kanoniska
underlaget är lib/agents/team.ts: "Fångar samtalen du missar och hanterar
kundförfrågningar". Tillåtet: "fångar samtalet du missar", "tar emot ärendet",
"ser till att numret inte försvinner". FÖRBJUDET: "svarar i telefonen",
"pratar med kunden", "ringer tillbaka", "sköter samtalet" — allt som låter
som att hon för ett samtal. Samma försiktighet gäller alla sex.

**C. Teamet FÖRBEREDER, hantverkaren GODKÄNNER.** De utgående automationerna
är avstängda som standard (matte_customer_reply_enabled, automation_settings,
agents_globally_paused). Ingen agent kontaktar en kund på egen hand. Skriv
aldrig copy som lovar autonom kundkontakt.

**D. Inga löften om resultat i deras affär.** Inte "vi effektiviserar ditt
företag", inte "du sparar X". Beskriv vad teamet GÖR, låt kalkylens siffror
tala. Rollerna ordagrant ur lib/agents/team.ts:
  Matte (Chefsagent) — koordinerar teamet och pratar med dig
  Karin (Ekonom) — håller koll på fakturor och betalningar
  Hanna (Marknadschef) — sköter kampanjer och nya kunder
  Daniel (Säljare) — följer upp offerter och leads
  Lars (Projektledare) — koordinerar projekt och bokningar
  Lisa (Kundservice) — fångar samtalen du missar och hanterar kundförfrågningar

---

## Del 1 — POST /api/landing/vantelista

Ny fil: app/api/landing/vantelista/route.ts. Skriver till `landing_leads`
(finns redan i produktion, rör INTE schemat). Kolumner: id, email (NOT NULL),
name, phone, company_name, source, payload jsonb, created_at.

Kopiera säkerhetsmönstret RAKT AV från app/api/foretagsskannern/spar/route.ts:
- `export const dynamic = 'force-dynamic'`
- honeypot `_hp` ifyllt ⇒ returnera `{ success: true }` utan att skriva
- `checkPublicRateLimitDb` (fail-closed) på `hashClientIp(request)`,
  10 anrop/timme, 429 med Retry-After
- try/catch, svenska felmeddelanden, aldrig ett stacktrace ut

Body: `{ email, phone?, source, payload?, _hp? }`.
- `source` måste vara en av `'kalkyl' | 'skanner' | 'nedrakning'` — annars 400.
- E-postvalidering: kräv ett tecken före @, en punkt efter, ingen blanksteg.
  `includes('@')` DUGER INTE (HTML-utkastet släppte igenom "a@").
- `payload` sparas bara om det är ett objekt; klipp till max 2 kB.
- Dubblett på samma e-post + source inom 24 h ⇒ svara `{ success: true }`
  utan en ny rad (läs först, skriv sen — ingen ny unik-constraint).

## Del 2 — lib/lansering/kalkyl.ts (ren modul, ingen I/O, ingen DOM)

Detta är räknelogiken, separerad så facit kan testa den utan att rendera.

```ts
export interface KalkylSvar {
  adminTimmarPerVecka: number   // fråga 1
  missadeSamtalPerVecka: number // fråga 2
  avTioBlirJobb: number         // fråga 3, 0-10
  jobbvarde: number             // fråga 4, kr
}
export interface KalkylResultat {
  adminTimmarPerAr: number
  adminVeckorPerAr: number      // arbetsveckor à 40 h, en decimal
  missadeSamtalPerAr: number
  forloradeJobbPerAr: number
  forloradIntaktPerAr: number
}
export function raknaUt(svar: KalkylSvar): KalkylResultat
```
- 52 veckor. `forloradeJobbPerAr = round(missadeSamtalPerAr * avTioBlirJobb / 10)`.
- Negativa eller icke-ändliga tal klampas till 0. Inga NaN får nå UI:t.
- INGA andra konstanter än 52 och 40. Varje annan siffra kommer från svaren.
- `formateraKr(n)` med sv-SE-gruppering, inga decimaler.

## Del 3 — app/rakna/page.tsx (kalkylen, publik, ingen inloggning)

Fyra frågor, EN i taget (mobilförst — inte ett formulär med fyra fält).
Progressindikator 1/4. Stora träffytor, siffertangentbord
(`inputMode="numeric"`), snabbval som chips så man slipper skriva:

1. "Hur många timmar i veckan lägger du på papper och telefon — efter att
   jobbet är klart?"  chips: 2 / 5 / 8 / 12 / 15+
2. "Ungefär hur många samtal missar du i veckan när du står i arbete?"
   chips: 1 / 3 / 5 / 10 / 15+
3. "Av tio missade samtal — hur många tror du hade blivit ett jobb?"
   chips: 1 / 2 / 3 / 5   ← Ingen förvald. Vi gissar aldrig åt dem.
4. "Vad är ett vanligt jobb värt för dig?"
   chips: 5 000 / 15 000 / 40 000 / 100 000 kr
Alla chips ska gå att skriva över med ett eget tal.

Resultatvyn: uträkningen SYNLIG, aldrig bara slutsumman. Ungefär:

  Du sa 8 timmar i veckan.
  → 416 timmar om året. Tio arbetsveckor.

  Du sa 5 missade samtal i veckan, och att 2 av 10 hade blivit jobb.
  → 52 jobb om året som aldrig ringde tillbaka.
  → 1 040 000 kr, med ditt eget jobbvärde.

  Dina siffror, vår räkning. Vi har inte lagt till något.

Under det: teamet (sex porträtt) med rollerna ur regel D. Lisa-raden ska
handla om att FÅNGA, inte svara.

Sedan e-postfångsten (Del 4) med `source: 'kalkyl'` och `payload` = de fyra
svaren + de fem uträknade talen. Det är det som gör listan värd något: du
ringer inte en adress, du ringer någon som själv sagt vad det kostar hen.

Sist, nedtonat: "Vill du se dina verkliga siffror i stället för uppskattade?
Ladda upp din kundlista — den lämnar aldrig din telefon." → /foretagsskannern

Porträtt: `public/marketing/content-library-v1/avatars/<namn>.png` via
next/image (Vercel optimerar — filerna är 0,7–1,7 MB råa, ladda dem ALDRIG
med en vanlig <img>). Ange width/height så inget hoppar.

## Del 4 — components/lansering/VantelistaForm.tsx

Delad komponent, används på tre ställen. Props: `source`, `payload?`,
`rubrik?`.
- Fält: e-post (obligatorisk), telefon (frivillig, märk den "frivillig").
  Dolt honeypot-fält `_hp` med `tabIndex={-1}` och `aria-hidden`.
- Knapp: "Hör av er". Under: "Ett mejl, den 14 september. Inget nyhetsbrev."
- Kvitto EFTER att servern svarat 200 — ALDRIG optimistiskt. Misslyckas
  anropet ska det synas: "Det gick inte att spara — försök igen." Det var
  precis det HTML-utkastet gjorde fel.
- Kvittotext: "Vi hör av oss den 14 september — med ditt team på plats."
  På kalkylsidan, där vi har talen: "… och de här siffrorna redan inlagda."

## Del 5 — skannern får samma fångst
app/foretagsskannern/page.tsx:
- På UPPLADDNINGSVYN, nedtonat under rutorna: "Sitter du i telefonen? Lämna
  din adress så hör vi av oss den 14:e." → VantelistaForm, `source: 'skanner'`.
  (Utan den tappar vi varenda mobilbesökare — de kan inte exportera en CSV.)
- På RESULTATVYN: VantelistaForm med `source: 'skanner'` och `payload` =
  { kunder, fakturor }. Lägg den FÖRE "Skapa konto"-knappen men gör
  kontoknappen visuellt primär.
- Rör inte parsningen, räknandet eller sparRaknare.

## Del 6 — app/page.tsx blir lanseringssidan

Porta HTML-utkastet (en Claude Design-komponent, `x-dc`/`DCLogic`) till en
React-komponent. Behåll: mörk teal-botten (#0f2e2a), nedräkningen, teamet i
gråskala som får färg vid lansering, "NU ÄR VI LIVE"-läget.

- Måltid: `new Date('2026-09-14T09:00:00+02:00')`. Lägg den som en exporterad
  konstant `LANSERING` i lib/lansering/kalkyl.ts så facit kan läsa den.
- TA BORT texten "LANSERING · MÅNDAG 14 SEPTEMBER 06:00" — timern räcker
  (Andreas uttryckligen). Rubriken "Framtidens hantverksföretag vaknar snart"
  och brödtexten står kvar, men brödtextens "Den 14 september hälsar du på
  ditt nya team" skrivs om utan datum.
- PRIMÄR CTA: "Räkna ut vad det kostar dig" → /rakna. INTE en e-postruta.
- SEKUNDÄR, nedtonad: VantelistaForm med `source: 'nedrakning'`.
- Hydrering: nedräkningen får inte orsaka mismatch. Rendera serversidan med
  ett stabilt värde och starta intervallet i useEffect; visa aldrig en tom
  ruta första framen.
- Efter måltiden flippar sidan automatiskt till live-läget (teamet i färg,
  CTA "Kom igång" → /registrera). Ingen manuell åtgärd ska behövas.
- Behåll en diskret "Logga in"-länk till /dashboard uppe till höger —
  befintliga användare landar här och får inte bli strandsatta.

## UI-kravet
Andreas: "riktigt snygg UI". Det betyder inte fler effekter — det betyder
omsorg: en tydlig typografisk hierarki (nedräkningens siffror är sidans
tyngsta element), generöst luft, mjuka övergångar mellan kalkylens steg
(respektera `prefers-reduced-motion`), och att resultatet känns som ett
besked — inte som en tabell. Kontrast minst 4.5:1 mot den mörka bottnen.
Testa 375 px bredd; ingenting får skrolla i sidled.

## Facit: tests/lansering-kalkyl.spec.ts (browserlöst)
- `raknaUt`: kända indata ⇒ kända utdata; 0 in ⇒ 0 ut, aldrig NaN; negativa
  och orimliga tal klampas; `avTioBlirJobb: 0` ⇒ noll förlorade jobb.
- Källskanning kalkyl.ts: filen innehåller INGA andra numeriska konstanter än
  52 och 40 (regel A — ingen insmugen branschsiffra). Skriv testet så det
  faktiskt läser filen och letar efter siffror.
- `LANSERING` är 2026-09-14T09:00:00+02:00.
- Källskanning app/page.tsx: innehåller varken "06:00" eller "LANSERING ·".
- Källskanning ärlighet: varken app/page.tsx, app/rakna/page.tsx eller
  VantelistaForm innehåller "svarar i telefon", "ringer tillbaka",
  "pratar med kunden" eller "effektivisera" (regel B och D).
- Rutten: vantelista/route.ts har `force-dynamic`, `_hp`, honeypot före all
  skrivning, `checkPublicRateLimitDb`, och `.from('landing_leads')`.
- VantelistaForm sätter kvittot först efter ett lyckat svar (källskanning:
  ingen `setSkickat(true)` före `await`/`res.ok`).
Lägg facit-namnet sist i BÅDE `test:contracts` i package.json och listan i
../.github/workflows/contracts.yml.

## Verifiering
```
npx tsc --noEmit
npx playwright test tests/lansering-kalkyl.spec.ts --no-deps --project=chromium --reporter=line
npm run test:contracts
npx next build
```
Rött som var rött före passet: rapportera, tvinga inte grönt. Rapportera
ändrade filer, exakta testsiffror, och särskilt allt du var osäker på eller
avvek från.
