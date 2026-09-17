# Rapport — rivning B, C, D (natten 2026-09-17)

Körd av en agent enligt `tasks/plan-rivning-bcd-2026-09-17.md`, utan att fråga
Andreas (han sover). Uppdateras löpande, ett paket per commit.

## Status i korthet

- **Paket B: KLART, grönt, pushat.** Rad 2.1–2.6, 2.10 gjorda. Rad 2.20
  **hoppad över** (se motivering nedan).
- **Paket C: EJ PÅBÖRJAT.** Paket B tog hela nattens tidsbudget — det visade
  sig vara ett djupare ingrepp än radantalet i planen antydde (avdragsväxeln
  och standardtextväljaren behövde flyttas in i den delade dokumentmotorn
  `QuoteDocument.tsx`, som även faktura-editorn använder, vilket krävde
  försiktig verifiering rad för rad innan varje borttagning).
- **Paket D: EJ PÅBÖRJAT.**
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

Se `git log` på branchen `claude/gracious-brown-07lm99` för commit-hashen
(skrivs in här efter push, se sista raden i den här rapporten).

## Paket C — verktygen (2.12–2.17)

**Inte påbörjat.** Paket B tog längre än planens grova radantal antydde,
eftersom två av borttagningarna (avdragsväxeln, standardtextväljaren) inte
kunde "bara tas bort" — de bar ett värde (bulkavdrag på alla rader i ett
klick, snabbval av sparad standardtext) som ingen annan yta redan täckte, och
fick därför flyttas in i den delade dokumentmotorn med försiktig verifiering
(dokumentmotorn används oförändrad av fakturans egen editor, se ovan). Att
göra det snabbt och slarvigt hade riskerat att bryta antingen offertens eller
fakturans redigering. Natten tog slut innan paket C kunde påbörjas med samma
noggrannhet.

## Paket D — runtomkring

**Inte påbörjat.**

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

**Pushat:** Paket B (rad 2.1–2.6, 2.10) — dokumentet är nu den enda platsen
för titel, beskrivning, rabatt, ROT/RUT-avdragsväxeln och de fyra
standardtexterna (med "Välj standardtext" flyttad dit); referens- och
adressfält bor i kundkortet; stilväljaren och "Mer"-radens tre borttagna
paneler är borta ur offertflödet (komponenten själv lever kvar åt fakturan).
Grönt: tsc 0 fel, 2846/2846 kontraktstest, ren build, fyra mutationer
bekräftat röda och återställda.

**Lämnat:** Rad 2.20 (gjordes inte — jobbtypskopplingen på offerten saknas
ännu, se motivering ovan), hela paket C och paket D (inte påbörjade — natten
tog slut efter paket B).

**Viktigaste fyndet:** Flera av "ta bort"-raderna i planen (2.3 texternas
standardväljare, 2.5/2.6 avdragsväxeln, och i förlängningen 2.20/3.10:s
mallar) är inte rena dubbletter att radera — de bär ett värde som måste
flyttas till en ny, korrekt plats INNAN den gamla ytan får tas bort, annars
försvinner en funktion i onödan. Där den nya platsen redan fanns (rabatt- och
textfälten i dokumentet) gick rivningen snabbt. Där den inte fanns
(avdragsväxeln, jobbtyp-kopplingen på offerten) tog flytten längre tid än
planens radantal antydde, och i 2.20/3.10:s fall finns den nya platsen inte
alls än — de får vänta på "det parallella passet".
