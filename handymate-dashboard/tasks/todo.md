# VP3 — Väck de döda + tyst-kund-primitiv — KLAR 2026-08-05

_Plan 2026-08-05. Underlag: kartläggning med fil:rad i sessionen (VP2 klar
och deployad e9716a2c). Nyckelfynd: proactive-care + warranty-followup frågar
`projects`/`customers` (finns ej — heter `project`/`customer`), och även med
rätt namn kraschar deras customer-embed (FK saknas i prod, dokumenterat
PGRST200-prejudikat i project-stages) → separat customer-hämtning krävs.
Driftlarmets inrapporteringskanal = logAutomationActivity(status:'failed')
(automation_activity sveps av driftlarm-cronen; v3_automation_logs gör INTE det)._

## Del A — väck proactive-care (gap 3)

- [ ] `lib/proactive-care.ts`: `projects`→`project`, `id`→`project_id`,
      embed bort → batch-hämta `customer` separat; alla `customer.id`/
      `project.id`-referenser rättas
- [ ] payload `agent_id:`→`agent:` (exekveringen läser `pl.agent`;
      recovered-revenue läser `payload.agent` — korten var agent-lösa)
- [ ] Fel LARMAR: logAutomationActivity(status:'failed') istället för tyst
      return/console.log
- [ ] VP1-frekvenstaket: canContactCustomer före kortskapande
- [ ] Behåll egna spärrar: max 3 kort/körning, months-fönstret (>= months,
      <= months+6), 60-dagars dedup × 2

## Del B — väck warranty-followup (gap 3)

- [ ] Samma tabellrättningar + separat customer-hämtning
- [ ] `agent_id:`→`agent:` i payload
- [ ] Fel LARMAR via logAutomationActivity
- [ ] Loggen byts `automation_logs`→`v3_automation_logs` (trigger_type m.m.)
- [ ] Frekvenstaket: canContactCustomer + 'warranty_followup' läggs i
      OUTBOUND_APPROVAL_TYPES (guarden ska SE korten den väckta motorn skapar)
- [ ] Kill-switch: agents_globally_paused gate:ar de två outbound-stegen i
      agent-context-cronen (mönstret från hanna-outbound; övriga steg i
      cronen påverkas INTE — LTV/påminnelser är inte outbound-jakt)

## Del C — tyst-kund-primitiven (gap 6)

- [ ] Ny `lib/customers/quiet-customer.ts`: rena funktioner (quietCutoffIso,
      isQuietCustomer, daysSinceLastJob, monthsSinceLastJob — 30-dagars
      månad, bevarar exakt dagens beräkningar) + I/O fetchQuietCustomers
      (parametriserad tröskel/limit/lifetime_value)
- [ ] `lib/agents/hanna-outbound.ts` konsumerar kärnan med 180 dgr (6×30 —
      exakt bevarat), `lib/agents/hanna/capacity-fill.ts` med 90 dgr +
      lifetime_value; proactive-care räknar månader via kärnan men behåller
      sin per-jobbtyp-tröskel (project.completed_at — medvetet annan källa)
- [ ] BETEENDET bevaras per konsument — bara beräkningen förenas
- [ ] Facit-tester `tests/quiet-customer.spec.ts`

## Del D — OPEN_QUOTE_STATUSES (gap 6-bis)

- [ ] Ny `lib/quotes/statuses.ts`: OPEN_QUOTE_STATUSES ['sent','opened'],
      WON ['accepted','signed'], LOST ['declined','expired']
- [ ] Äkta buggar: `lib/matte/monthly-review.ts:158` + `lib/agent/
      pricing-engine.ts:183` filtrerar 'rejected' som ALDRIG skrivs
      (värdet heter 'declined') → prisintelligensen har aldrig sett en
      förlorad offert
- [ ] 'sent'-utan-'opened'-familjen (samma bugg VP2 fixade i quote-follow-up):
      automation-engine:1087, matte/morning-brief:83, matte/chat:58,
      communication-ai:339
- [ ] Delade konstanten in i serverlogikens osålda-filter: capacity-fill
      (:70/:419), quote-follow-up (:36/:53/:265), portal (:134/:196),
      quotes/accept (:57), quotes/track (:84)
- [ ] Presentations-UI (quotes/page.tsx-knappar, portal-etiketter) lämnas —
      ingen beteendeskillnad, onödig churn
- [ ] OBS: `avtal-forslag.ts:426` 'rejected' gäller pending_approvals —
      korrekt, RÖRS INTE

## Verifiering

- [ ] npx tsc --noEmit — 0 fel
- [ ] npx next build — grön
- [ ] Nya quiet-customer-tester gröna; alla befintliga facit-tester gröna
      (särskilt kapacitet-fyllnad — rankPastCustomerCandidates/
      isUnsoldQuoteActionable får inte ändra beteende)
- [ ] Commit + push

## Review (2026-08-05)

Alla fyra delar byggda och verifierade (tsc 0 fel, next build exit 0,
286/286 facit-tester gröna varav 48 nya för tyst-kund-primitiven).

- Del A+B: proactive-care + warranty-followup väckta — rätt tabellnamn
  (project/customer, PK project_id/customer_id), separat batch-hämtning av
  kunder (embedden var omöjlig — FK saknas, PGRST200), fel larmar via
  logAutomationActivity → driftlarm-digest, VP1-frekvenstaket före
  kortskapande, payload agent_id→agent (korten var agent-lösa i exekvering
  + VP2-attribution), warranty loggar till v3_automation_logs med
  approval_id. 'warranty_followup' tillagd i OUTBOUND_APPROVAL_TYPES.
  Kill-switch: agents_globally_paused gate:ar de två outbound-stegen i
  agent-context-cronen (övriga steg orörda).
- Del C: lib/customers/quiet-customer.ts — trösklar bevarade exakt
  (hanna-outbound 180 dgr, capacity-fill 90 dgr, proactive-care per
  jobbtyp), enda medvetna beräkningsskiftet: proactive-care räknade
  30.44-dagarsmånader, nu 30 (motorn var död — inget observerat beteende
  ändras). Källnyansen dokumenterad i filhuvudet: last_job_date kommer
  från senaste BETALDA fakturan (LTV-motorn), proactive-care mäter
  project.completed_at per projekt — medvetet olika källor.
- Del D: lib/quotes/statuses.ts (OPEN/WON/LOST). Äkta buggar fixade:
  'rejected' skrivs aldrig till quotes (heter 'declined') — pricing-engine
  hade aldrig klassat en förlorad offert (+ 'signed' räknas nu som won),
  monthly-review räknade aldrig avvisade som skickade. Fyra
  'sent'-utan-'opened'-läsare fixade (automation-engine days_since_sent,
  morning-brief, matte-chat, communication-ai). Presentations-UI:s
  statuslistor lämnades medvetet (ingen beteendeskillnad).

Noterat: proactive-care/warranty producerar kort först när agent-context-
cronen körs (05:00 UTC dagligen) — första skarpa körningen imorgon bitti;
driftlarmet sveper som vanligt 05:15.
