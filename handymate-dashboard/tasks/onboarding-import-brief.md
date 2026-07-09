# Design-brief: "Hämta in din verksamhet" — nytt onboarding-steg

_För Claude Design. Datum: 2026-07-09. Mål: time-to-value dag 1 = #1 anti-churn._

## Varför
En nykund landar idag på ett TOMT CRM → AI-agenterna har inget att jobba på → produkten
känns som ett skal, och 5 995 kr/mån känns dyrt. Om vi importerar kundens BEFINTLIGA
verksamhet (kunder + öppna fakturor) blir dag 1 i stället: Karin hittar deras riktiga
förfallna fakturor, Hanna ser deras vilande kunder, dashboarden är full. Det är beviset som
motiverar priset. **Öppna fakturor är den viktigaste datan** — de får Karin (vår "spara dig
pengar"-agent) att lysa upp direkt.

## Placering i flödet
Nytt steg **efter betalning (Step5Activate), före LiveTour**. Kunden är då committad och
motiverad; och LiveTour/slutskärmen kan sedan visa deras RIKTIGA data i stället för dagens mock.
Ny stegordning (7 steg): MeetTheTeam · Business · HowYouWork · Phone · **Activate · Hämta in
verksamhet · LiveTour**. (Claude/backend sköter steg-plumbingen i `page.tsx`; Design bygger ytan.)

## Designsystem (återanvänd befintligt)
Samma som övriga steg: `--ob-*` CSS-variabler (t.ex. `--ob-primary-700` teal, `--ob-surface`,
`--ob-border`, `--ob-ink`/`--ob-ink-2`, `--ob-r-md`), samt `OnboardingHeader`, `StepProgress`,
`InfoSheet`. Titta på `Step5Activate.tsx` (kort/knapp-stil, garanti-banner) och
`Step3HowYouWork.tsx` (val-chips) som mönster. Mobil-först (hantverkare på telefon).

## Skärmar & states

### A. Val-skärm (default)
- **Rubrik:** "Låt ditt AI-team börja jobba direkt"
- **Underrubrik:** "Hämta in dina kunder och obetalda fakturor — så börjar dina AI-kollegor
  jobba på din verksamhet från minut ett."
- **Två primära val-kort (stora, tydliga):**
  1. **"Koppla Fortnox"** — badge "Rekommenderat". Ikon. Undertext: "Hämtar dina kunder och
     obetalda fakturor automatiskt." → startar Fortnox-OAuth.
  2. **"Ladda upp kundlista"** — Undertext: "Har du en CSV/Excel-fil? Vi läser in den åt dig."
     → öppnar CSV-importern (se D).
- **Diskret länk under korten:** "Hoppa över — jag gör det senare" (grå, liten). Blockerar
  ALDRIG aktivering.
- **"Det här låser upp"-rad** (liten, under korten, ikon-punkter): "Karin jagar dina obetalda
  fakturor · Hanna väcker vilande kunder · Daniel följer upp dina offerter."

### B. Fortnox — kopplar (mellan-state)
Efter klick på "Koppla Fortnox" → redirect till Fortnox OAuth (extern). Vid retur till
onboardingen visas kort en laddnings-/hämtar-state: "Hämtar din verksamhet från Fortnox…"
(spinner). Backend kör kund- + fakturaimport.

### C. Fortnox — klart (success-state) ← DEN VIKTIGA
Stort, positivt. **Visa de faktiska siffrorna:**
- "✓ Vi hämtade **{X} kunder** och **{Y} obetalda fakturor** ({Z} kr utestående)."
- Om öppna fakturor finns: en liten "Karin är redan igång"-rad: "Karin har förberett
  påminnelser på dina {Y} förfallna fakturor — du godkänner dem på dashboarden."
- Primär knapp: "Fortsätt".
- (Om Fortnox saknar data eller fel: mjuk fallback → "Vi kunde inte hämta allt — du kan
  ladda upp en fil i stället" + länk till CSV. Aldrig en återvändsgränd.)

### D. CSV-import (inbäddad)
Återanvänd den BEFINTLIGA, polerade 4-stegs-wizarden som redan finns på
`app/dashboard/customers/import/page.tsx` (fil-drop, auto-kolumnmappning, dedup-val,
sammanfattning). Bädda in den i steget (eller en kondenserad inline-variant i samma stil).
Efter klar → samma success-känsla som C ("✓ {X} kunder inlästa").

### E. Payoff (ersätter/kompletterar mock-touren)
LiveTour visar idag en HÅRDKODAD mock-dashboard. Byt till att visa kundens RIKTIGA
importerade data + Karins första fynd. Minst: "Din dashboard är redo — {X} kunder,
{Y} fakturor att följa upp." Om vi kan: Karins konkreta krona-fynd ("3 förfallna fakturor
värda 45 000 kr väntar på din åtgärd"). Detta är det som säljer priset.

#### Datakontrakt — `GET /api/onboarding/instant-value` (backend, KLART)
Deterministisk, synkron sammanfattning ur kundens NYSS importerade data — inget cron,
ingen agent. Samma status-/fältkonventioner som cash-radarn (`invoice.status IN
('sent','overdue')`, belopp = `invoice.total`) → payoff-siffrorna matchar dashboarden,
ingen drift. `Step6LiveTour.tsx` anropar den på mount. Svar (JSON):

| Fält | Typ | Betydelse |
|------|-----|-----------|
| `overdue_count` | number | Antal förfallna fakturor (`status='overdue'`) |
| `overdue_sum_kr` | number | Summa förfallna fakturor (kr, heltal) |
| `unpaid_count` | number | Antal obetalda fakturor (`status` sent+overdue) |
| `unpaid_sum_kr` | number | Summa obetalda fakturor (kr, heltal) |
| `customer_count` | number | Antal importerade kunder |
| `open_deals_count` | number | Öppna affärer (ej won/lost) |
| `open_deals_value_kr` | number | Summa öppna affärers värde (kr, heltal) |
| `headline` | object | Det STARKASTE ärliga fyndet, se nedan |

`headline = { agent: 'Karin'|'Hanna'|'Daniel'|'Lisa', text: string, amount_kr?: number, count?: number }`.
`text` är färdig svensk copy — designen visar den rakt av (dynamiskt fält att stila runt).

**Headline-prioritet (backend väljer, honest — bara det som finns i datan):**
1. Förfallna fakturor finns → Karin: `"Karin har hittat {overdue_count} förfallna fakturor värda {overdue_sum_kr} kr"`
2. Annars obetalda fakturor → Karin: `"Karin bevakar {unpaid_count} obetalda fakturor värda {unpaid_sum_kr} kr"`
3. Annars öppna affärer → Daniel: `"Daniel följer upp {open_deals_count} öppna affärer"`
4. Annars kunder → Hanna: `"{customer_count} kunder redo — dina AI-kollegor är på plats"`
5. Allt tomt (skippad import) → Lisa: `"Ditt AI-team är redo — lägg till kunder så börjar de jobba"` (alla siffror 0)

**States designen måste hantera:** laddar (fetch pågår) → neutral placeholder, aldrig tom yta;
fetch-fel/tomt → mjuk generisk tour (aldrig trasig skärm); skippad import → punkt 5 ovan.
Finish-knappen ("Kör igång") får ALDRIG blockeras av detta fetch.
Dynamiska fält att designa placeholders för: `headline.text` (rubrik), samt stödsiffrorna
`customer_count`, `unpaid_count`, `open_deals_count`.

## API-kontrakt (backend bygger dessa; komponenten anropar dem)
- `POST /api/fortnox/import/customers` — FINNS. → `{ imported, skipped, total, errors }`.
- `POST /api/fortnox/import/invoices` — **NYTT (backend bygger)**. Drar öppna/obetalda
  fakturor från Fortnox → lokala `invoice`-rader (status sent/overdue, förfallodatum, kopplade
  till importerade kunder). → `{ imported, skipped, total, total_outstanding_kr, errors }`.
- Fortnox-OAuth från onboarding: connect-routen får en `return=onboarding`-param så callbacken
  landar tillbaka på onboarding-steget i stället för inställningar (backend fixar).
- CSV: `POST /api/customers/import` (el. bulk) — FINNS (wizarden använder den redan).
- En liten status-endpoint för success-siffrorna (X kunder/Y fakturor/Z kr) — backend
  exponerar det i importsvaret så komponenten kan visa dem direkt.

## Arbetsdelning
- **Claude Design:** bygger/putsar ytorna A–E i befintlig `--ob-*`-stil. En FUNGERANDE men
  enkelt stylad `StepImportData.tsx` kommer finnas (backend skapar den + wire:ar in steget i
  page.tsx) — Design förfinar den visuellt, byter inte ut logiken/API-anropen.
- **Claude (backend):** `getFortnoxInvoices()` + `POST /api/fortnox/import/invoices` (mappar
  till `invoice`-rader så Karin/cash-radarn ser dem; skapar INTE utskick — bara data +
  ev. förberedda godkännanden), wire:ar kund-CSV + Fortnox-kundimport i steget, OAuth-retur
  till onboarding, och steg-plumbingen (TOTAL_STEPS, resume, payment=success → importsteget).

## Viktigt (fallgropar)
- Importerade förfallna fakturor får INTE trigga automatiska SMS-utskick. Reminders är gatade
  (godkännande) sedan P1 — importen sätter reminder_count=0 så Karin FÖRESLÅR att jaga, inget
  skickas automatiskt.
- Personnummer/orgnr: CSV-importern tar inte in dem idag; Fortnox-kunder kan sakna dem. För
  ROT/RUT behövs personnr — flagga i UI att det kan fyllas i senare (ej blockerande nu).
- Aldrig blockera aktivering: "Hoppa över" ska alltid finnas; fel i Fortnox → mjuk CSV-fallback.
