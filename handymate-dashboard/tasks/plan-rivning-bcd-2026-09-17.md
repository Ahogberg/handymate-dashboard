# Rivning B, C och D — nattplan 2026-09-17

Andreas: "Kan du ta B, C och D medan jag sover?" Beslut: ja, körs av en
agent utifrån den här planen. Inventeringen
(`docs/offert/offertflodet-inventering-2026-09-17.md`, avsnitt 2–4) är
källan; bara rader märkta **Ta bort** eller **Slå ihop** rivs. Nya idéer
skrivs upp i rapporten, byggs inte.

## Läget när planen skrevs

- Branch `claude/gracious-brown-07lm99` på `80c933d7`, arbetsträdet rent.
- Paket A är klart (A1 startvanan, A2 listvyn, A3 starten). 2.11 och 2.19
  (listvyn, grossistsöket i editorn) är därmed redan gjorda.
- `QuoteQuickstartCard` och `QuoteCompletenessStrip` monteras INTE längre i
  `QuoteBuilder`/`QuoteEditView` — kontrollera om de är döda eller lever
  någon annanstans innan de raderas.
- Grinden: 2846 kontrakt gröna. 410 specar i `tests/` står UTANFÖR
  `test:contracts` — rörs inte i natt, triage i morgon.

## Ordning och grind

B → C → D-säkra. Ett paket i taget, varje paket grönt och committat innan
nästa börjar. Aldrig push av ett rött träd.

Per paket: `./node_modules/.bin/tsc --noEmit` → `npm run test:contracts` →
`npx next build` (EFTER tsc, aldrig parallellt: bygget rensar `.next/types`)
→ minst fyra mutationstest mot paketets facit, alla röda → commit → push.

## Paket B — dubbletterna (2.1–2.6, 2.10, 2.20)

Bärande idé: dokumentet är sanningen. Fem fält finns på två ställen.

| Rad | Gör | Behåll |
|---|---|---|
| 2.1 | `QuoteNewCustomerSection`: bara kundval + skapa kund. Titel och beskrivning bort ur kortet — de finns redigerbara i dokumentet. `validDays` är `@deprecated`: sluta skicka det om inget läser det | prislistebannern om den bär något dokumentet inte bär |
| 2.2 | Rabatt-% bara i dokumentet (`QuoteDocument.tsx`). Bort ur `QuoteTotalsSection` | rabattlogiken i beräkningarna |
| 2.3 | `QuoteStandardTextsSection` + `StandardTextPicker`: texterna redigeras i dokumentet (finns). Standardtextväljaren flyttar till dokumentets textfält. Referens och projektadress flyttar till kundkortet. Panelen bort | alla sju fälten i datamodellen och payloaden |
| 2.4 | `QuoteStylePicker` bort ur offerten. Firmadefault i inställningar finns redan | `template_style` på offerten läses fortfarande (kundvy, PDF) |
| 2.5 | Tre ROT-ytor → en: avdragsväxeln (Inget/ROT/RUT) vid dokumentets summering. `QuoteRotSection` bort; personnummer/fastighetsbeteckning fylls av kunden vid signering (finns) | ROT-badge per rad om dokumentet redan visar den; hela beräkningen |
| 2.6 | `QuoteTotalsSection` slås ihop i dokumentets summering, med avdragsväxeln bredvid | summorna och `customer_pays` |
| 2.10 | Mer-raden: 6 → 3 paneler (Betalplan, Visning, Bilagor). `panelStatus` kvar för de tre | |
| 2.20 | "Spara som mall" i header + inline-modal på detaljsidan → EN: "Spara som upplägg för jobbtypen" via `job-standard-server` | |

Facit att skriva om: `quotes-mer-i-flodet` (räknar 6 paneler → 3),
`quote-document-empty-state`, `rot-instruktion`, `live-project-navigation-refresh`,
`quote-terms-crash`, `job-standards`. Nytt facit `tests/rivning-b-dubbletter.spec.ts`
(gatas i BÅDA grindarna, en rad per fil i `contracts.yml`).

## Paket C — verktygen (2.12–2.17)

| Rad | Gör | Kontrollera först |
|---|---|---|
| 2.12 | `QuoteNewAIHelper` bort. Tomrutans länk "beskriv jobbet" öppnar intaget (`setQuickMode('intake')`) | att `applyAiResult` inte bara nås härifrån |
| 2.13 | `QuotePackageComparison` bort (30 rader) | `quote-packages-day-close.ui` skrivs om |
| 2.14 | `VisitRuleEditor` + `/api/quotes/visit-rule` + business_knowledge-raden bort. Ersätts av en seedad textfråga "Hur många besök?" i `seedIntakeQuestions` (lib/quotes/intake-questions.ts, i branschpaketets del) | `first-value-production-preview`-hjälparen och `first-value-production.spec` (visits-testet); `lib/quotes/visit-rule.ts` kan behöva stå kvar om andra läser den — radera bara det som blir dött |
| 2.15 | `QuoteQuickstartCard` bort | monteras den någonstans alls? |
| 2.16 | `QuoteCompletenessStrip` + `lib/quotes/quote-completeness.ts` + chip-raden i `QuoteBuilderBottomBar` bort. Skicka-knappens orsak "Välj kund först" räcker | `useQuoteSectionNavigation` använder `QuoteSection`-typen — behåll typen eller flytta den |
| 2.17 | `QuoteNewEfterkalkylBanner` + `QuoteNewPriceWarningsBanner` + Daniel-buffertkortet + `DanielsBedomning` → EN rad "Matte säger" som visar det som finns | `daniel-agentrad`-facit skrivs om; ingen ny AI-logik, bara en yta |

Facit: `quote-completeness`, `quotes-mer-i-flodet`, `single-cta-surface`,
`daniel-agentrad`, `quote-packages-day-close.ui`, `golden-path` (klickar
fortfarande "Listvy" — rad 494–506: skriv om till "+ Lägg till rad" →
`AddRowSheet`; sviten ligger utanför `test:contracts`). Nytt facit
`tests/rivning-c-verktygen.spec.ts`.

## Paket D — runtomkring, BARA de säkra raderna

Görs: 3.1, 3.2, 3.3, 3.4, 3.6, 3.8, 3.9, 3.11, 3.12.

| Rad | Gör |
|---|---|
| 3.1 | Listan `app/dashboard/quotes/page.tsx`: fyra KPI-kort + `QuotePerformanceCard` + acceptrate → EN rad |
| 3.2 | "Föreslå nudge"-badgen bort (logiken i `unopened-quote-nudge` orörd) |
| 3.3 | "Acceptera" per rad (`confirm()`) → detaljsidan som "Markera som accepterad", via samma väg som `finalizeAcceptedQuote` (source `'internt'`) |
| 3.4 | Sortering: senast ändrad först |
| 3.6 | `QuoteSummaryCard`: tre ROT-dialekter → den nya. Kontrollera i koden att legacy-fälten inte längre skrivs innan visningen tas bort |
| 3.8 | Skicka-modalen: Kopia + BCC + ämnesrad bakom "Fler mottagare" |
| 3.9 | Verklighetskontrollen: visa bara när `ready`; göm laddnings- och otillgänglig-lägena |
| 3.11 | Standardtexter: typerna Inledning och Avslutning bort ur inställningen |
| 3.12 | Följer av 2.4 |

**Görs INTE i natt — kräver Andreas:** 3.5 (två uppföljningsmotorer +
cron), 3.7 (två sign-link-rutter, två mall-API-familjer — externa anropare),
3.10 (Inställningar → Offertmallar blir en vy under Jobbtyper — stor UI),
3.13 (agentverktyget `create_quote` bort — ändrar Mattes beteende). Skrivs
upp i rapporten med vad som hittats.

## Regler för agenten

- Rör inga tabeller, kolumner eller SQL. Bara kod.
- Rader märkta **Behåll** i inventeringen rörs inte (2.7, 2.8, 2.9, 2.18,
  2.21, 3.14, 1.10, 1.13, 1.14).
- Osäker på om något bär värde ingen annan yta bär? Hoppa över raden,
  skriv i rapporten varför. Gissa aldrig. Fråga ingen — Andreas sover.
- Varje borttagning tar med sig sin CSS, sina döda importer och sitt test i
  samma commit. Ny spec registreras i BÅDA grindarna, en rad per fil i yml.
- All UI-text på svenska. Kommentarer i koden i samma stil som runtomkring
  (varför, inte vad; datum och beslut). Inga modellnamn i kod eller commit.
- Verktyg: `./node_modules/.bin/tsc`, `./node_modules/.bin/playwright`
  (aldrig `npx` för dessa). Browserspecar behöver
  `HANDYMATE_CHROMIUM_PATH=/opt/pw-browsers/chromium` och
  `HANDYMATE_TEST_CHROMIUM=/opt/pw-browsers/chromium`. Ett testNAMN som
  innehåller "failed" är inte ett fel — läs sviten's sista rad.
- Commit per paket. Push efter grönt. Aldrig PR. Bara branchen
  `claude/gracious-brown-07lm99`.
- Rapport i `tasks/rapport-rivning-bcd-2026-09-17.md`: per paket vad som
  revs, rader bort (mätt med `wc -l` före/efter), facit ändrade, mutationer
  (vilka, att de blev röda), det som hoppades över och varför, fynd.
