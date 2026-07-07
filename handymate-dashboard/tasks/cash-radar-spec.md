# Pengar in-radarn — design-spec

_Datum: 2026-07-07 · Status: design godkänd av Andreas ("Kör")_
_Beslut låsta: deterministisk regelprojektion (ej AI) · stage-vikter 90/35/15 ·
dipp = <60% av normal · cold-start-gate ≥4 veckors betalhistorik · INFLÖDEN, ej utgifter_

## Mål
Karin projicerar förväntade **inbetalningar** 5 veckor framåt (denna + 4), flaggar
dippar mot företagets egen normal och kopplar en-trycks-åtgärder till varje dipp.
Serviceföretag dör av kassaflöde — ingen konkurrent ger hantverkare framåtblickande
pengar med knappar som fixar det.

## Projektionsmotorn (lib/cash-radar.ts — RENA funktioner, enhetstestbara)
- **Fakturor** (obetalda, status sent/overdue): förväntad vecka = due_date +
  företagets MEDIAN-försening (paid_at − due_date över betalda fakturor senaste
  180 dgr; <3 datapunkter → 0 dagar). 100% av total (åtaganden).
- **Pipeline** (öppna deals, value>0, ej won/lost): vecka = expected_close_date,
  annars stage-schablon (quote_accepted +1v, quote_sent +2v, övriga +3v).
  Stage-vikter: quote_accepted 0.9 · quote_sent 0.35 · contacted/new_inquiry 0.15.
  Märks ALLTID "viktad potential" — blandas aldrig med faktura-siffran.
- **Normal**: median av faktiska inbetalningar per vecka (betalda fakturor,
  senaste 12 v). **Dipp**: kommande veckas (fakturor + potential) < 60% av normal.
- **Cold-start-gate**: <4 veckor med ≥1 inbetalning → `ready:false`, kortet visar
  "Radarn bygger din normal — kommer igång efter några veckors fakturering."
  ALDRIG falska larm på tom historik.

## Ytor
1. **Dashboard-kort "Pengar in"** (direkt under veckodigesten): 5 veckostaplar
   (fakturadel solid teal, potentialdel skuggad/streckad), normal-linje,
   dipp-veckor markerade (amber). Fotnot: "Visar pengar in. Utgifter ingår inte."
   Under dipp: **Karins åtgärder** (max 3, sorterade på belopp):
   - "Påminn faktura {nr} ({kr})" → befintliga POST /api/invoices/[id]/reminder
   - "Jaga offerten till {kund} ({kr})" → skapar quote_nudge-godkännande
     (befintlig approval-typ; payload {to, message} — servern bygger)
   - "Väck en gammal kund" → länk till Hannas förslag (/dashboard/approvals)
   Åtgärdad rad markeras (✓, disabled).
2. **Måndagsbriefen**: buildKarinBrief får radar-raden vid dipp: "Vecka {v} ser
   tunn ut (~{X} kr mot normala ~{Y}) — jag har förberett åtgärder på
   dashboarden." Ingen ny cron (morgonrapporten kör redan).

## API
- `GET /api/dashboard/cash-radar` (auth): { ready, normal_kr, weeks:[{week_start,
  invoiced_kr, potential_kr}], dips:[{week_start, expected_kr, actions:[...]}] }.
  Datahämtning + motor delas i server-lib så morgonbriefen återanvänder samma
  beräkning (ingen drift).
- `POST /api/dashboard/cash-radar/nudge` (auth): { quote_id } → skapar
  quote_nudge-pending_approval (server bygger to/message ur offert+kund;
  dedup mot öppet nudge-förslag för samma offert).

## Ärlighetsregler (bärande)
Tre siffror hålls isär: fakturerat (åtagande) / viktad potential (märkt) /
normal (historisk median). Ingen "prognos"-retorik. Utgifter nämns explicit som
utanför. Alla åtgärder gated via befintliga vägar — ingen ny exekverings-wiring.

## Verifiering
tsc 0 · build ren · enhetstester (median-försening inkl. <3-gate, veckobucketing,
stage-vikter, dipp-detektion, cold-start-gate) · manuellt facit mot Bees data.

## Utanför scope (v2+)
Utgiftssidan (Fortnox/fasta kostnader), AI-förfining av vikter per företags
historik, autonomi-gradering av radar-åtgärderna (komponerar redan via
förtjänad autonomi när samma åtgärdstyper graderas).
