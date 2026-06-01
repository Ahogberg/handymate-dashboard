# TD — Approval status-flip ordning (Audit-3 Fix B framtida)

**Loggat:** 2026-06-01 (under Audit-3 implementation av Fix A + Fix C)
**Prioritet:** Medium — Fix A + Fix C neutraliserar 100% av observerade silent-failure-cases. Detta kvarstår som arkitektonisk skuld.

## Problem

[`/api/approvals/[id]/route.ts:65-70`](../app/api/approvals/[id]/route.ts#L65-L70):

```typescript
// Update status
const newStatus = action === 'reject' ? 'rejected' : 'approved'
await supabase
  .from('pending_approvals')
  .update({ status: newStatus, ... })
  .eq('id', params.id)

// ... 80 rader senare ...

// If approved or edited, execute the payload action
if (action === 'approve' || action === 'edit') {
  executionResult = await executeApprovalPayload(...)
}
```

Status='approved' sätts **innan** handler kör. Docblock på `executeApprovalPayload` (rad 162):

> *"Returns result info (non-fatal — approval is already marked approved)"*

Medveten silent-failure-arkitektur. Om execution failar är approval markerad approved men handlingen utfördes aldrig.

## Konsekvens

Med Fix A (sendSmsViaElks direkt) + Fix C (UI visar execution.error) är de OBSERVERADE silent failures borta. Men:

1. **Status kan inte återställas till 'pending'** — Christoffer kan inte retry via UI eftersom approval visas som 'approved'.

2. **Audit-spår är vilseledande** — `pending_approvals.status='approved'` betyder INTE att handlingen lyckades. Filtreringar i framtida queries som antar "approved = handling skedde" blir fel.

3. **Edge-cases vi inte sett än**: vilka andra execution-paths kan misslyckas tyst? Audit 4 kartlägger send_quote, send_invoice, create_booking, etc.

## Föreslagen fix (Fix B — när vi bygger den)

### Alternativ 1 — Status efter execution

```typescript
// 1. Execute first
const executionResult = await executeApprovalPayload(...)

// 2. Determine if execution succeeded
const executionOk = !executionResult?.error
  && executionResult?.sms_sent !== false
  && executionResult?.ok !== false

// 3. Status: 'approved' om OK, 'execution_failed' om fail
const newStatus = action === 'reject'
  ? 'rejected'
  : (executionOk ? 'approved' : 'execution_failed')

await supabase.from('pending_approvals').update({ status: newStatus, ... })
```

**Fördelar:** korrekt status, retry möjligt via UI.

**Nackdelar — edge-cases:**
- SMS skickat men UPDATE failar → kund får SMS, approval står som pending → dubbel-trigg-risk vid retry
- Race condition: två klicks samtidigt → execution kör 2 ggr

### Alternativ 2 — Ny status 'executing'

Tre-stegs-flöde:
1. UPDATE status='executing' (lock)
2. Execute
3. UPDATE status='approved' eller 'execution_failed'

Kräver:
- CHECK constraint i SQL utökas med 'executing', 'execution_failed'
- UI visar 'executing'-state som "körs..."
- Cleanup-cron för dödslåsta executing-rader (om server-process dog mitt i)

**Fördelar:** clearast semantik, retry-säker via cleanup.

**Nackdelar:** mer arbete, schema-migration.

### Alternativ 3 — Behåll status, lägg till execution_status

Två kolumner istället för en:
- `status` = mänsklig beslut: pending → approved/rejected (idag)
- `execution_status` = handlings-resultat: not_started → succeeded/failed

**Fördelar:** decoupling, audit-spår bevarat, retry tydligt.

**Nackdelar:** UI måste tolka två fält, fler kombinationer.

## Min preferens

**Alternativ 3** när vi väl bygger Fix B. Decoupling mellan "användarens beslut" och "systemets utförande" är konceptuellt rätt. Men kräver design-runda om UI-presentation + retry-flöde.

## Trigger för fix

- 1-2 piloter har upplevt en execution-failure som de behövde retry på
- Eller: 10+ approvals/dag per business, då räknas reliability mer
- Eller: vi adderar execution-typer med högre risk (Fortnox-integration, betalningar)

Tills dess: Fix A + Fix C täcker de observerade fallen.

## Relaterat

- [`tasks/audit-3-approval-execution.md`](audit-3-approval-execution.md) — auditen som identifierade detta
- Fix A commit: `b77d2b46` — 9 SMS-cases via sendSmsViaElks
- Fix C commit: `da5aeb3a` — UI fångar execution.ok=false

## Audit 4 pekare (separat TD)

Audit 3 täcker bara SMS-cases. Andra internal-fetch-cases har samma silent-failure-risk:

- `send_quote` → `/api/quotes/[id]/send`
- `send_invoice` → `/api/invoices/[id]/send`
- `create_booking` → `/api/bookings`
- `create_quote_draft` / `quote_request` / `quote_addition` → `/api/quotes/ai-generate`
- `create_ata_draft` → `/api/quotes/ai-generate`
- `booking_suggestion` (autopilot sub) → `/api/bookings`
- `review_auto_invoice` → `/api/invoices/send` (med `_internal_business_id`-workaround — bekräfta att den fungerar)
- `four_eyes_quote` → `/api/push/send` (fire-and-forget, mindre kritisk)

Verifiera per endpoint:
1. Har den `getAuthenticatedBusiness`-check?
2. Returnerar den 401 server-side utan auth?
3. Behöver vi extrahera underliggande funktion (som sendSmsViaElks) eller bypass-flagga?

Mest urgent: send_invoice (faktura skickas inte trots Godkänn = pengarna kommer aldrig in). Fix A:s mönster är direkt applicerbart.
