# Idag-vy-omdesign — desktop + mobil (2026-07-11)

Källor: `Idag-vy.html` (desktop-design) + `Idag-mobil.html` (mobil-design), båda Claude Design-exporter i repo-roten.
Utvärderingar: se minnesanteckning idag-vy-redesign (4 desktop-risker + 6 mobil-punkter).
Beslut från Andreas: Christoffer (pilot) äger lanseringsgrindarna → omdesignen byggs nu.

## Designbeslut (låsta)

- Hierarki: bevisband → agentremsa/teamrad → godkänn-kö ("Väntar på dig") → Klart idag → drill-down-kort
- Max 2 fulla kort i kön — resten kompakta rader som expanderas vid tryck (REGEL, inte data-flagga)
- Ingen svepgodkänning någonstans — pengabeslut kräver explicit tryck (mobilens ApprovalCard har swipe idag: TAS BORT)
- Ångra = klientfördröjd POST: godkännandet skickas efter 5 s snackbar-fönster; Ångra avbryter timern.
  Stängd flik = ärendet ligger kvar orört i kön (ärligt, ingen backend-ombyggnad)
- Inget fejkat: bevisband + agentremsa/teamrad drivs av /api/dashboard/team-activity (agent_runs m.m.)
- Inget nytt röstbygge: desktop får ingen mic-knapp; mobilen behåller befintliga /matte/voice via dockad Matte-rad
- "Pipeline"-etikett → "Verksamhetsöversikt" (matchar sidebar)
- Desktop-avatarer: initialer + agentfärg (som PendingApprovalsBlock); mobil: porträtt från assets/ai-team/
- Typsnitt: desktop använder befintliga font-heading (Space Grotesk) / font-body (DM Sans) ur tailwind.config;
  mobil använder systemfont + SpaceGrotesk för stora tal (tokens.ts-konvention)
- autonomy_offer ("Förtroende") renderas som eget kort-läge: "Ja, kör automatiskt" / "Fortsätt fråga"
  (backend helt klar: grantAutonomy/revokeAutonomy i /api/approvals/[id])
- CashRadarCard + WeeklyValueDigest BEHÅLLS (lanseringskritiska, nyss byggda) — flyttas under drill-raden
- Onboarding/setup-banners behålls under kärnstacken (kö-kort-idén = senare iteration)

## Datakällor (verifierade av utforskning)

| Yta | Källa |
|-----|-------|
| Bevisband-siffror | GET /api/dashboard/team-activity → summary (total_calls, total_sms, total_quotes, ...) |
| Agentremsa (desktop) | Befintlig TeamActivityStrip (team-activity + /api/observations) — redan riktig data |
| Kön | supabase pending_approvals + POST /api/approvals/[id] {action} |
| Klart idag | KOLLA: /api/automations/activity shape; fallback customer_activity. Godkända läggs till klient-side |
| Dagens plan / Nästa bokning | booking-tabellen (dashboard: scheduled_start+customer(name); mobil: fetchTodayBookings) |
| Jag är på väg | Desktop: OnMyWayButton (finns, död import idag). Mobil: sendOnMyWay (finns i today.tsx) |
| Verksamhetsöversikt-kort | GET /api/pipeline/stats (totalValue, totalDeals, newLeadsToday); mobil: fetchPipeline |
| Fakturor-kort | NY endpoint GET /api/dashboard/economy-summary (unpaid count/amount + fakturerat månad) — delas desktop+mobil |
| KPI-fot | GET /api/dashboard/stats |

## Checklista

### Förarbete
- [ ] Kolla /api/automations/activity response-shape (Klart idag-källa)
- [ ] Kolla om POST /api/approvals/[id] stödjer redigerad message (annars: "Ändra" → /dashboard/approvals)
- [ ] Kolla ActivityLog-shape i mobilens fetchRecentActivity (AUTO-badge-underlag)

### Backend (dashboard-repo)
- [ ] GET /api/dashboard/economy-summary — getAuthenticatedBusiness + invoice-queries (samma som page.tsx inline idag)

### Desktop (feat/idag-vy-redesign)
- [ ] IdagProofBand — bevisband av team-activity summary + pending-count; neutral fallback när allt är 0
- [ ] IdagQueue — max 2 fulla kort + kompakta rader; Godkänn/Ändra/Avvisa; autonomy_offer-läge; 5s ångra-snackbar
- [ ] IdagDoneList — Klart idag, AUTO-badge, klientpåfyllnad vid godkännande
- [ ] Drill-rad: Dagens plan / Verksamhetsöversikt / Fakturor
- [ ] KPI-fot (vecka)
- [ ] Ny sektionsordning i page.tsx; död state rensas (speedData, insights, seasonSummary, profitProjects, scheduleToday)
- [ ] Säljtratt/Ekonomi/Senaste aktivitet/Att göra idag utgår från startsidan (finns kvar på undersidor)
- [ ] Skeletons för nya sektioner

### Mobil (handymate-mobile, branch från fix/b2-mobile-execution-read — beror på omergade approvals/Matte-commits)
- [ ] lib/api.ts: fetchTeamActivity + fetchEconomySummary
- [ ] ProofBand-komponent
- [ ] NextBookingCard med inline "Jag är på väg — skicka SMS till kunden" (återanvänd sendOnMyWay-flödet)
- [ ] Kö: max 2 fulla ApprovalCard + ny ApprovalCompactRow; ta bort swipe ur ApprovalCard
- [ ] TeamRow (6 porträtt + senaste verkliga händelse)
- [ ] DoneList (hopfällbar, AUTO-badge, auto-expanderad när kön är tom)
- [ ] Tiles: Verksamhetsöversikt (fetchPipeline) + Fakturor (economy-summary)
- [ ] MatteDockBar ersätter MatteCTA + mic-block (input → /matte, håll mic → /matte/voice)
- [ ] Ångra-snackbar med fördröjd respondToApproval
- [ ] home.tsx ny ordning; tomt läge per Frame B

### Verifiering
- [ ] Dashboard: npx tsc --noEmit → 0 fel
- [ ] Dashboard: npx next build → ren
- [ ] Mobil: npx tsc --noEmit → 0 fel
- [ ] UI-svep: inga engelska termer, teal-tema, 44px touch targets (mobil)

## Review
(fylls i efter bygge)
