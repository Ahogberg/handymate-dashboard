# Rapport — rivning B, C, D (natten 2026-09-17)

Körd av en agent enligt `tasks/plan-rivning-bcd-2026-09-17.md`, utan att fråga
Andreas (han sover). Uppdateras löpande, ett paket per commit.

## Status i korthet

- **Paket B: KLART, grönt, pushat.** Rad 2.1–2.6, 2.10 gjorda.
- **Paket C: KLART, grönt, pushat.** Rad 2.12–2.17 gjorda, egen commit.
- **Rad 2.20: KLART, grönt, egen commit efter paket C.** Ursprungligen
  hoppad över i paket B av en felaktig motivering — rättad, se
  "Rättelse"-avsnittet mellan paket C och paket D.
- **Paket D: KLART (säkra raderna), grönt, pushat.** Rad 3.1, 3.2, 3.3, 3.4,
  3.8, 3.9, 3.11 gjorda. Rad 3.6 HOPPAD (motiverad nedan — planens eget
  villkor för att göra den slog inte in). Rad 3.12 verifierad, ingen kod
  behövde skrivas.
- Fynd om 3.5/3.7/3.10/3.13 (görs inte i natt) är listade längst ner, hämtade
  ur inventeringsdokumentet — ingen ny kod skriven för dem.

## Paket B — dubbletterna (2.1–2.6, 2.10, 2.20)

### Vad som revs/slogs ihop

- **2.1** `QuoteNewCustomerSection.tsx`: titel- och beskrivningsfälten borttagna
  ur kortet (redigeras bara i dokumentet sedan tidigare). `validDays`/
  `setValidDays`-propparna (redan döda — inget läste dem, dubbletten togs bort
  2026-08-06) är helt borta ur interfacet.
- **2.2** Rabatt-%: fanns redan redigerbar i `QuoteDocument.tsx` (rad ~508
  innan ändringen, `EditableNumber`+`onDiscountChange`). Dubbletten i
  `QuoteTotalsSection` (ett eget nummerfält längst ner) är borta med hela
  filen.
- **2.3** `QuoteStandardTextsSection.tsx` + panelen "Mer → Villkor & texter"
  borttagna. De fyra texterna (Villkor/Ej inkluderat/ÄTA-villkor/
  Betalningsvillkor) var redan redigerbara direkt i dokumentet — det som
  saknades var standardtextväljaren (`StandardTextPicker`, "Välj
  standardtext"-knappen som hämtar en sparad text). Den är flyttad in i
  `QuoteDocument.tsx`, bredvid respektive fält, gated på `mode === 'edit'`
  och att texttypen faktiskt har sparade texter. Referens (`referencePerson`),
  kundens referens (`customerReference`) och arbetsplatsadress
  (`projectAddress`) flyttade till kundkortet — `QuoteNewCustomerSection.tsx`
  (create) och `QuoteEditCustomerSection.tsx` (edit), båda med samma state
  som förut.
- **2.4/3.12** `QuoteStylePicker` monteras inte längre i offertflödet (varken
  create eller edit) — firmadefaulten (`businessDefaultStyle`) räcker.
  **Komponenten själv är INTE raderad** — `app/dashboard/invoices/_shared/
  InvoiceEditor.tsx` använder den fortfarande för fakturans egen per-faktura-
  stil, helt utanför detta uppdrags scope (kontrollerat med grep innan någon
  radering; ett första försök att radera filen rullades tillbaka när det
  upptäcktes — se "Fel som hittades och rättades" nedan).
- **2.5/2.6** `QuoteRotSection.tsx` och `QuoteTotalsSection.tsx` borttagna.
  Avdragsväxeln (Inget avdrag/ROT/RUT, samma `applyGlobalDeductionType`-anrop
  som förut) flyttade till `QuoteDocument.tsx`:s summeringsblock, synlig bara
  i edit-läge, precis ovanför "Summa exkl. moms". Personnummer/
  fastighetsbeteckning fylls som tidigare planerat av kunden vid signering
  (den vägen fanns redan, orörd). ROT-badgen per rad i dokumentet är orörd.
- **2.10** "Mer"-raden: 6 knappar → 3 (Betalplan, Visning, Bilagor).
  `panelStatus()` (lib/quotes/panel-status.ts) trimmad till samma tre
  nycklar — `stil`/`villkor`/`rot`-logiken (inkl. personnummer-varningen) är
  borttagen, med en förklarande kommentar om var den flyttade.
- **2.20 Spara som mall — HOPPAD ÖVER, gjordes INTE.** Se motivering nedan.

### Nya/ändrade typer

- `components/quotes/document/types.ts`: ny handler
  `onDeductionTypeChange?: (type: 'rot' | 'rut' | null) => void`.
- `components/quotes/document/QuoteDocument.tsx`: två nya toppnivåprops,
  `activeDeductionType?: 'rot' | 'rut' | null` och
  `standardTexts?: Record<string, QuoteStandardText[]>` — båda optionella,
  fakturans (`InvoiceEditor.tsx`) anrop av samma komponent är oförändrat och
  påverkas inte (verifierat: `isInvoice`-grenarna rör aldrig de nya proppar).

### Rader bort (mätt med `wc -l`, `git show HEAD:<fil>` mot arbetsträdet)

| Fil | Före | Efter |
|---|---:|---:|
| `QuoteNewCustomerSection.tsx` | 223 | 237 (+14, nya referensfält) |
| `QuoteEditCustomerSection.tsx` | 109 | 160 (+51, nya referensfält) |
| `QuoteBuilder.tsx` | 2916 | 2840 (−76) |
| `QuoteEditView.tsx` | 471 | 423 (−48) |
| `QuoteDocument.tsx` | 813 | 889 (+76, avdragsväxel + textväljare) |
| `panel-status.ts` | 137 | 86 (−51) |
| `QuoteTotalsSection.tsx` | 203 | 0 (raderad) |
| `QuoteRotSection.tsx` | 103 | 0 (raderad) |
| `QuoteStandardTextsSection.tsx` | 184 | 0 (raderad) |
| **Summa** | **5159** | **4635 (−524 netto)** |

Färre rader netto än inventeringens grova gissning (~900) eftersom
avdragsväxeln och standardtextväljaren behövde en ny, om än liten, hemvist i
`QuoteDocument.tsx` i stället för att bara försvinna — värdet de bar
(bulkväxel för avdrag, snabbval av sparad text) fanns inte redan någon
annanstans, så det flyttades snarare än revs (se arbetsregeln "vad bär den
här ytan som ingen annan yta bär?").

### Facit ändrade

- `tests/quotes-mer-i-flodet.spec.ts`: skrivet om från "sex paneler monteras
  en gång" till "tre paneler monteras, de tre borttagna gör det INTE, och de
  tre filerna är raderade". Nytt test för att referensfälten nu binder i
  `QuoteNewCustomerSection` i stället för den borttagna panelen, och ett nytt
  test för att avdragsväxeln finns i `QuoteDocument.tsx`/`QuoteBuilder.tsx`.
  Completeness-delarna (hör till paket C) är **orörda**.
- `tests/quote-document-empty-state.spec.ts`: del 2 (källskanning av
  `QuoteTotalsSection.tsx`s "Att betala"-text) ersatt — testar nu att filen
  är raderad OCH att dokumentets egen "Att betala"-rad finns kvar.
- `tests/panel-status.spec.ts` (**inte i test:contracts, men i tsc-svepet**):
  testerna för villkor/ROT/stil borttagna, resten (betalplan/visning/bilagor/
  attentionCount) kvar och uppdaterade siffror.
- `tests/rot-instruktion.spec.ts`, `tests/live-project-navigation-refresh.spec.ts`,
  `tests/quote-terms-crash.spec.ts`, `tests/job-standards.spec.ts`: lästa och
  kontrollerade — ingen av dem pekar på kod som ändrats i paket B (de källskannar
  funktioner/fält som är oförändrade), så de lämnades orörda. Kördes ändå i
  fulla sviten och är gröna.
- Inget nytt facit `tests/rivning-b-dubbletter.spec.ts` skapades — de
  befintliga källskanningsfacit (`quotes-mer-i-flodet`, `quote-document-
  empty-state`) täckte samma påståenden utan en parallell fil att hålla i
  synk. Ingen ny rad behövdes i `package.json`/`contracts.yml` eftersom inga
  nya specfiler skapades, bara befintliga ändrade.

### Fel som hittades och rättades under arbetet

`components/quotes/QuoteStylePicker.tsx` raderades först rakt av (rad 2.4
säger "flytta/ta bort"), men en grep EFTER raderingen (regeln "kontrollera var
komponenten monteras innan radering", som jag av misstag körde efter i stället
för före denna fil) visade att `app/dashboard/invoices/_shared/
InvoiceEditor.tsx` fortfarande använder komponenten för fakturans egen stil —
helt utanför scope. Filen återställdes omedelbart (`git checkout --`) innan
någon test kördes eller committades. Ingen skada skedde, men det är en
påminnelse om att köra grep FÖRE varje radering, inte bara för filer som
nämns i planen.

### Mutationer (fyra, alla röda innan återställning)

1. Återinförde en `<QuoteStylePicker>`-montering i "Mer"-raden i
   `QuoteBuilder.tsx` → `quotes-mer-i-flodet.spec.ts` blev rött på
   "de tre borttagna panelerna monteras INTE längre" (1 failed, 15 passed).
   Återställt.
2. Kommenterade bort `onDeductionTypeChange` ur `liveHandlers` i
   `QuoteBuilder.tsx` → samma facit rött på "avdragsväxeln flyttade till
   dokumentets summering" (1 failed, 15 passed). Återställt.
3. Återskapade en tom `QuoteTotalsSection.tsx` på disk → BÅDA
   `quotes-mer-i-flodet.spec.ts` och `quote-document-empty-state.spec.ts`
   blev röda på "filen finns inte längre på disk" (2 failed, 24 passed).
   Filen togs bort igen.
4. Bytte ut "Att betala" mot "Kund betalar" på offertens (icke-faktura)
   summeringsrad i `QuoteDocument.tsx` → `quote-document-empty-state.spec.ts`
   rött på "dokumentets egen Att betala-rad finns kvar" (1 failed, 9
   passed). Återställt (kontrollerad med `diff` mot backup, identisk efteråt).

### Rad som hoppades över — 2.20 "Spara som mall"

**Görs INTE.** Planen säger att `[id]/page.tsx`s inline-modal (egen
`/api/quote-templates`-POST) ska slås ihop med editorns `QuoteSaveTemplateModal`
(som redan använder `SaveJobStandardFromQuote` → `/api/job-types/quote-setup`
→ `job-standard-server.ts`) till EN väg: "Spara som upplägg för jobbtypen".

`SaveJobStandardFromQuote` kräver en `jobType: string` (jobbtypens slug).
`app/dashboard/quotes/[id]/page.tsx`s `Quote`-typ (`app/dashboard/quotes/[id]/
types.ts`) har **inget `job_type`/`job_type_slug`-fält alls**, och `quotes`-
tabellen har (kontrollerat mot `sql/*.sql`, ingen `ALTER TABLE quotes ...
job_type`) **ingen sådan kolumn**. Planens egen rad säger "det parallella
passet gör redan att jobbtypen följer med" — det är en annan, pågående
sittning som INTE har landat i den här arbetskopian. Att göra sammanslagningen
nu hade antingen krävt en schemaändring (uttryckligen förbjudet: "Rör inga
tabeller, kolumner eller SQL") eller skickat ett alltid-tomt `jobType` och
tyst gjort funktionen obrukbar på detaljsidan. Ingen av delarna är rätt.
Kortet/modalen på `[id]/page.tsx` är därför **orörd** — dubbletten kvarstår
tills det parallella passet landat en jobbtyp-koppling på offerten.

### Verifiering

- `./node_modules/.bin/tsc --noEmit` → 0 fel.
- `npm run test:contracts` (miljövariabler
  `HANDYMATE_CHROMIUM_PATH`/`HANDYMATE_TEST_CHROMIUM` satta) → **2846 passed**
  (samma antal som baslinjen före ändringarna — ingen regression), körd två
  gånger (en gång direkt efter kodändringarna, en gång efter mutationstesten
  och återställningen).
- `npx next build` → `✓ Compiled successfully`. Loggen innehåller samma kända
  brus som CLAUDE.md beskriver ("Auth error: supabaseUrl is required" på
  adminsidor) — inget nytt.
- `git status --short` kontrollerad före commit — inga extra `??`-filer.

### Commit

Commit `82ee1fd9` ("Rivning B: dokumentet blir den enda platsen för rabatt,
avdrag och texter"), ovanpå nattplanens egen commit `7ba04130`. Pushad till
`origin/claude/gracious-brown-07lm99`.

## Paket C — verktygen (2.12–2.17)

Nästa agent tog vid på commit `c3511773` och körde paket C rad för rad enligt
planen, med grep-före-radering på varje borttagning.

### 2.12 — QuoteNewAIHelper bort, AI-vägen är intaget

`app/dashboard/quotes/new/components/QuoteNewAIHelper.tsx` (210 rader,
foto-analys + fritext-generering INNE i editorn) raderad. Kontrollerat
FÖRE radering: monterades bara en gång, i `QuoteBuilder.tsx`, ingen annan
läsare.

- Tomrutans "beskriv jobbet"-länk (`onOpenAiHelp` på `QuoteDocumentSurface`)
  öppnade förut panelen (`setShowAiHelper(true)`) — öppnar nu intaget
  (`setQuickMode('intake')`), liksom `?transcript=`-djuplänken (som förut
  bara fyllde och expanderade panelen; öppnar nu intaget med texten redan i
  rutan).
- `applyAiResult` (den delade konverteringsfunktionen AI-svar → radlista)
  nås fortfarande — av `buildQuickDraft` (Snabbofferten), som redan använde
  den. `analyzePhoto`/`generateFromText` (panelens EGNA anrop till
  `/api/quotes/ai-generate`) är borttagna — tre anropsställen till den
  routen blir ett.
- Dödkod som följde med ur samma yta: `generating`-state (panelens egen
  spinner-flagga, aldrig satt av något annat), `sourceImageBase64`,
  `aiTextInput`, `photoDescription`, `showAiHelper`. `photos`/
  `handlePhotoFile`/`removePhoto`/`MAX_PHOTOS` lever kvar — delas med
  intaget.
- Fynd: "Baserad på X foton"-chippen i headern (`aiPhotoCount`) hade bara en
  producent (`analyzePhoto`). För att inte tyst göra chippen permanent
  inaktiv flyttades räkningen till `buildQuickDraft` (samma
  `data.photoCount`-fält från samma API-svar) — ingen ny logik, bara samma
  räkning på den enda kvarvarande foto-vägen.

### 2.13 — QuotePackageComparison bort

`components/quotes/QuotePackageComparison.tsx` (30 rader, "Jämför
offertpaket" Bas/Rekommenderat/Utökat) raderad. Monterades i BÅDA
`QuoteBuilder.tsx` och `QuoteEditView.tsx` — båda ställena kontrollerade och
städade. De rena beräkningsfunktionerna (`lib/quotes/package-comparison.ts`,
`applyPackage`/`comparePackage`) rörs INTE — testade direkt av
`tests/quote-packages-day-close.spec.ts` (i test:contracts) och planerade
att återkomma som "bra/bättre/bäst" per jobbtyp.

`tests/quote-packages-day-close.ui.spec.ts` (ogatad browserspec, delar
fixtur/bundlare med en helt orelaterad day-close-svit i samma fil sedan
tidigare) skrevs om: "packages"-testfallet och mount-läget borttaget,
day-close-testerna orörda.

### 2.14 — VisitRuleEditor + /api/quotes/visit-rule bort

`components/quotes/VisitRuleEditor.tsx` (88 rader) och
`app/api/quotes/visit-rule/route.ts` (46 rader) raderade. Ersatt av EN
seedad fritextfråga, "Hur många besök räknar du med?", i
`seedIntakeQuestions` (`lib/quotes/intake-questions.ts`), placerad efter
branschpaketets frågor och före den öppna "påverkar tiden"-frågan.

**Kontrollerat FÖRE radering** (grep, enligt regeln): `lib/quotes/
visit-rule.ts` (den rena `readVisitRule`/`applyVisitRule`-modulen) har en
ANNAN, oberoende läsare: `lib/ai-quote-generator.ts` läser TIDIGARE sparade
besöksregler direkt ur `business_knowledge` (helt oberoende av den borttagna
API-rutten) och applicerar dem på AI-genererade beskrivningar. Den modulen
och den läsvägen är därför **orörda** — bara skrivvägen (editorn + rutten)
är borttagen, ersatt av den seedade frågan för NYA besöksuppgifter framöver.

Facit uppdaterade: `tests/first-value-production.spec.ts` (testet av själva
API-rutten borttaget; testet av `fetchBusinessRules` i
`ai-quote-generator.ts` orört, eftersom det är en annan läsare av samma
tabell), `tests/helpers/first-value-production-preview.ts` och
`tests/first-value-production.ui.spec.ts` (ogatad — "regel"-vyn och tre
tester som bara provade den borttagna editorns egen preview/lås-mekanism
borttagna), `tests/intake-questions.spec.ts` (nytt test för besöksfrågans
placering, ett exakt-array-test uppdaterat).

### 2.15 — QuoteQuickstartCard bort

`app/dashboard/quotes/_shared/QuoteQuickstartCard.tsx` (119 rader)
kontrollerades FÖRST: monterades ingenstans (bara importerad för typen
`QuickstartRow` och en oanropad hjälpfunktion `addQuickstartRow` i
`QuoteBuilder.tsx`, redan död kod innan denna rivning). Raderad tillsammans
med den döda hjälpfunktionen och importen.

### 2.16 — completeness-chipraden bort

`app/dashboard/quotes/_shared/QuoteCompletenessStrip.tsx` (15 rader) och
`lib/quotes/quote-completeness.ts` (152 rader, `sectionSummary`/
`SECTION_ORDER`/`sortSectionsByAttention`) raderade. Skicka-knappens egen
orsakstext ("Välj kund först") ersätter dem — den fanns redan.

**Typen `QuoteSection`** (dokumentets `data-section`-nycklar) flyttade till
`useQuoteSectionNavigation.ts` — den enda återstående läsaren, precis som
planen bad om. `scrollToSection`-hooken lever kvar, kompilerar och fungerar
(bevisat i facit), men har just nu ingen aktiv anropare i UI:t sedan
chipparna som klickade den är borta — ett fynd, inte ett fel: hooken är en
generell "hoppa till sektion i dokumentet"-primitiv som kan få en ny
anropare senare utan att skrivas om.

`QuoteBuilderHeader.tsx` (header-rad 2) och `QuoteBuilderBottomBar.tsx`
(mobilens chip-rad) trimmade: `completenessSummaries`/`hasQuoteContent`/
`onSelectSection`/`onSelect`-propparna och all rendering av dem borttagen ur
BÅDA filerna, samt ur `QuoteBuilder.tsx` och `QuoteEditView.tsx` som skickade
in dem.

Facit: `tests/quote-completeness.spec.ts` (testade uteslutande den
raderade modulen — raderad i sin helhet, ogatad sedan innan, ingen ändring
i grindarna behövdes), `tests/quotes-mer-i-flodet.spec.ts` (två
`test.describe`-block om completeness-remsan borttagna, en `QUOTE_
COMPLETENESS`-filläsning som annars hade kastat vid modulläsning),
`tests/quote-experience.ui.spec.ts` (mount-hosten skickade
`completenessSummaries`/`onSelectSection`/`summaries`/`hasQuoteContent`/
`onSelect` till de riktiga komponenterna och klickade en completeness-chip
för att bevisa navigering — chip-klicket borttaget ur testet, resten
orört).

### 2.17 — fyra ytor blir en: "Matte säger"

`QuoteNewEfterkalkylBanner.tsx` (87), `QuoteNewPriceWarningsBanner.tsx`
(64) och `DanielsBedomning.tsx` (115) raderade, plus Daniel-buffertkortets
inline-JSX i `QuoteBuilder.tsx`. Ny fil: `app/dashboard/quotes/new/
components/MatteSager.tsx` (217 rader) — EN yta, monterad EN gång, direkt
under headern (samma plats DanielsBedomning hade), som visar det som finns
av: motorns eget resonemang (Kvittoprincipen Fall 1, med expand/collapse
och regel/lärdom/kundfakta-listorna oförändrade i sak), prisvarningar,
efterkalkylinsikt och Daniels buffertförslag. Renderar `null` när inget av
delarna har något att visa. Ingen ny AI-logik — samma state
(`aiBedomning`/`priceWarnings`/`priceAlts`/`efterkalkylInsight`/
`daniel_buffert_h`) som redan beräknades i `QuoteBuilder.tsx`, bara en
gemensam presentationsyta.

**Beslut, dokumenterat i koden:** de fyra ytorna använde tidigare TVÅ olika
agent-röster (Daniel för bedömning/buffert, Matte för prisvarningar/
efterkalkyl). Planen namnger den sammanslagna ytan "Matte säger" — alla
fyra visas nu under Mattes avatar/namn. En medveten förenkling (fyra röster
→ en), inte ett misstag.

**Fynd, inte fixat:** `daniel_buffert_h` (`?buffert=N`-notisen) beräknas
bara när `isEditMode` är sant, men renderas i en JSX-gren som `QuoteBuilder.
tsx` returnerar TIDIGARE än (via `<QuoteEditView>`) om `isEditMode` är
sant — notisen har alltså varit strukturellt oåtkomlig för riktiga
redigeringssidor sedan innan denna rivning. Rivningen flyttar bara
RENDERINGEN (från en egen `<div>` till `<MatteSager>`), rör inte villkoret
eller var det renderas, så beteendet är identiskt — bara namngivet och
skrivet upp här i stället för tyst ärvt vidare. Kräver ett beslut om
`daniel_buffert_h` ska trådas till `QuoteEditView` också (utanför detta
uppdrags scope: "ingen ny AI-logik — bara en yta").

Facit: `tests/daniel-agentrad.spec.ts` — testet "redigeraren visar Daniels
notis vid ?buffert=N" skrivet om: pekar nu på `MatteSager.tsx` för själva
notistexten (som flyttade dit) och på `QuoteBuilder.tsx` för att
`?buffert=`-läsningen och `danielBufferHours`-tråden till `MatteSager`
finns kvar oförändrad.

### Nytt facit: tests/rivning-c-verktygen.spec.ts

16 tester, en `test.describe` per rad (2.12–2.17), källskanning utan
browser/session. Registrerad i BÅDA grindarna (`package.json` `test:
contracts`, sist i listan efter `offertstarten-en-skarm.spec.ts`, och
`.github/workflows/contracts.yml`, sist i det vikta run-blocket före
`--no-deps`).

### Rader bort (mätt med `wc -l`, HEAD `c3511773` mot arbetsträdet)

| Fil | Före | Efter |
|---|---:|---:|
| `QuoteNewAIHelper.tsx` | 210 | 0 (raderad) |
| `QuotePackageComparison.tsx` | 30 | 0 (raderad) |
| `VisitRuleEditor.tsx` | 88 | 0 (raderad) |
| `app/api/quotes/visit-rule/route.ts` | 46 | 0 (raderad) |
| `QuoteQuickstartCard.tsx` | 119 | 0 (raderad) |
| `QuoteCompletenessStrip.tsx` | 15 | 0 (raderad) |
| `lib/quotes/quote-completeness.ts` | 152 | 0 (raderad) |
| `DanielsBedomning.tsx` | 115 | 0 (raderad) |
| `QuoteNewEfterkalkylBanner.tsx` | 87 | 0 (raderad) |
| `QuoteNewPriceWarningsBanner.tsx` | 64 | 0 (raderad) |
| `QuoteBuilder.tsx` | 2840 | 2694 (−146) |
| `QuoteEditView.tsx` | 423 | 405 (−18) |
| `QuoteBuilderHeader.tsx` | 348 | 326 (−22) |
| `QuoteBuilderBottomBar.tsx` | 175 | 110 (−65) |
| `useQuoteSectionNavigation.ts` | 32 | 45 (+13, typen flyttade hit) |
| `lib/quotes/intake-questions.ts` | 434 | 439 (+5, besöksfrågan) |
| `MatteSager.tsx` (ny) | 0 | 217 |
| **Summa** | **5178** | **2136** (netto **−942**) |

### Mutationer (fyra, alla röda innan återställning)

1. `onOpenAiHelp={() => setQuickMode('intake')}` → `() => {}` i
   `QuoteBuilder.tsx` → `rivning-c-verktygen.spec.ts` rött på 2.12:s
   "öppnar intaget"-test (1 failed, 15 passed). Återställt.
2. Bytte den seedade frågans label till `'X'` i `intake-questions.ts` →
   rött på 2.14:s placeringstest (1 failed, 15 passed). Återställt.
3. Lade tillbaka `hasQuoteContent?: boolean` i `QuoteBuilderHeaderProps` →
   rött på 2.16:s "tar inte längre emot completenessSummaries/
   hasQuoteContent"-test (1 failed, 15 passed). Återställt.
4. Kommenterade bort `if (!hasAnything) return null` i `MatteSager.tsx` →
   rött på 2.17:s "renderar ingenting när inget finns"-test (1 failed, 15
   passed). Återställt, `diff` mot backup identisk efteråt.

### Verifiering

- `./node_modules/.bin/tsc --noEmit` → 0 fel.
- `npm run test:contracts` (miljövariabler satta) → **2862 passed, 1
  skipped** av 2863 (baslinjen 2846 + 16 nya i `rivning-c-verktygen.spec.
  ts` = 2862; det enda skippet är `tests/send-invoice-core.spec.ts`s
  hårdkodade `test.skip(...)`, verifierat pre-existerande och orört av
  denna rivning).
- `npx next build` → `✓ Compiled successfully`, samma kända brus
  (`supabaseUrl is required`).
- `git status --short` kontrollerad — matchar exakt paket C:s filomfång,
  inga läckta 2.20-ändringar (se nästa avsnitt för varför det kontrollerades
  separat).

## Rättelse till egen tidigare rapport — 2.20 hoppades över av fel skäl

Föregående version av den här rapporten (skriven i paket B-avsnittet ovan)
sa att 2.20 hoppades över för att `quotes` saknar kolumnen `job_type`.
**Det var fel**, verifierat av Andreas: kolumnen finns
(`sql/v7_pricing.sql:44`, `ALTER TABLE quotes ADD COLUMN IF NOT EXISTS
job_type TEXT`), skrivs redan vid create (`buildQuotePayload.ts:146`,
`job_type: input.quoteJobType`) och läses redan av
`create-from-quote.ts:121`. Det som verkligen saknades var att
`app/dashboard/quotes/[id]/types.ts`s lokala `Quote`-typ inte deklarerade
fältet — en TypeScript-typlucka, inte en schemalucka. 2.20 är gjord nedan,
som en egen commit efter paket C, med samma grind.

## Rad 2.20 — "Spara som mall" blir "Spara som upplägg för jobbtypen"

Två-tre implementationer av samma sak slogs ihop till en:

1. **Headerns "Spara som mall"** (`QuoteBuilder.tsx` → `QuoteSaveTemplateModal.
   tsx`) hade REDAN båda mekanismerna sida vid sida: ett fritt mallnamn +
   `POST /api/quote-templates`, OCH (monterad separat i samma modal, från ett
   tidigare, parallellt pass) `SaveJobStandardFromQuote` →
   `/api/job-types/quote-setup` → `lib/quotes/job-standard-server.ts`
   (`writeJobStandard`, operation `replace`/`append`) — redan byggd och delad
   med onboardingen.
2. **Detaljsidans egen inline-modal** (`app/dashboard/quotes/[id]/page.tsx`)
   var en tredje, handkopierad variant: samma fria mallnamn +
   `POST /api/quote-templates`, men UTAN `SaveJobStandardFromQuote` alls —
   ingen jobbtypskoppling överhuvudtaget.

**Gjort:** `QuoteSaveTemplateModal.tsx` skrivet om till EN väg. Mallnamn-
fältet och `onSave`/`saving`-propparna borttagna helt. Kvar: titeln "Spara
som upplägg för jobbtypen", och `SaveJobStandardFromQuote` monterad direkt
om offerten har en jobbtyp. Saknas jobbtyp visas texten "Välj jobbtyp
först" i stället för att spara utan koppling (ingen ny mekanism uppfunnen
— `SaveJobStandardFromQuote` kräver ändå `jobType` för att veta vilket
upplägg raderna ska bindas till).

`saveAsTemplate`/`templateName`/`savingTemplate` (den fria mallsparningen)
och dess `/api/quote-templates`-POST är borttagna ur ALLA TRE anropare:
`QuoteBuilder.tsx` (create), `QuoteEditView.tsx` (edit) och `[id]/page.tsx`
(detaljsidan, som nu monterar samma delade `QuoteSaveTemplateModal` i
stället för sin egen handkopierade JSX). `/api/quote-templates`-routen
SJÄLV (kontrollerat: filen finns kvar) och mallistan i Inställningar
(rad 3.10, kräver Andreas) rörs INTE — bara de tre UI-anroparnas skrivväg
för den fria sparningen. `QuoteBuilder.tsx`s ANDRA, orelaterade anrop till
samma rutt (`PATCH … increment_usage` när en BEFINTLIG mall VÄLJS i
`handleNewTemplateSelect`) är orört — upptäckt och medvetet undantaget i
facit efter att en första version av testet råkade fånga det också.

**Jobbtypen trådas nu även till redigeringsläget och detaljsidan**, som
tidigare saknade den helt för det här syftet:

- `app/dashboard/quotes/_shared/loadEditQuote.ts` (`LoadedEditQuote`) läser
  nu `quote.job_type` — samma kolumn, en ny läsare. `QuoteBuilder.tsx`
  sätter `quoteJobType`-state (redan create-lägets state) från den vid
  `fetchQuote()`, och trådar den in i `QuoteEditView`.
- `app/dashboard/quotes/[id]/types.ts`s `Quote`-typ fick fältet
  `job_type?: string | null` — ren TypeScript-typ, ingen SQL, ingen
  schemaändring (kolumnen fanns redan, API-svaret är redan `select('*')`
  i `app/api/quotes/route.ts`).

Knapptext ändrad "Spara som mall" → "Spara som upplägg" i
`QuoteBuilderHeader.tsx` och detaljsidans "…"-meny (`[id]/components/
QuoteHeader.tsx`).

### Nytt facit: tests/rivning-2-20-mall-upplagg.spec.ts

10 tester, källskanning utan browser/session. Bekräftar: det fria
mallnamnet och `/api/quote-templates`-POST:en är borta ur alla tre
anropare (men att routen själv och mallistan i Inställningar lever kvar,
och att `handleNewTemplateSelect`s orelaterade PATCH-anrop till samma rutt
inte räknas som en kvarleva); att `QuoteSaveTemplateModal` monteras av
alla tre; att "Välj jobbtyp först" visas när jobbtyp saknas; att både
detaljsidan och redigeraren nu läser `job_type`; att `sql/v7_pricing.sql`
faktiskt lägger kolumnen (beviset för att detta aldrig var en
schemaändring). Registrerad i `package.json` `test:contracts` och
`.github/workflows/contracts.yml`, direkt efter `rivning-c-verktygen.spec.
ts`.

### Rader bort/ändrade (mätt med `wc -l`, HEAD `6a01781a` = paket C-committen, mot arbetsträdet)

| Fil | Före (paket C) | Efter (+ 2.20) |
|---|---:|---:|
| `QuoteSaveTemplateModal.tsx` | 72 | 62 (−10, mallnamn-fältet + knappar bort) |
| `QuoteBuilder.tsx` | 2694 | 2656 (−38) |
| `QuoteEditView.tsx` | 405 | 403 (−2) |
| `[id]/page.tsx` | 628 | 568 (−60, egen inline-modal + saveAsTemplate bort) |
| `[id]/types.ts` | 132 | 138 (+6, `job_type`-fältet) |
| `loadEditQuote.ts` | 188 | 195 (+7, `jobType`-fältet + läsning) |
| **Summa** | **4119** | **3922** (netto **−97**) |

### Mutationer (fyra, alla röda innan återställning)

1. Bytte texten "Välj jobbtyp först…" mot "Mallnamn" i
   `QuoteSaveTemplateModal.tsx` → `rivning-2-20-mall-upplagg.spec.ts` rött
   på "modalen har bara jobbtyp-vägen kvar" (1 failed, 9 passed).
   Återställt.
2. Bytte `job_type?: string | null` mot `job_type_XX?: string | null` i
   `[id]/types.ts` → rött på "detaljsidans Quote-typ … bär redan job_type"
   (1 failed, 9 passed). Återställt.
3. Bytte `jobType: quote.job_type || null` mot `jobType: null` i
   `loadEditQuote.ts` → rött på "redigeraren läser jobbtypen …" (1 failed,
   9 passed). Återställt.
4. Bytte "Spara som upplägg" mot "Spara som mall" i
   `QuoteBuilderHeader.tsx` → rött på "knapptexten byter namn med
   mekaniken" (1 failed, 9 passed). Återställt, `diff` mot backup identisk
   efteråt.

### Verifiering

- `./node_modules/.bin/tsc --noEmit` → 0 fel.
- `npm run test:contracts` → **2872 passed, 1 skipped** av 2873 (2862 +
  10 nya i `rivning-2-20-mall-upplagg.spec.ts`; samma pre-existerande skip
  som paket C, orört).
- `npx next build` → `✓ Compiled successfully`, samma kända brus.
- `git status --short` kontrollerad — matchar exakt 2.20:s filomfång (sex
  filer: `QuoteSaveTemplateModal.tsx`, `QuoteBuilder.tsx`,
  `QuoteEditView.tsx`, `[id]/page.tsx`, `[id]/types.ts`,
  `loadEditQuote.ts`) plus de två nya raderna i grindarna och det nya
  facitet.

## Paket D — runtomkring, BARA de säkra raderna

Tredje agenten tog vid på commit `6a70a2b1` (paket B + C + 2.20, redan
pushade) och körde de säkra raderna 3.1, 3.2, 3.3, 3.4, 3.6, 3.8, 3.9, 3.11
enligt planen, med grep-före-radering och läsning av `inventeringens`
avsnitt 3–4 innan varje rad.

### 3.1 — listans KPI-kort + acceptrate + QuotePerformanceCard → en rad

`app/dashboard/quotes/page.tsx`: de fyra separata KPI-korten (Utkast/
Skickade/Accepterade/Acceptrate) och undertexten under H1 ("N offerter ·
X% acceptrate") är borta. Ersatta av EN sammanfattningsrad (grid-cols-3,
ingen flex-wrap — garanterat ingen sidscroll på 375 px) med de tre tal som
faktiskt skiljer sig åt: **Offerter** (antal), **Summa** (ny — summan av
det belopp raderna faktiskt visar, efter ROT/RUT när satt; fanns tidigare
INGENSTANS på sidan) och **Acceptgrad**.

**Läst innan radering, enligt arbetsregeln:** `QuotePerformanceCard` är
INTE borttagen. Den är en hopfällbar (stängd som standard) fördjupning med
en egen `/api/analytics/quote-performance`-hämtning — funnel per steg,
vinst per visningsnivå, öppnad-vs-aldrig-öppnad och nej-orsaker. Det är
ett djup ingen av de tre borttagna ytorna bar (de visade bara enkla
antal/procent). Att riva den hade tystat den enda platsen hantverkaren kan
se VARFÖR offerter går förlorade, för att spara tre rader kod. Den flyttades
en rad ner (efter sammanfattningsraden i stället för före) men är
funktionellt orörd.

Facit: `tests/rivning-d-runtomkring.spec.ts`.

### 3.2 — "Föreslå nudge"-badgen bort

Badgen (visades vid `view_count >= 3` på en skickad/öppnad offert, ingen
knapp eller åtgärd kopplad) borttagen ur `QuoteRow` i `page.tsx`, tillsammans
med den lokala `showNudge`-beräkningen. **Kontrollerat innan radering:** den
riktiga, oberoende nudge-motorn heter `lib/agents/daniel/unopened-quotes.ts`
(Daniels obeöppnad-offert-nudge, eget facit `tests/unopened-quote-nudge.spec.ts`,
grep på hela modulnamnet gav noll träffar i listkoden) — helt orörd, den
badgen i listan var en annan, egen, knapplös 3-radskoll som aldrig anropade
den motorn.

### 3.3 — "Acceptera" flyttad till detaljsidan som "Markera som accepterad"

UI:t flyttat från listans radknapp (`confirm()` + `fetch('/api/quotes/accept')`,
`app/dashboard/quotes/page.tsx`) till en ny knapp i `QuoteHeader.tsx`
("Markera som accepterad", synlig för status sent/opened, bredvid "Skicka
påminnelse"), med handlern `markAccepted` i `app/dashboard/quotes/[id]/page.tsx`.
**Ingen `window.confirm()` på detaljsidan** — sidan har redan (ETAPP 4) ersatt
alla `confirm()`/`prompt()` med egna dialoger/toaster, och en enskild,
tydligt benämnd knapp här är inte tvetydig på samma sätt som en liten
ikonknapp i en tät lista var.

**Viktigaste fyndet i paket D:** planen antog att det redan finns "den
befintliga interna accept-rutten som anropar `finalizeAcceptedQuote`
(source `'internt'`)" och att UI:t bara skulle flyttas till den vägen. Det
stämmer INTE. Grep på `finalizeAcceptedQuote` visade fyra anropare:
`app/api/quotes/public/[token]/route.ts` (source `'signering'`),
`app/api/portal/route.ts` (source `'kundportal'`),
`lib/demo/demo-quote.ts` och `app/api/quotes/acceptance-recovery/route.ts`
— men den sistnämnda är EN EFTERSTÄDNINGSRUTT (`recoveryOnly: true`,
kräver att offerten REDAN har status `accepted`, kör aldrig om
bekräftelsemejlet) för att läka ett tidigare misslyckat efterarbete, inte
en väg för att GÖRA en offert accepterad. Det finns ingen "internt, live
accept"-anrop till `finalizeAcceptedQuote`.

Den faktiska interna accept-vägen, `app/api/quotes/accept/route.ts`, gör
INTE detsamma som `finalizeAcceptedQuote` — den har sin egen, parallella
implementation (CAS-uppdatering med `.eq('status', quote.status)`, egen
marginalsnapshot, egen SMS, egen aktivitetslogg) och är själv tungt
kontraktstestad: `tests/first-job-acceptance.spec.ts` (i `test:contracts`)
har åtta test som låser exakt DENNA rutts beteende — kapplöpning (två
samtidiga accepter ger 200+409, effekter bara en gång), idempotent retry,
stale-status-skydd mot tre olika statusar, läsfel, RBAC (anonym/anställd
nekas), tenant-isolering (främmande offert 404:ar, främmande kunddata
läcker inte) och en legacy-kolumn-fallback som bevarar samma
kapplöpningsskydd.

Detta är alltså INTE en övergiven dubblett i stil med tidigare fynd i
paket B/C (`QuoteStylePicker`, `visit-rule.ts`) — det är en egen, avsiktligt
byggd och väl garderad väg. Att skriva om den att anropa
`finalizeAcceptedQuote` i stället hade krävt att antingen (a) täcka in
`finalizeAcceptedQuote` med samma kapplöpnings-/RBAC-/tenant-garantier som
de åtta testerna redan bevisar för den nuvarande rutten, eller (b) skriva
om åtta kontraktstest för en ihopslagning som planen inte bad om att
verifiera — ett beslut om VILKEN väg som ska vinna, inte en UI-flytt.
Det är samma klass av fråga som 3.7 (två sign-link-rutter, två
mall-API-familjer) är uttryckligen undantagen för. **Löst genom att INTE
röra `/api/quotes/accept/route.ts` alls** — bara UI:t är flyttat, samma
endpoint anropas som förut, ingen status skrivs direkt från klienten.
Flaggat här som ett fynd för Andreas: om `/api/quotes/accept` och
`finalizeAcceptedQuote` någonsin ska bli en väg, är det ett separat beslut
i samma klass som 3.5/3.7/3.10/3.13.

Facit: `tests/rivning-d-runtomkring.spec.ts`.

### 3.4 — sortering: senast ändrad först

Ny, testad, ren funktion `sortQuotesByRecency` i `lib/quotes/list-filter.ts`
(`updated_at` desc, fallback `created_at` för äldre rader utan den).
Använd i `app/dashboard/quotes/page.tsx` på de FILTRERADE/sökta offerterna
(flikar och sök oförändrade). Serverns svar sorterades tidigare bara på
`created_at desc` (API:ts egen ordning, ingen UI-sortering fanns).
`tests/quote-list-filter.spec.ts` rördes INTE (den testar bara filter-URL:er,
ingen sorteringslogik) — nya sorteringsspecifika test ligger i det nya
facitet i stället, med både en källskanning och ett riktigt beteendetest
(tre rader, en med `updated_at`, en äldre `created_at`-bara-rad, en nyare
`created_at`-bara-rad — rätt ordning verifierad).

### 3.6 — HOPPAD: "tre ROT-dialekter → en" gjordes INTE

Planen sa uttryckligen: kontrollera FÖRST att legacy-fälten
(`rot_rut_deduction`, `deduction_amount`, `rot_deduction`) inte längre
SKRIVS av någon väg; skrivs de fortfarande, behåll läsningen och notera.

Grep gav ett tydligt facit: **`rot_rut_deduction` och `rot_deduction`
skrivs fortfarande, aktivt, av flera produktionskodvägar** —
`app/api/quotes/route.ts` (rad ~801, ~915–923, både vid `PATCH` och vid
avdragsomräkning), `app/api/quotes/public/[token]/route.ts` (kundens
signeringsflöde skriver om avdraget vid behov) och `lib/quotes/create-quote.ts`
(ny offert). Det betyder att offerter skapade eller ändrade via dessa vägar
kan ha ENDAST de gamla flata fälten satta (inget `rot_work_cost`/
`rut_work_cost`), utan att ha migrerats till den nya, strukturerade formen.

`QuoteSummaryCard.tsx`s "legacy"-gren (`quote.rot_rut_type` +
`quote.rot_rut_deduction`, utan `hasNewRotRut`) är alltså INTE dödkod eller
en ren visningsdublett av den nya — den är den enda platsen dessa
fortfarande aktivt skrivna fält visas för kunden/hantverkaren. Att ta bort
den hade gjort att en offert med bara legacy-fälten satta (en riktig,
levande skrivväg, inte en historisk rad) tappar sin ROT/RUT-rad i
summeringen helt tyst — precis den typen av "ser ut som dödkod men har en
oberoende skrivare" som lärdomarna varnar för.

**Rad 3.6 lämnad orörd.** `QuoteSummaryCard.tsx` är oförändrad (158 rader,
samma som innan). Ingen legacy-läsning togs bort. Dokumenterat i det nya
facitet (källskanning som bevisar att `rot_rut_deduction` fortfarande
skrivs OCH att kortet fortfarande läser den) så nästa agent inte behöver
gissa om samma sak igen — bara kontrollera om skrivvägarna migrerats bort
sedan dess.

### 3.8 — Skicka-modalen: Kopia/BCC/Ämne bakom "Fler mottagare"

`QuoteSendModal.tsx`: de tre fälten ligger nu bakom en hopfällbar sektion
("Fler mottagare", 44 px träffyta, `ChevronDown` som roterar). Stängd som
standard, men öppen direkt om `extraEmails` eller `bccEmails` redan har ett
värde vid montering — ett ifyllt fält göms aldrig bort tyst.
`tests/quote-experience.ui.spec.ts`s `send`-host (monterar modalen med
tomma `extraEmails`/`bccEmails`) klickar bara "Visa kundens offert" och
kontrollerar förhandsvisningen — rörs inte av att Kopia/BCC/Ämne nu är
dolda som standard, gick grön oförändrad.

### 3.9 — Verklighetskontrollen: bara "ready", inga spinners

Samma fil: laddningsspinnern ("Business Twin jämför med verifierade
efterkalkyler…") och "inte tillgänglig"-blocket är borttagna helt.
Analysen (`status === 'ready'`) renderas precis som förut.
`tests/quote-reality-check.spec.ts` källskannar bara att modalen har
"Business Twin · verklighetskontroll", "Granska timmarna" osv (som fortfarande
finns i ready-grenen) — rörs inte.

### 3.11 — Standardtexter: Inledning/Avslutning bort ur inställningen

`app/dashboard/settings/quote-texts/page.tsx`: `TEXT_TYPES` har bara kvar
Ej inkluderat/ÄTA-villkor/Betalningsvillkor. `activeTab`/`newType` defaultar
nu till `'not_included'` i stället för det borttagna `'introduction'`
(annars hade sidan öppnat sig på en flik ingen kunde se). **Ingen SQL, inga
rader raderade** — sparade `introduction`/`conclusion`-texter finns kvar i
databasen, bara ovalbara i UI:t framöver.

`tests/quote-terms-crash.spec.ts` (som planen pekade ut som "låst av") visade
sig INTE testa den här sidan alls — den testar bara `asTermsString`
(JSONB-default-skyddet i `lib/quote-templates/data-builder.ts`), helt
orelaterat. Ett litet plan/verklighet-glapp likt det som rättades för
2.20 i paket B, men här utan konsekvens (inget kodberoende att bryta) —
nämnt här så nästa läsare inte letar efter en koppling som inte finns.

### 3.12 — verifiering: per-offert-stilväljaren är borta ur offertflödet

Ingen kod skriven. Verifierat att `<QuoteStylePicker` inte monteras i
`QuoteBuilder.tsx` eller `QuoteEditView.tsx` (paket B, rad 2.4, redan gjort
och pushat i commit `82ee1fd9`) och att komponentfilen fortfarande finns
kvar åt `app/dashboard/invoices/_shared/InvoiceEditor.tsx` (fakturans egen
per-faktura-stil, utanför detta uppdrags scope). Facit i det nya facitet.

### Nytt facit: tests/rivning-d-runtomkring.spec.ts

24 test, en `test.describe` per rad (3.1, 3.2, 3.3, 3.4, 3.6, 3.8, 3.9,
3.11, 3.12), källskanning + ett rent beteendetest för sorteringen — ingen
browser/session. Registrerad i BÅDA grindarna (`package.json`
`test:contracts`, sist i listan efter `rivning-2-20-mall-upplagg.spec.ts`,
och `.github/workflows/contracts.yml`, sist i det vikta run-blocket före
`--no-deps`).

### Rader ändrade (mätt med `wc -l`, `git show HEAD:<fil>` mot arbetsträdet)

| Fil | Före | Efter |
|---|---:|---:|
| `app/dashboard/quotes/page.tsx` | 415 | 380 (−35: fyra KPI-kort, undertext, Acceptera-knapp, nudge-badge bort; en sammanfattningsrad + kommentarer till) |
| `app/dashboard/quotes/[id]/page.tsx` | 568 | 600 (+32: `markAccepted`-handler + state) |
| `.../components/QuoteHeader.tsx` | 309 | 327 (+18: "Markera som accepterad"-knapp + props) |
| `.../components/QuoteSummaryCard.tsx` | 158 | 158 (oförändrad — rad 3.6 hoppad) |
| `.../components/QuoteSendModal.tsx` | 327 | 330 (+3: hopfällbar sektion, netto litet eftersom fälten bara flyttade in en nivå + tre rader borttagna för spinner/otillgänglig) |
| `app/dashboard/settings/quote-texts/page.tsx` | 435 | 437 (+2: en borttagen typ, en kommentar) |
| `lib/quotes/list-filter.ts` | 20 | 39 (+19: `sortQuotesByRecency` + typ) |
| **Summa (produktionskod)** | **2232** | **2271 (+39 netto)** |

Nettot är positivt, inte negativt som i paket B/C — väntat för ett paket
som mest FLYTTAR UI (listrad → detaljsida-knapp) och LÄGGER TILL en
testad sorteringsfunktion, snarare än river hela ytor. De faktiska
raderingarna (fyra KPI-kort, en badge, en radknapp, en laddningsspinner,
ett otillgänglig-block, två textinställningstyper) är uppvägda av det som
var tvunget att byggas för att inte tappa funktion (sammanfattningsraden
med en ny "summa"-siffra, den flyttade knappen med egen handler, den
hopfällbara sektionens toggle-logik, sorteringsfunktionen med testfall).

### Mutationer (fyra, alla röda innan återställning)

1. Återinförde "Föreslå nudge"-badgens JSX i `QuoteRow` (`app/dashboard/
   quotes/page.tsx`) → `rivning-d-runtomkring.spec.ts` rött på 3.2:s
   "badgen ... är borta ur listan"-test (1 failed, 23 passed). Återställt,
   `diff` mot backup identisk.
2. Bytte `a.updated_at || a.created_at` mot bara `a.updated_at` i
   `sortQuotesByRecency` (`lib/quotes/list-filter.ts`) → rött på BÅDA
   3.4-testen (källskanningen för fallback-strängen och beteendetestet,
   som då sorterar en rad utan `updated_at` som `Invalid Date`) (2 failed,
   22 passed). Återställt.
3. Återinförde laddningsspinnern (`quoteIntelligenceLoading &&`-blocket)
   i `QuoteSendModal.tsx` → rött på 3.9:s "laddningsspinnern ... är
   borttagna helt"-test (1 failed, 23 passed). Återställt.
4. Lade tillbaka `{ value: 'introduction', ... }` i `TEXT_TYPES`
   (`app/dashboard/settings/quote-texts/page.tsx`) → rött på 3.11:s
   "typerna finns inte längre i TEXT_TYPES"-test (1 failed, 23 passed).
   Återställt, `diff` mot backup identisk efteråt.

Alla fyra återställningar verifierade med `diff` mot en backup tagen precis
före mutationen — identiska efteråt.

### Verifiering

- `./node_modules/.bin/tsc --noEmit` → 0 fel.
- `npm run test:contracts` (miljövariabler `HANDYMATE_CHROMIUM_PATH`/
  `HANDYMATE_TEST_CHROMIUM` satta) → **2896 passed, 1 skipped** av 2897
  (baslinjen 2872 + 24 nya i `rivning-d-runtomkring.spec.ts`; samma
  pre-existerande skip som paket B/C, `tests/send-invoice-core.spec.ts`,
  orört).
- `npx next build` (efter tsc, inte parallellt) → `✓ Compiled successfully`,
  samma kända brus (`Auth error: supabaseUrl is required` på adminsidor,
  `themeColor`-varningar).
- `git status --short` kontrollerad före commit — matchar exakt paket D:s
  filomfång (sju ändrade filer + kontraktsgrindarna + det nya facitet).

### Fynd om raderna som INTE görs i natt (3.5, 3.7, 3.10, 3.13)

Ren avläsning ur `docs/offert/offertflodet-inventering-2026-09-17.md`, ingen
ny kod skriven eller kod läst utöver dokumentet för dessa fyra rader:

- **3.5** `QuoteHandoff` (tre kolumner) + `ScheduledFollowup` + två
  cron-uppföljningsmotorer (`app/api/cron/quote-follow-up`) — två motorer
  synliga samtidigt på samma sida. Planens förslag: slå ihop till EN
  uppföljning med ett läge ("Nästa påminnelse: datum · ändra · stäng av").
  Kräver Andreas eftersom det rör vilken av de två motorerna som ska vinna —
  en driftbeslut, inte en ren UI-städning.
- **3.7** Två sign-link-rutter (`/api/quotes/sign-link` +
  `/api/quotes/[id]/sign-link`) och två mall-API-familjer
  (`/api/quotes/templates` + `/api/quote-templates`) — externa anropare kan
  bero på endera vägen. Kräver Andreas för att veta vilka integrationer som
  faktiskt pekar på vilken rutt innan en slås ihop.
- **3.10** Inställningar → Offertmallar (lista 548 rader + editor 591 rader)
  parallellt med Jobbtyper → upplägg. 45 mallar i databasen, 4 använda, 3
  kopplade till jobbtyp — samma glapp som stoppade 2.20 ovan (mallar och
  jobbtypsupplägg är i praktiken samma sak men har ingen fast koppling än).
  Stor UI-omstrukturering ("mallsidan blir en vy under Jobbtyper") — kräver
  ett beslut om var funktionen ska bo, inte bara en radering.
- **3.13** Agentverktyget `create_quote` (skapar offert direkt) och
  `create_quote_draft` (utkast) i `tool-definitions.ts` — att slå ihop dem
  till bara utkastvägen ändrar Mattes (agentens) faktiska beteende mot
  kunder, inte bara UI. Kräver ett uttryckligt beslut av Andreas, inte en
  agent som river på egen hand klockan natt.

## Sammanfattning

**Pushat/klart:**

- **Paket B** (rad 2.1–2.6, 2.10, pushat tidigare, commit `82ee1fd9`) —
  dokumentet är nu den enda platsen för titel, beskrivning, rabatt,
  ROT/RUT-avdragsväxeln och de fyra standardtexterna (med "Välj
  standardtext" flyttad dit); referens- och adressfält bor i kundkortet;
  stilväljaren och "Mer"-radens tre borttagna paneler är borta ur
  offertflödet (komponenten själv lever kvar åt fakturan).
- **Paket C** (rad 2.12–2.17, commit `6a01781a`, pushat) — AI-hjälpen inne
  i editorn, paketjämförelsen, besöksregel-editorn (ersatt av en seedad
  fråga), en dödkod-komponent, hela completeness-chipraden och fyra
  separata Matte/Daniel-ytor (slagna ihop till "Matte säger") är borta.
  Nytt facit `tests/rivning-c-verktygen.spec.ts` (16 test).
- **Rad 2.20** (egen commit efter paket C) — "Spara som mall" i headern
  och detaljsidans egen handkopierade variant slås ihop till EN väg,
  "Spara som upplägg för jobbtypen" (`SaveJobStandardFromQuote` →
  `writeJobStandard`), med "Välj jobbtyp först" när kopplingen saknas.
  Jobbtypen trådas nu även till redigeringsläget och detaljsidan, som
  tidigare saknade den. Nytt facit `tests/rivning-2-20-mall-upplagg.
  spec.ts` (10 test).
- **Paket D, säkra raderna** (3.1, 3.2, 3.3, 3.4, 3.8, 3.9, 3.11 gjorda;
  3.6 hoppad, 3.12 verifierad utan kodändring) — listan har en
  sammanfattningsrad (antal/summa/acceptgrad) i stället för fyra KPI-kort
  plus en dubblerande undertext (QuotePerformanceCard orörd — bär eget
  djup); "Föreslå nudge"-badgen utan knapp är borta; "Acceptera" är
  flyttad till detaljsidan som "Markera som accepterad" (samma
  `/api/quotes/accept`, ingen ny statusskrivande väg); listan sorterar nu
  senast ändrad överst; skicka-modalens Kopia/BCC/Ämne ligger bakom "Fler
  mottagare"; verklighetskontrollen är tyst tills den har något att säga;
  Inledning/Avslutning är borta ur standardtexts-inställningen (ingen
  SQL). Nytt facit `tests/rivning-d-runtomkring.spec.ts` (24 test).

Grönt genomgående: tsc 0 fel, `npm run test:contracts` **2896 passed, 1
skipped** av 2897 (baslinjen 2846 + 16 + 10 + 24 nya test; det enda skippet
är `tests/send-invoice-core.spec.ts`s hårdkodade, pre-existerande
`test.skip(...)`, verifierat orört av alla tre rivningarna), ren
`next build`, och för varje paket/rad-grupp minst fyra mutationer
bekräftat röda och återställda mot respektive nya facit.

**Kvar:** rad 3.6 (hoppad, motiverad ovan — legacy-fälten skrivs
fortfarande), och 3.5/3.7/3.10/3.13 (kräver Andreas, se nedan).

**Viktigaste fyndet totalt:** samma mönster upprepade sig i alla tre pass,
och paket D:s variant var den mest kostsamma att missa. En yta som ser ut
som ren dödkod, eller ett fritt val mellan flera implementationer, kan
dölja en riktig, oberoende läsare — ELLER, som i paket D rad 3.3, dölja en
egen, avsiktligt byggd och TUNGT KONTRAKTSTESTAD väg som planen felaktigt
trodde var en övergiven dubblett. Planen antog att `/api/quotes/accept`
redan anropade `finalizeAcceptedQuote`; i verkligheten är det en helt
egen implementation med åtta dedikerade kapplöpnings-/RBAC-/tenant-test
(`tests/first-job-acceptance.spec.ts`). Att "bara flytta UI:t till samma
väg" hade i det här fallet betytt att skriva om en väg som redan var
bevisat korrekt, mot en väg som inte har samma bevis — ett beslut om vilken
implementation som ska vinna, inte en refaktorering. I paket C:
`lib/quotes/visit-rule.ts` såg ut att höra ihop med den borttagna editorn
och rutten (2.14), men `lib/ai-quote-generator.ts` läser TIDIGARE sparade
regler direkt ur databasen, helt oberoende — modulen fick leva kvar även
om den enda UI-vägen till att SKRIVA nya regler ersattes av en seedad
fråga. I rad 2.20: den "riktiga" jobbtyp-kopplade sparningen
(`SaveJobStandardFromQuote`) fanns redan byggd och monterad i headerns
modal, bredvid den gamla — den behövde bara bli den ENDA vägen, inte
uppfinnas. I paket D rad 3.6: legacy-ROT/RUT-fälten `rot_rut_deduction`
skrivs fortfarande av tre aktiva kodvägar (`app/api/quotes/route.ts`,
`.../public/[token]/route.ts`, `lib/quotes/create-quote.ts`) — att ta bort
`QuoteSummaryCard.tsx`s legacy-visningsgren hade gjort riktiga, nyss
skapade offerter osynliga i sin egen summering. Att bara grep:a efter
komponentnamnet (`VisitRuleEditor`) eller lita på en tidigare agents
"kolumnen saknas"-slutsats hade missat båda de tidigare fynden; att
grep:a hela modulnamnet (`visit-rule`) och att faktiskt läsa SQL-filen
(`sql/v7_pricing.sql`) innan man drog en schema-slutsats hittade dem.
