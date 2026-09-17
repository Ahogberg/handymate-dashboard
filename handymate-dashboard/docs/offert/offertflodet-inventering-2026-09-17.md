# Offertflödet — inventering och rivningsförslag

Skrivet 2026-09-17 på Andreas begäran: "gå igenom plattformen (främst offertflödet)
och bara strippa bort saker som inte tillför samt förbättra övriga delar vid behov".
Detta är underlaget för en sittning med Andreas och Christoffer. Varje rad har ett
förslag; beslutet är ert. Regeln i sittningen: **"senare" är inte ett svar.** Varje
rad får Behåll, Slå ihop, Flytta eller Ta bort.

Ingen kod har ändrats. Allt nedan är läst ur koden och databasen samma dag.

## Utgångsläget i siffror

| Vad | Värde |
|---|---|
| Offerter i produktion, totalt | 39 (15 senaste 90 dagarna) |
| Firmor som skapat en offert | 5, varav 2 aktiva |
| Filer under offertflödet (`app/dashboard/quotes`, `components/quotes`, `lib/quotes`) | 132 |
| `QuoteBuilder.tsx` | 3 156 rader, 81 state-variabler, ~40 monterade komponenter |
| API-rutter under `/api/quotes` + `/api/quote-templates` | 22 |
| Distinkta vägar in i editorn | 16 |
| Anrop till servern innan editorn syns | 20 |
| Interaktiva kontroller på en tom offert (desktop) | 34 fasta + ett chip per jobbtyp (≈ 40–44) |
| "Ny offert"-knappar i appen | 10, med 5 olika query-param-dialekter |
| Startvägar med **noll** test i `tests/` | QuickBlankStart, QuickBuilding, preferensbannern, AI-hjälpen, paketjämförelsen m.fl. |

Det viktigaste talet är det första. Med 39 offerter finns ingen användningsdata som
kan avgöra vad som ska bort. Besluten måste tas på princip, inte statistik. Där data
ändå säger något står det i tabellerna (t.ex. "4 av 39 har betalplan").

## Principen

Huvudvägen är hantverkaren hemma hos kunden, på telefon:

**Ny offert → välj jobbtyp → svara på frågorna → offerten är prissatt → kund → skicka.**

Allt som inte ligger på den vägen måste motivera sig med ett av två skäl: det räddar
en offert som annars inte blir skickad, eller det är en reservväg som kostar noll när
den inte används. Allt annat är kandidat för borttagning.

Varför det aldrig känns klart: varje förbättring har lagts **bredvid** den förra i
stället för att ersätta den. Kodkommentarerna dokumenterar sju tidigare rivningar
(dubbel Skicka-knapp, granskningssekvensen, startväljaren med fyra alternativ,
QuickReviewBar, PaymentPlanSheet, förbehållsbannern, giltighetstiden i kundkortet).
Varje rivning tog bort en sak. Samtidigt kom två nya. Antalet måste ner, inte slipas.

## Vad som INTE föreslås röras

Kärnan är bra och testlåst av rätt skäl:

- `createQuote` (en väg in i `quotes`), radernas tredelning arbete/material/resa,
  ROT/RUT-motorn, offertnummer, signeringslänk.
- Dokumentet som yta (`QuoteDocument`, `QuoteDocumentSurface`, `RowEditSheet`,
  `AddRowSheet`), kundvyn `app/quote/[token]` inklusive tillval, signering, avböj,
  starttider, referensfoton och kundens fråga.
- Jobbtyper, upplägg per jobbtyp, prisupplösning mot företagets artiklar, frågeflödet
  (byggt i dag), förbehåll per jobbtyp.
- Skicka-modalen (kanal, mottagare, från-rad) och öppningsspårningen.
- Uppföljningens kärna, ett kort i godkännandekön per omgång.

---

## 1. Starten (från "Ny offert" till editorn)

| # | Element | Fil | Förslag | Varför | Låst av test |
|---|---|---|---|---|---|
| 1.1 | Fritextintaget `QuickIntake` (beskriv, foto, kund, "Bygg utkast") | `new/components/quick/QuickIntake.tsx` | **Behåll** som EN startskärm, med jobbtypsremsan överst | Christoffers "för mycket, rörigt" är löst här. Blir den enda startskärmen. | snabboffert-startvagar, quick-preferences |
| 1.2 | Jobbtypsremsan + frågeflödet | `QuoteJobTypeStart.tsx`, `IntakeQuestionFlow.tsx` | **Behåll**, blir huvudvägen | Prissatt offert innan hantverkaren går ut genom dörren. | job-type-start-ui, intake-questions |
| 1.3 ✅ | "Bygg själv" → mellanskärmen `QuickBlankStart` (titel + kund, "Sätt igång") | `quick/QuickBlankStart.tsx` (132 rader) | **Ta bort** mellanskärmen. "Bygg själv" går direkt till editorn; titeln skrivs i dokumentet | En skärm som bara frågar efter en titel som dokumentet ändå frågar efter. | snabboffert-startvagar (`startBlankQuickDraft`) |
| 1.4 ✅ | "Öppna editorn direkt" (header) | `QuickIntake.tsx:189` | **Slå ihop** med 1.3 till en knapp: "Bygg själv" | Två knappar som landar på samma ställe. | quick-preferences |
| 1.5 ✅ | "Använd en mall" + mallistan `QuoteNewStartChooser` (monterad två gånger) | `new/components/QuoteNewStartChooser.tsx` (112) | **Ta bort** ur starten. Mallar nås via jobbtypens upplägg | Filens egen kommentar: "Namnet behålls tills vidare". Det parallella passet tar redan bort listan. 2 av 39 offerter har en mall. | snabboffert-startvagar |
| 1.6 ✅ | **Riven 2026-09-17 (A1).** D2-vanan: preferens quick/editor/template, bannern "Vill du alltid börja så här?", räknare, 5 localStorage-nycklar, knappen "Beskriv jobbet i stället" | `lib/quotes/quick-preferences.ts` (137), `QuickStartPreferenceBanner.tsx` (72), `leaveQuickMode` | **Ta bort** helt | Var offerten startar är ett designbeslut, inte en inställning per person och enhet. Tre startlägen är tre versioner av appen att hålla i huvudet. | quick-preferences, snabboffert-startvagar |
| 1.7 ✅ | **Riven 2026-09-17 (A3).** Avvikande fynd: `first_quote`-överlämningen bär jobbtyp + mall, inte arbetsprovet — bannern var den ENDA vägen från provet till en offert, och `quotes.first_work_id` var satt på 0 av 39. Borttagen ändå; onboardingen visar provet i steg 2. `WorkSampleResume` "Fortsätt med jobbet du visade oss" (monterad i intag OCH editor) | `components/onboarding/WorkSampleResume.tsx` (55) | **Ta bort** ur offertstarten. Onboardingens arbetsprov blir en offert via `first_quote`-överlämningen, en gång | En onboardingbanner som lever kvar i varje ny offert. | customer-journey-value |
| 1.8 ✅ | `QuotePreparationInput` "Använd granskat kundunderlag" (details-panel) | `components/customer-preparation/QuotePreparationInput.tsx` (38) | **Flytta**: med `?preparation_id` läggs texten direkt i rutan. Panelen tas bort | Länken "Använd i ny offert" finns redan i kundunderlaget. Panelen är en andra väg till samma text. | quote-experience.ui |
| 1.9 ✅ | `FirstQuoteGuide` (tre steg efter onboarding) + "Ditt underlag är på plats" | `components/onboarding/FirstQuoteGuide.tsx` (50) | **Ta bort** guiden, behåll statusraden | Frågeflödet och dokumentet gör guidens jobb. | first-value-preview (helper) |
| 1.10 | Väntskärmen `QuickBuilding` | `quick/QuickBuilding.tsx` (138) | **Behåll** | Ärlig väntan på AI-svar. Noll test i dag, bör få ett. | – |
| 1.11 ✅ | **Riven 2026-09-17 (A3): återställs automatiskt, raden "Återställt från den här fliken · Börja om".** Återställningsfrågan "Du har en påbörjad offert" (helskärm) | `QuoteBuilder.tsx:2308` | **Slå ihop**: återställ automatiskt, visa en rad "Återställt · Börja om" | En helskärmsfråga innan man ens ser offerten. | quote-experience.ui |
| 1.12 ✅ | Query-param-dialekter `customer_id` / `customerId`, `?description` räknas inte som startsignal | `QuoteBuilder.tsx:955–1005` | **Slå ihop** till en dialekt; rätta `description` | 10 ingångar, 5 dialekter. | lars-preparation-review, golden-path |
| 1.13 | `?relief=`-överlämning + felbanner | `lib/relief/intake.ts` | **Behåll** | Liten, självgardande. | customer-relief.ui |
| 1.14 | Automatisk apply när ärvd jobbtyp har exakt en mall | `QuoteJobTypeStart.tsx:92` | **Behåll** | Ett tryck mindre när affären redan vet jobbtypen. | job-type-start-ui |

**Resultat om allt ovan görs:** 16 vägar in blir 6 (jobbtyp+frågor, fritext/foto,
bygg själv, affär/kund/lead-länk, återställning, Matte). En startskärm. Noll
localStorage.

## 2. Editorn (skapa-läget)

Bärande idé: **dokumentet är sanningen.** I dag finns fem fält på två ställen samtidigt
(titel, beskrivning, rabatt, villkor/ÄTA/betalningsvillkor/ej inkluderat, ROT). Varje
dubblett är en plats till att slipa.

| # | Element | Fil | Förslag | Varför | Låst av test |
|---|---|---|---|---|---|
| 2.1 | Kundkortet `QuoteNewCustomerSection`: kund, "+ skapa kund", prislistebanner, **titel, beskrivning** | `new/components/QuoteNewCustomerSection.tsx` (223) | **Slå ihop**: kortet blir kundval + skapa kund. Titel och beskrivning bara i dokumentet | Titel och beskrivning finns redan som redigerbara fält i A4:an. `validDays` är `@deprecated` men skickas fortfarande. | live-project-navigation-refresh |
| 2.2 | Rabatt-% i Summeringen OCH i dokumentet | `QuoteTotalsSection.tsx`, `QuoteDocument.tsx:508` | **Slå ihop**: bara i dokumentet | 0 av 39 offerter har rabatt. | – |
| 2.3 | Mer → Villkor & texter (referens, kundref, adress, ej inkluderat, ÄTA, betalningsvillkor, villkor) | `QuoteStandardTextsSection.tsx` (184) + `StandardTextPicker` | **Slå ihop**: texterna redigeras i dokumentet (finns redan), standardtext-väljaren flyttar dit. Referens och adress flyttar till kundkortet. Panelen tas bort | Sju fält på två ställen. | quotes-mer-i-flodet, quote-terms-crash |
| 2.4 | Mer → Stil (Modern/Premium/Personlig per offert) | `components/quotes/QuoteStylePicker.tsx` (122) | **Flytta** till inställningar (finns redan där som firmadefault). Tas bort ur offerten | 2 av 39 har en egen stil. | quotes-mer-i-flodet |
| 2.5 | Mer → ROT-detaljer (switch, personnummer, fastighetsbeteckning) + Summeringens avdragsväxel + ROT-badge per rad | `QuoteRotSection.tsx` (103), `QuoteTotalsSection.tsx` | **Slå ihop** de tre ROT-ytorna till en: växeln vid dokumentets summering, uppgifterna fylls av kunden vid signering (finns redan) | Kodens egen kommentar: "de tre ROT-ytorna gör TRE olika saker". | quotes-mer-i-flodet, rot-instruktion |
| 2.6 | Summeringen `QuoteTotalsSection` (exkl. moms, att betala, rabatt, avdragsväxel) | `QuoteTotalsSection.tsx` (203) | **Slå ihop** i dokumentets summering. Avdragsväxeln (Inget/ROT/RUT) blir en kontroll bredvid | Summorna står redan i dokumentet. | quote-document-empty-state |
| 2.7 | Mer → Betalplan | `QuotePaymentPlanSection.tsx` (120) | **Behåll** bakom Mer | 4 av 39. Sällan men på riktigt. | quote-ata-payment-plan |
| 2.8 | Mer → Visning (delsummor / rad för rad / full detalj) | `QuoteDisplaySettingsSection.tsx` (102) | **Behåll** bakom Mer, med firmadefault i inställningar | 1 av 39 avviker. | hidden-rows |
| 2.9 | Mer → Bilagor | `QuoteNewAttachmentsCard.tsx` (91) | **Behåll** bakom Mer | 3 av 39. | quote-attachments |
| 2.10 | Mer-raden blir 3 knappar i stället för 6, statusprickarna `panelStatus` kvar | `lib/quotes/panel-status.ts` (137) | Följer av 2.3–2.5 | | panel-status, quotes-mer-i-flodet (räknar 6 paneler) |
| 2.11 ✅ | **BESLUT 2026-09-17: A, listvyn borttagen.** Vy-växeln Dokument / **Listvy** (`QuoteItemsSection`, `ItemRow`, drag-and-drop, "Fler alternativ", snabbval, bläddra) | `QuoteItemsSection.tsx` (269) + ItemRow + combo | **Ta bort** listvyn. Rader läggs till och flyttas i dokumentet (`AddRowSheet`, `RowEditSheet` har flytta upp/ned) | "Offerten ÄR ytan" (masterplanen). Två radeditorer är två att slipa. **Största beslutet i listan.** | golden-path (kräver "Listvy"-knappen), launch-visibility |
| 2.12 | `QuoteNewAIHelper` (kamera, foton, fritext, "Generera offertförslag") inne i editorn | `new/components/QuoteNewAIHelper.tsx` (210) | **Ta bort**. AI-vägen är intaget. Tomrutans länk "beskriv jobbet" öppnar intaget igen | Två AI-ingångar. Noll test. | – |
| 2.13 | `QuotePackageComparison` Bas/Rekommenderat/Utökat | `components/quotes/QuotePackageComparison.tsx` | **Ta bort** nu. Kommer tillbaka som "bra/bättre/bäst" per jobbtyp (kontextdokumentet) | 4 tillvalsrader i hela databasen. | quote-packages-day-close.ui |
| 2.14 | `VisitRuleEditor` "planerade besök" (+ egen API-rutt, business_knowledge-rad) | `components/quotes/VisitRuleEditor.tsx` (88), `/api/quotes/visit-rule` | **Ta bort**. Blir en seedad fråga "Hur många besök?" i frågeflödet | Samma resultat, en mekanism i stället för två. 1 av 39 har förbehåll. | first-value-production-preview (helper) |
| 2.15 | `QuoteQuickstartCard` branschneutrala rader när firman saknar artiklar | `_shared/QuoteQuickstartCard.tsx` (119) | **Ta bort** | Jobbtypens upplägg + seedade mallar täcker det. | – |
| 2.16 | Completeness-remsan (header rad 2) + bottenfältets chip-rad "nästa sak att kontrollera" | `QuoteCompletenessStrip.tsx`, `lib/quotes/quote-completeness.ts` (152), `QuoteBuilderBottomBar` | **Ta bort**. "Välj kund först" som orsak vid Skicka räcker | Byggd för att navigera 34 kontroller. Med färre kontroller behövs ingen karta. | quote-completeness, quotes-mer-i-flodet, single-cta-surface |
| 2.17 | Tre bannrar: `QuoteNewEfterkalkylBanner`, `QuoteNewPriceWarningsBanner`, Daniel-buffertkortet + `DanielsBedomning` | `new/components/*` (~270) | **Slå ihop** till EN rad "Matte säger" som visar det som finns | Fyra ytor för en röst. | daniel-agentrad |
| 2.18 | Marginalkortet, prisminnet, förbehållsförslagen, "Fyll på från jobbtyp" | div. | **Behåll** | Självgardande, syns bara när de har något att säga. | margin-snapshot, job-type-append |
| 2.19 | Grossistsök `ProductSearchModal` (lanseringsgrindad) | `components/ProductSearchModal.tsx` (563) | **Ta bort** ur editorn tills grossist lanseras | Död kod bakom en grind. | launch-visibility |
| 2.20 | "Spara som mall" i header + separat inline-modal på detaljsidan | `QuoteSaveTemplateModal.tsx`, `[id]/page.tsx:586` | **Slå ihop** till en: "Spara som upplägg för jobbtypen" | Två implementationer. Det parallella passet gör redan att jobbtypen följer med. | job-standards |
| 2.21 | `RowEditSheet` (530 rader): komponentrader, spara som artikel, dölj för kund, visa vad som ingår | `components/quotes/document/RowEditSheet.tsx` | **Behåll**, men lägg dölj/komponenter bakom "Mer" i sheeten | 0 dolda rader i produktion. Kärnfälten först. | component-rows-editor |

**Resultat:** en tom offert går från ≈40 kontroller till ≈15 (kund, dokumentets fält,
lägg till rad, Mer med tre paneler, Spara, Skicka). Grovt 1 500 rader mindre i
editorn plus 3 156 → uppskattningsvis under 2 000 i `QuoteBuilder.tsx`.

## 3. Runtomkring

| # | Element | Fil | Förslag | Varför | Låst av test |
|---|---|---|---|---|---|
| 3.1 | Listan: fyra KPI-kort + `QuotePerformanceCard` + acceptrate i undertexten | `app/dashboard/quotes/page.tsx` (415) | **Slå ihop** till en rad | Tre ställen som säger samma sak. | – |
| 3.2 | "Föreslå nudge"-badge (ingen åtgärd kopplad) | `page.tsx:340` | **Ta bort** | En etikett utan knapp. | unopened-quote-nudge (logiken) |
| 3.3 | "Acceptera" per rad i listan (`confirm()`) | `page.tsx:93` | **Flytta** till detaljsidan som "Markera som accepterad" | Enda ställe med vunnen/förlorad, och det ligger i listan. | – |
| 3.4 | Ingen sortering | `page.tsx` | **Förbättra**: senast ändrad först | | quote-list-filter |
| 3.5 | Detaljsidan: `QuoteHandoff` (tre kolumner) + `ScheduledFollowup` + cron-uppföljning (två motorer) | `components/quotes/QuoteHandoff.tsx`, `ScheduledFollowup.tsx`, `app/api/cron/quote-follow-up` | **Slå ihop** till en uppföljning med ett läge: "Nästa påminnelse: datum · ändra · stäng av" | Två motorer synliga samtidigt på samma sida. | handoff-runtime, durable-followup |
| 3.6 | `QuoteSummaryCard` med tre ROT-dialekter (ny, legacy, grön teknik) | `[id]/components/QuoteSummaryCard.tsx` (158) | **Slå ihop** till en (den nya) | Legacy-visningen bör bort när v252 backfillat. | rot-instruktion |
| 3.7 | Två sign-link-rutter, två mall-API-familjer | `/api/quotes/sign-link` + `/api/quotes/[id]/sign-link`; `/api/quotes/templates` + `/api/quote-templates` | **Slå ihop** till en av varje | | quote-signing-atomic |
| 3.8 | Skicka-modalen: Kopia + BCC + ämnesrad | `[id]/components/QuoteSendModal.tsx` (327) | **Slå ihop** bakom "Fler mottagare" | Sällanfält på huvudvägen. | quote-experience.ui |
| 3.9 | Verklighetskontrollen (Business Twin) i skicka-modalen | `QuoteSendModal.tsx:103–188` | **Behåll** när `ready`, göm laddnings- och otillgänglig-lägena | Tre lägen för en rad. | quote-reality-check |
| 3.10 | Inställningar → Offertmallar (lista 548 + editor 591 rader) parallellt med Jobbtyper → upplägg | `settings/quote-templates/**` | **Slå ihop**: mallar = upplägg per jobbtyp. Mallsidan blir en vy under Jobbtyper | 45 mallar i databasen, 4 använda, 3 kopplade till jobbtyp. Två sanningar om samma sak. | quote-template-job-type-default, feature-gates-fail-closed |
| 3.11 | Standardtexter: typerna Inledning och Avslutning | `settings/quote-texts/page.tsx` | **Ta bort** de två typerna | Redan borttagna ur offertflödet (pilotbeslut 2026-07), lever kvar i inställningen. | quote-terms-crash |
| 3.12 | Per-offert-stilväljare (se 2.4) vs firmadefault i `settings/quote-style` | | **Behåll** firmadefault, ta bort per offert | | – |
| 3.13 | Agentverktyg `create_quote` (skapar direkt) och `create_quote_draft` (utkast) | `tool-definitions.ts:68, 103` | **Slå ihop** till utkast-vägen | Allt kunden får se går genom godkännandegränsen. | agent-tool-boundaries, create-quote-draft |
| 3.14 | Kundvyn | `app/quote/[token]` | **Behåll** allt. Lägg till "Så här går det till" när frågeflödet matar den | | – |

## 4. Rivningsordning

Fyra paket, ett i taget, var och ett grönt innan nästa. Varje borttagning tar med
sig sitt test, sin CSS och sina döda importer i samma commit.

| Paket | Innehåll | Rader bort (grovt) | Tester att ändra |
|---|---|---|---|
| A. Starten | 1.3–1.9, 1.11, 1.12 | ~700 | quick-preferences (bort), snabboffert-startvagar (skrivs om), job-type-start-ui (orörd) |
| B. Dubbletterna | 2.1–2.6, 2.10, 2.20 | ~900 | quotes-mer-i-flodet (6 → 3), quote-document-empty-state, rot-instruktion |
| C. Verktygen | 2.11–2.17, 2.19 | ~1 500 | golden-path (Listvy), quote-completeness, single-cta-surface, launch-visibility |
| D. Runtomkring | 3.1–3.13 | ~1 500 | handoff-runtime, durable-followup, quote-template-job-type-default |

Totalt grovt 4 000–5 000 rader bort. Siffran är en uppskattning från filstorlekar,
inte ett löfte.

## 5. Arbetsfördelning Claude / Codex

- **Claude** river paket A och B, Codex granskar varje PR adversariellt: "vad bar den
  här ytan som ingen annan yta bär?" Blir svaret något, stannar PR:en tills det är
  flyttat.
- **Codex** river paket C och D, Claude granskar på samma sätt.
- Ingen av oss river något som inte står med Ta bort eller Slå ihop i detta dokument
  efter sittningen. Nya idéer under rivningen skrivs upp, byggs inte.
- Efter varje paket: `tsc`, `test:contracts`, `next build`, och ett klickprov på
  telefon av huvudvägen (jobbtyp → frågor → offert → skicka).

## 6. Beslut (fylls i under sittningen)

| Rad | Beslut (Behåll / Slå ihop / Flytta / Ta bort) | Vem |
|---|---|---|
| 1.3 | | |
| 1.4 | | |
| 1.5 | | |
| 1.6 | | |
| 1.7 | | |
| 1.8 | | |
| 1.9 | | |
| 1.11 | | |
| 1.12 | | |
| 2.1 | | |
| 2.2 | | |
| 2.3 | | |
| 2.4 | | |
| 2.5 | | |
| 2.6 | | |
| 2.11 | | |
| 2.12 | | |
| 2.13 | | |
| 2.14 | | |
| 2.15 | | |
| 2.16 | | |
| 2.17 | | |
| 2.19 | | |
| 2.20 | | |
| 2.21 | | |
| 3.1 | | |
| 3.2 | | |
| 3.3 | | |
| 3.5 | | |
| 3.6 | | |
| 3.7 | | |
| 3.8 | | |
| 3.10 | | |
| 3.11 | | |
| 3.13 | | |
