# Vilande pengar-masterplan — "Teamet räddade X kr åt dig i månaden"

_2026-08-05, Andreas-godkänd inriktning: paketera befintlig outbound
(offertjakt, återaktivering, service, kapacitet-fyllnad) till ETT säljbart
koncept mätt i återvunna kronor. "Detta är en enorm säljpitch." Underlag:
read-only-kartläggning samma dag (fil:rad-referenser i sprint-loggen).
Kapacitets-primitiven (lib/capacity/free-capacity.ts) klar och inkopplad._

## Nordstjärna & ärlighetslag

EN yta som visar: **Vilande** (potential som ligger — osålda offerter,
tysta kunder, missad service) och **Återvunnet** (verifierade kronor efter
teamets kort). Ärlighetslagen styr allt:
- "Återvunnet" = ENDAST verifierade händelser (offert accepterad / faktura
  betald / bokning skapad) inom attributionsfönster EFTER ett godkänt kort.
  Aldrig schabloner i den siffran.
- "Vilande" = potential, alltid märkt som potential — aldrig ett löfte.
- Kartläggningens mätfel FIXAS, aldrig byggs runt (quote-follow-up loggar
  "success" före sändning; saved-scoreboard utelämnar medvetet kronor
  tills kopplingen finns — VI BYGGER kopplingen, sedan får den kronor).
- Pitch använder bara confirmed-siffror (sales-arsenal-reglerna).

## Kartläggningens 10 gap (styr etappordningen)

1 ingen utfallskoppling kort→intäkt; 2 recovered_revenue finns inte;
3 proactive-care + warranty-followup DÖDA (frågar projects/customers
plural — tabellerna heter project/customer); 4 quote-follow-up loggar
success före sändning + missar status 'opened' i huvudloopen; 5 ingen
summering av osålda offerters värde/ålder; 6 tre-fyra olika "tyst kund"-
definitioner; 7 ingen opt-out/spärrlista för kunder; 8 agent-SMS går
förbi kvot/hardCap; 9 fyra kort-producenter utan gemensamt frekvenstak
per kund; 10 hanna-outbound saknar agents_globally_paused-kontrollen.

## VP1 — Säkerhetsfundamentet (före all skalning) — KLAR 2026-08-05 (v86 körd)

- **Opt-out/spärrlista** (gap 7): kolumn på customer (sql/v86, Andreas
  kör; koden tål okörd migration) + kontroll i sendSmsViaElks-vägen för
  ALLA agentutskick + inkommande "STOPP/SLUTA"-SMS flaggar kunden
  (46elks-webhooken finns) + synligt på kundkortet med manuell toggle.
- **Kvot på agentvägen** (gap 8): approval-exekveringens SMS-cases +
  nurture räknar mot befintliga sms-usage/hardCap; vid tak → kortet
  felar ärligt ("SMS-kvoten nådd"), aldrig tyst.
- **Gemensamt frekvenstak** (gap 9): delad lib-kontroll "max 1 outbound-
  kort per kund per X dagar över ALLA producenter" (send_sms/
  proactive_care/avtal/capacity_fill) — producenterna anropar den före
  kortskapande; befintliga snävare dedupes behålls ovanpå.
- **Paus-kontrollen** (gap 10): agents_globally_paused in i
  hanna-outbound-cronen (mönstret från kapacitet-fyllnad).

## VP2 — Attributionsryggraden (ärliga kronor) — KLAR 2026-08-05

- **approval_id nedströms** (gap 1): utskicks-cases stämplar approval_id
  i v3_automation_logs (kolumnen finns, fylls inte); sms_log får
  approval_id-referens där den saknas.
- **recovered_revenue-kärnan** (gap 2): ren lib (lib/value/recovered-
  revenue.ts) — händelsekedja kort godkänt → (offert accepterad ≤14 dgr |
  faktura betald ≤14 dgr | bokning skapad ≤7 dgr för kunden) →
  attribuerad krona med agent + kortreferens. Facit-testas HÅRDAST i
  sprinten (dubbelattribution förbjuden: en intäkt räknas EN gång även
  om två kort föregick den — senaste kortet vinner, dokumenterat).
- **Mätfelen** (gap 4): quote-follow-up loggar utfall EFTER faktisk
  sändning/köning med rätt status; huvudloopen inkluderar 'opened';
  förfallo-nudgens direkta 46elks-inline byts till sendSmsViaElks
  (kvoten från VP1 gäller då även den).
- weekly-value.ts konvergerar mot kärnan (behåller sin yta, byter motor
  där confirmed_kr räknas — schablondelarna captured/tid orörda men
  TYDLIGT separerade i UI-copy).

## VP3 — Väck de döda + en tyst-kund-primitiv — EJ PÅBÖRJAD

- **proactive-care + warranty-followup** (gap 3): tabellnamnen rättas
  (project/customer/warranty singular), felen LARMAR via driftlarm-
  cronen istället för tyst console.log; JOB_LIFECYCLE-logiken (16
  jobbtyper med serviceintervall) börjar äntligen producera kort —
  gated genom VP1:s frekvenstak + befintlig proactive_care-kortväg.
- **En "tyst kund"-primitiv** (gap 6): lib/customers/quiet-customer.ts —
  EN definition (last_job_date-baserad, parametriserad tröskel);
  hanna-outbound (6 mån), capacity-fill (90 dgr) och proactive-care
  (per jobbtyp) blir parametriserade konsumenter av samma kärna —
  BETEENDET per konsument bevaras (olika trösklar är medvetna), bara
  beräkningen förenas. Facit-test.
- rejected/declined-dubbletten (gap 6-bis): delad OPEN_QUOTE_STATUSES-
  konstant används i alla osålda-filter.

## VP4 — Siffran + ytan — EJ PÅBÖRJAD

- **Vilande pengar-beräkningen** (gap 5): lib/value/vilande-pengar.ts —
  (a) osålda offerter (sent/opened, exkl. expired) med värde + ålder,
  (b) tysta kunder (primitiven) × försiktig potential (märkt schablon:
  snitt av kundens egna historiska jobbvärden, ALDRIG påhittad
  branschsiffra), (c) missad service (VP3:s JOB_LIFECYCLE-kandidater).
  Facit-tester.
- **Ytan** (kartläggningens tre platser): (1) fjärde drill-kortet i
  IdagCore ("Vilande pengar → 84 000 kr"); (2) värdebevis-ytan
  (dashboard/page.tsx vid CashRadar/WeeklyValue): kortet "Återvunnet i
  månaden: X kr" med agent-attribution + de senaste återvunna raderna;
  (3) SavedScoreboard får äntligen kronor (deras egen TODO-kommentar
  uppfylls — kopplingen finns nu). Klick → enkel drill-vy per kategori
  med direktknappar till respektive agents kort-skapande.
- Demo-seeden utökas (märkt demo-data) så ytan demoar rikt.

## VP5 — Paketeringen (säljpitchen) — EJ PÅBÖRJAD

- sales-arsenal.md: ny sektion "Vilande pengar"-pitchen — demo-replik
  ("Ni har 84 000 kr i offerter ingen jagat och 12 kunder som inte hört
  av sig på ett år. Teamet jagar — du godkänner.") + ärlighetsregler
  (confirmed-siffror i skarp pitch; potential alltid märkt).
- demo-manus: Vilande pengar-akten; capability-inventory: BYGGT★-rader;
  SEO-utkast "vilande pengar hos hantverkare" (publiceras EJ före
  Andreas-test).
- EFTER Andreas skarptest: överväg onboarding-momentet "din vilande-
  pengar-siffra dag 1" (störst aha — men gated på verklig data-kvalitet).

## Ordning & verifiering

VP1 → VP2 → VP3 → VP4 → VP5. Per etapp: tsc + FULL next build +
facit-tester (VP2:s attributionskärna hårdast — dubbelattribution,
fönstergränser, agent-attribution). SQL: v86 (opt-out) + ev. v87
(index) på Andreas körlista, ordningssäkra. Inga externa utskick utan
kö (nurtures medvetna undantag RÖRS INTE i denna sprint — dokumenterat
befintligt beteende, eget beslut senare). En byggagent åt gången; jag
speccar/granskar/committar. BYGGT→SÄLJBART kräver Andreas skarptest +
minst en verklig återvunnen krona på riktig kunddata innan pitchen
används skarpt.
