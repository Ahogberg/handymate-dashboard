# Pilot-feedback från möte 2026-05-20

20 punkter från Christoffer + en regression-bugg från igår. Klassificerad
efter allvarlighet för triage inför launch 25/5.

═══════════════════════════════════════════════════════════════════
## TIER 1 — BLOCKERAR LAUNCH (måste fixas, ~2-3h)
═══════════════════════════════════════════════════════════════════

### T1.1 — Status-ändring på projekt händer ingenting (toast utan effekt)
**Symptom:** Klick → "Status ändrad" toast → ingen DB-uppdatering eller workflow-trigger
**Lokalisering:** [app/dashboard/projects/[id]/page.tsx] status-toggle handler + ev. `/api/projects/[id]/status` route
**Estimat:** 30-45 min utredning + fix
**Allvarlighet:** Användaren tror systemet är trasigt — direkt förtroendekris

### T1.2 — "Beskrivning"-text kommer inte med i skickad offert
**Symptom:** Användaren skriver beskrivning vid offert-skapande → den finns inte i PDF/email till kund
**Lokalisering:** `app/api/quotes/pdf/route.ts` + `app/api/quotes/send/route.ts` + ev. `app/dashboard/quotes/new/page.tsx`
**Estimat:** 30-45 min
**Allvarlighet:** Kritiskt — kund får ofullständig offert, säljskada

### T1.3 — "Villkor" + "Ej inkluderat" finns inte vid skapande av offert
**Symptom:** Färdig offert visar fält som inte gick att fylla i
**Lokalisering:** Quote-builder UI (form-fält saknas) + säkerställa de finns i edit-läge
**Estimat:** 45 min - 1h
**Allvarlighet:** Hög — säljare kan inte skriva kompletta offerter v1

### T1.4 — Ny kund-modal i "Ny deal"-flowen visar bara 4 fält
**Symptom:** Friktion vid första deal-skapande — kund-konfig ofullständig
**Lokalisering:** [app/dashboard/pipeline/components/NewDealModal.tsx] inline ny-kund-form (4 fält) ska ersättas med full `CustomerModal`
**Estimat:** 30 min (återanvänd befintlig CustomerModal)
**Allvarlighet:** Hög — onboarding-friktion för nya kunder

### T1.5 — ProjectStageModal tasks-sektion syns INTE (regression från igår)
**Symptom:** Min commit `580d1d73` returnerar `null` om projekt har 0 tasks
**Bug:** `if (visible.length === 0 && tasks.length === 0) return null` döljer sektionen helt
**Fix:** Alltid visa "Uppgifter"-rubrik med empty-state "Inga uppgifter än — lägg till första via 'Öppna projekt' →"
**Lokalisering:** [components/pipeline/unified/ProjectStageModal.tsx:259-279](components/pipeline/unified/ProjectStageModal.tsx#L259)
**Estimat:** 5 min
**Allvarlighet:** Min bugg från igår, mest brådskande

═══════════════════════════════════════════════════════════════════
## TIER 2 — PILOT-FRIKTION (fixas innan vecka 2 av pilot, ~5-7h)
═══════════════════════════════════════════════════════════════════

### T2.1 — Projekt-ekonomi: bara "Lägg till kostnad", saknar intäkter/totaler
**Symptom:** Användaren kan inte se offertsumma, fakturerat, timmar räknade vs budget
**Omfattning:** ARKITEKTONISKT — kräver design-runda först
**Behöver finnas:**
- Intäktssida (offertsumma + signerade ÄTA + fakturerat hittills)
- Kostnadssida (manuella kostnader + supplier-invoices + tidsregistreringar × timpris)
- Marginal/lönsamhet kalkylerad
- Timmar budget vs faktiska (från time_entry)
**Lokalisering:** [app/dashboard/projects/[id]/page.tsx] economi-tab eller -sektion
**Estimat:** 4-6h (kräver design + implementation + tester)
**Allvarlighet:** Hög — premium-prissatt verktyg utan budgeting = inte värt 5995 kr/mån

### T2.2 — 8 faserna går inte att flytta direkt i Aktiva projekt
**Symptom:** Snabb stage-flytt saknas — måste öppna modal
**Lokalisering:** [components/pipeline/unified/FlowPipeline.tsx ProjectRow]
**Estimat:** 45 min - 1h (drag-drop eller click-progress-bar)
**Allvarlighet:** Medium — friktion, har workaround via modal

### T2.3 — Snabbåtgärds-knappar vid varje projekt i Aktiva projekt
**Symptom:** Inga snabbåtgärder (likt deal-cards som har Ring/SMS/Karta/Offert)
**Lokalisering:** [components/pipeline/unified/FlowPipeline.tsx ProjectRow] hover-row
**Estimat:** 1h
**Allvarlighet:** Medium — UX-konsistens med dealkort

### T2.4 — Quote-specifikation ser olika ut vid skapande vs redigering
**Symptom:** Två olika UI/UX — förvirrar användaren
**Lokalisering:** [app/dashboard/quotes/new/page.tsx] + [app/dashboard/quotes/[id]/page.tsx] (eller motsv. edit-route)
**Estimat:** 1.5-2h (konsolidera till en delad QuoteEditor-komponent)
**Allvarlighet:** Hög — pilot-feedback explicit: "måste vara IDENTISK"

### T2.5 — Siffror ska särskrivas "10 000" inte "10000"
**Symptom:** Konsistens-brist i siffer-formatering över UI
**Lokalisering:** Alla ställen som formaterar SEK — säkerställ alla använder `formatSek()`-helper med `Intl.NumberFormat('sv-SE')`
**Estimat:** 30-45 min (grep + standardisera)
**Allvarlighet:** Medium — branding/professionalism

### T2.6 — Betalningsvillkor 30 dagar netto som default
**Symptom:** Borde följa kund-inställning (default_payment_days på customer) eller vara tom
**Lokalisering:** Quote-builder + invoice-builder default-values
**Estimat:** 30 min
**Allvarlighet:** Medium

### T2.7 — Agent-godkännanden vid projektstatus-byte (utredning)
**Fråga:** Gör agenter åtgärder DIREKT utan approval när man byter projektstatus?
**Behöver utredning:** Vad triggas vid status-byte → går det via pending_approvals eller direkt?
**Estimat:** 30 min utredning, plan vidare
**Allvarlighet:** Medium — säkerhetsfråga för "vad gör AI bakom kulisserna"

═══════════════════════════════════════════════════════════════════
## TIER 3 — FÖRBÄTTRINGAR (post-launch eller om tid finns)
═══════════════════════════════════════════════════════════════════

### T3.1 — Skapa fler roller (Projektansvarig/Platsledare etc)
**Idag:** Bara owner/admin/member i `business_users.role`
**Estimat:** 2-3h (DB-migration + UI för role-management + permission-logic)
**Allvarlighet:** Låg pre-launch (ingen pilot har 5+ anställda än)

### T3.2 — Dokument från offert följer med in i projektet
**Idag:** Filer kopplade till deal/quote — ska synas på projekt
**Estimat:** 1-2h (FK eller en attachments-relation som projekt slår upp)
**Allvarlighet:** Låg-medium

### T3.3 — Action-knappar i projekt + konsolidera menyer
**Symptom:** "alldeles för mycket" navigation/tabs i projekt-vy
**Estimat:** 3-4h (kräver UX-design först — vad ska bort, vad ska vara snabbåtgärd)
**Allvarlighet:** Medium men för stort scope pre-launch

### T3.4 — Nytt projekt-modal: artiklar/rader som offert
**Idag:** Förenklad budget_timmar + budget_belopp
**Behöver:** Quote-builder-styled rad-input
**Estimat:** 2-3h (återanvänd quote-line-component)
**Allvarlighet:** Låg pre-launch

### T3.5 — Anpassa textmallar i offert per typ av arbete
**Idag:** Statisk default-text
**Estimat:** 2-3h (template-system per branch/category)
**Allvarlighet:** Låg

### T3.6 — "Snabbstart"-sektion vid Ny offert — ta bort
**Estimat:** 5 min
**Allvarlighet:** Trivial — gör samtidigt som annat
**(Kan flyttas till Tier 2 eftersom det är så billigt)**

### T3.7 — Dölja delar av offert/faktura per rad (timmar/timpris-toggle)
**Estimat:** 1-2h (per-rad show_hours, show_unit_price-fält)
**Allvarlighet:** Låg-medium — feature-request, inte bugg

═══════════════════════════════════════════════════════════════════
## FÖRESLAGEN KÖRORDNING
═══════════════════════════════════════════════════════════════════

**Idag (tisdag 20/5, ~2-3h)** — Tier 1:
1. T1.5 — ProjectStageModal empty-state (5 min, fix regression FIRST)
2. T1.1 — Status-ändring utredning + fix (45 min)
3. T1.2 — Beskrivning kommer med i offert (45 min)
4. T1.3 — Villkor/Ej inkluderat vid skapande (1h)
5. T1.4 — Ny kund-modal i Ny deal (30 min)
6. T3.6 bonus — ta bort Snabbstart (5 min, billig win)

**Onsdag-torsdag 21-22/5 (~4-5h)** — Tier 2 high-impact:
7. T2.5 — Siffer-formatering "10 000" (30 min)
8. T2.6 — Betalningsvillkor från kund-config (30 min)
9. T2.4 — Quote-specifikation samma UI vid skapa/redigera (2h)
10. T2.2 + T2.3 — Stage-flytt + snabbåtgärder på projekt (2h)

**Fredag-lördag 23-24/5** — Buffer + Christoffer-testkörning:
- T1.* + T2.* verifierade slutligt
- T2.7 — utredning agent-godkännanden (skriv en kort PRD)
- Tier 2 T2.1 (projekt-ekonomi) — KAN INTE göras innan vi har design-runda, skjuts till post-launch

**Post-launch vecka 1-2** — Tier 2 hård:
- T2.1 projekt-ekonomi-arkitektur (kräver dedicated design-session med Christoffer)

**Post-launch vecka 3+** — Tier 3:
- T3.1-T3.7 i ordning baserat på pilot-feedback

═══════════════════════════════════════════════════════════════════
## RISKER / FLAGGAR
═══════════════════════════════════════════════════════════════════

1. **T2.1 (projekt-ekonomi) är för stort scope** för att fixa pre-launch.
   Premium-pris kräver det, men 4-6h innan launch är inte realistiskt.
   **Förslag:** Visa minimum-version (offertsumma + fakturerat) pre-launch,
   full version vecka 1-2 efter pilot.

2. **T1.1 (status-ändring händer inget)** kan vara antingen
   en frontend-bugg (state uppdateras inte) eller en backend-bugg
   (API returnerar 200 men gör inget). Utredning först krävs.

3. **T2.4 (quote-skapande vs redigering)** har troligen två separata
   route-trees som har divergerat över tid. Konsolidering kräver att
   en blir source of truth. Risk för regression om edit-flowen breaks.

4. **T2.7 (agent-godkännanden vid status-byte)** — om agenter agerar
   utan approval idag är det en SÄKERHETSFRÅGA, inte feature. Måste
   utredas snabbt även om fix kan vänta.

═══════════════════════════════════════════════════════════════════
## TOTAL TIDS-ESTIMAT
═══════════════════════════════════════════════════════════════════

| Tier | Items | Tid |
|---|---|---|
| Tier 1 (idag) | T1.1-T1.5 + T3.6 | 2.5-3h |
| Tier 2 high-impact (ons-tors) | T2.2-T2.6 | 4-5h |
| Tier 2 hård (post-launch v1-2) | T2.1, T2.7 | 5-7h |
| Tier 3 (post-launch v3+) | T3.1-T3.7 minus T3.6 | 10-15h |

**Pre-launch total: 6.5-8h** (Tier 1 + Tier 2 high-impact)
**Post-launch total: 15-22h** (Tier 2 hård + Tier 3)
