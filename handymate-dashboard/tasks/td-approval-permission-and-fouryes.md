# TD — Approval cookie-forwarding: permission-UX + four-eyes-loop + push-monitoring

**Loggat:** 2026-06-02 (i samband med Audit-4 Fix DEF + Fix H).
**Prioritet:** Låg för Bee (owner-pilot, inget team). Medel när första
team-customer onboardas. Hög för push-monitoring när vi når 10+ businesses.

## Bakgrund

Audit 4 (commit `f08edf32`) identifierade 8 internal-fetch-cases där
`executeApprovalPayload` POSTade till target-endpoints utan auth-cookie
→ 401 silent failure. Plus två endpoints (`/api/quotes/[id]/send`,
`/api/invoices/[id]/send`) som aldrig existerat → 404 silent.

Fix DEF (commit `9ba318db`) löste det med cookie-forwarding: target-route
får inkommande session-cookie → `getAuthenticatedBusiness()` lyckas →
ingen 401. Plus URL-fix för båda 404-bugsen.

Tre arkitektoniska konsekvenser av cookie-forwarding bör hanteras:

---

## A) Permission-check via cookie-forwarding

### Beteende

Cookie-forwarding propagerar **både auth OCH permissions**. Target-routes
har permission-checks bortom auth:

- `/api/quotes/send`: kräver `hasPermission(currentUser, 'create_invoices')`
- `/api/invoices/send`: samma — `'create_invoices'`
- `/api/bookings` POST: ingen permission-check (bara auth)
- `/api/quotes/ai-generate`: ingen permission-check (bara auth)

### Konsekvens

**För Bee (owner, biz_21wswuhrbhy):** ingen risk. Owner har alla permissions.

**För framtida team-customers:** team-medlem utan `create_invoices`-permission
klickar Godkänn på en `send_quote`- eller `send_invoice`-approval →
target returnerar 403 → Fix DEF klassificerar som `permission_denied` →
UI visar amber-toast "Saknar behörighet: Otillräckliga behörigheter".

**Detta är önskat RBAC-beteende, inte bugg.** Approval-actions är en
auktorisering — användaren måste ha permission att utföra handlingen själv
för att kunna godkänna den.

### Vad TD:n innebär

När första team-customer onboardas:

1. Bygg tydlig UI för permission-denied (idag bara generisk amber-toast).
2. Möjliga förbättringar:
   - Disable Godkänn-knappen om payload-handlingen kräver permission
     användaren saknar (frontend pre-check via session-permissions).
   - Visa "Be owner godkänna" + möjlighet att vidarebefordra approval-länk
     till owner via SMS/notis.
   - Per-approval-route: visa vilka permissions som krävs i preview.

3. Audit: kartlägg alla typed-actions och deras permission-krav. Idag bara
   `create_invoices` på två routes — men `/api/projects/*` etc kan ha fler.

### Inte fix nu

Bee är ensam pilot och Christoffer är owner. Bygg när vi har data om
faktisk friktion från första team-customer.

---

## B) Four-eyes-loop på högvärdes-offerter

### Beteende

`/api/quotes/send` har four-eyes-skydd: om `quote.total >= four_eyes_threshold_sek`
(default 50 000 kr) OCH användaren inte är owner/admin → skapar nytt
`four_eyes_quote`-approval istället för att skicka.

### Flöde i nuläget (efter Fix DEF)

1. Karin föreslår offert på 52 000 kr → skapar `send_quote`-approval.
2. Team-medlem (icke-owner) klickar Godkänn.
3. Approval-route propagerar cookie till `/api/quotes/send`.
4. Target ser hög-värde + icke-owner → returnerar
   `{ requires_approval: true, approval_id }`.
5. Fix DEF klassificerar som `four_eyes_required` → UI visar
   amber-toast "Värdet kräver ny granskning: ...".
6. Approval i listan markeras `approved` (status-flip skedde innan
   execution — se [`td-approval-status-flip-order.md`](td-approval-status-flip-order.md)).
7. Nytt `four_eyes_quote`-approval finns nu, väntar på owner-godkännande.

### Konsekvens

**För Bee just nu:** 0 risk. Christoffer är owner och godkänner som owner →
four-eyes-checken bypassas.

**För framtida pilot-användning:** dubbel-approval-loop är förvirrande UX —
team-medlem ser "approved" men inget händer förrän owner agerar.

### Möjliga lösningar (välj när relevant)

1. **Karin/Daniel skapar `four_eyes_quote` direkt** när hon föreslår offert
   över tröskeln (kräver att Karin läser `business_config.four_eyes_*`-config
   innan hon skapar approval). Då hoppar vi över send_quote-stegen helt.

2. **Frontend-pre-check:** disable Godkänn för team-medlem på högvärdes-
   `send_quote`-approvals + visa "Kräver owner-godkännande" istället.

3. **Auto-route till owner:** approval-route detekterar four-eyes-trigger
   och skickar push/SMS till owner direkt + uppdaterar original-approval
   med kommentar.

Min preferens: **Alternativ 1** (Karin smart-checks). Att flytta logiken
till föreslagaren känns rätt — hon vet redan att det är en högvärdes-offert.

### Inte fix nu

Bee:s offerter är troligen under 50k. När vi ser första pilot-trigger,
välj alternativ och bygg.

---

## C) Push-fail-monitoring

### Beteende efter Fix H

`four_eyes_quote` push-notis till skaparen är fire-and-forget. Vid fel
loggas till `console.error` med kontext (`[four_eyes_quote/push] ...`).
Men det syns bara i Vercel-loggen — ingen alarmering, ingen aggregering.

### Konsekvens

- För **low-value push** (informational): minimal — användaren kan kolla
  approval-listan manuellt.
- För **high-value push** (four_eyes_quote, betalnings-relaterade):
  business-kritiskt. Fördröjd skickning av offert = förlorad försäljning.

### Vad TD:n innebär

När vi når 10+ businesses eller första push-fail-incident:

1. **Sentry-integration** (eller motsvarande error-tracking) — fånga alla
   `console.error` från approval-route + alarmera vid spike.

2. **Daily-cron-rapport** — räkna push-fails i `console.log`-output via
   Vercel API + posta i Slack om antal > N per dag.

3. **Per-approval-state** — lägg till `push_sent_at` kolumn på
   `pending_approvals` så vi kan retry-pusha för approvals som har
   `push_sent_at IS NULL` efter X minuter.

Min preferens: **Sentry först** (snabbast att integrera, ger
flera kategorier samtidigt). Cron-rapport bygger på det när trafik ökar.

### Inte fix nu

Bee har för låg trafik för att push-fail ska vara märkbart. Bygg när
3+ businesses är live, eller vid första push-fail-incident.

---

## Trigger för var och en av A/B/C

| TD | Trigger | Lösning |
|----|---------|---------|
| A — Permission-UX | Första team-customer onboardas | Disable-knapp + forward-till-owner-UI |
| B — Four-eyes-loop | Första pilot ser >50k-offert eller höjer threshold | Karin smart-check innan approval-skapande |
| C — Push-monitoring | 3+ businesses live ELLER första push-incident | Sentry-integration |

---

## Relaterat

- [`tasks/audit-3-approval-execution.md`](audit-3-approval-execution.md) — original-audit (SMS-cases)
- [`tasks/td-approval-status-flip-order.md`](td-approval-status-flip-order.md) — Fix B framtida (status-efter-execution)
- Fix DEF commit: `9ba318db` — cookie-forwarding + URL-fix + differentierad failure
- Fix H commit: `f3d63c20` — push-fel logget istället för sväljt
