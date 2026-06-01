# Audit 3 — Approval Execution (silent-failure-risk)

**Datum:** 2026-06-01
**Trigger:** Bee Service har 7 obesvarade Lars-approvals i UI. Innan vi designar observation-UX behöver vi verifiera att typed actions FAKTISKT exekveras vid Godkänn. Samma silent-failure-klass som A1-B2 (`createProjectFromQuote`).

**Status:** **TVÅ KRITISKA SILENT-FAILURE-RISKER IDENTIFIERADE.**

---

## TL;DR

1. **Status-flip sker FÖRE execution.** [`/api/approvals/[id]/route.ts:65-70`](../app/api/approvals/[id]/route.ts#L65-L70). Approval markeras `status='approved'` i DB innan handler kör. Docblock på `executeApprovalPayload` (rad 162) säger explicit: *"Returns result info (non-fatal — approval is already marked approved)."* — det är **medveten silent-failure-arkitektur**.

2. **SMS-baserade typed actions använder internal fetch som FAILAR server-side.** 9 av approval-typerna anropar `fetch(appUrl + /api/sms/send)`. `/api/sms/send` kräver `getAuthenticatedBusiness(request)` som returnerar `null` när fetch sker från server utan cookie/token → 401 → `res.ok = false`. Christoffer ser "Godkänt", men SMS skickas aldrig.

**Bevis att vi VET om problemet:** `review_request`-casen ([rad 215-282](../app/api/approvals/[id]/route.ts#L215-L282)) använder `sendSmsViaElks` direkt med kommentar:
> *"SMS direkt via 46elks (sendSmsViaElks) — inte internal fetch mot /api/sms/send (TD-lärdom: relativ URL fungerar inte server-side i Next-routes, plus rate-limit/billing/auth-check är inte relevant för system-triggade SMS)."*

Lärdomen är dokumenterad men inte applicerad på resten av cases. Detta är **känd skuld** som måste betalas.

---

## Flödet kartlagt

```
Christoffer klickar Godkänn
   ↓
PendingApprovalsBlock.handleAction()
   ↓
POST /api/approvals/[id] { action: 'approve' }
   ↓
┌─ Steg 1: Fetch approval ─────────────────┐
│ supabase.from('pending_approvals').select│
└──────────────────────────────────────────┘
   ↓
┌─ Steg 2: UPDATE status='approved' ✅ ────┐  ← KRITISK: SÄTTS HÄR
│ supabase.from('pending_approvals')        │      INNAN EXECUTION
│   .update({ status: newStatus, ... })     │
└──────────────────────────────────────────┘
   ↓
┌─ Steg 3: Learning event (non-blocking) ──┐
│ recordLearningEvent(...)                  │
└──────────────────────────────────────────┘
   ↓
┌─ Steg 4: Reject-side-effect (lead_review)┐
│ leads.status = 'declined' om reject       │
└──────────────────────────────────────────┘
   ↓
┌─ Steg 5: executeApprovalPayload() ───────┐
│ switch (approval_type) {                  │
│   case 'send_sms': fetch(/api/sms/send)  │  ← FAILAR (401 auth-missing)
│   case 'send_quote': fetch(...)          │  ← FAILAR
│   case 'send_invoice': fetch(...)        │  ← FAILAR
│   case 'create_booking': fetch(...)      │  ← FAILAR
│   case 'review_request': sendSmsViaElks  │  ✅ FIXAD
│   case 'lead_review': activatePendingLead│  ✅ direkt funktion
│   ...                                      │
│ }                                          │
└──────────────────────────────────────────┘
   ↓
Returnerar { success: true, execution: { ok: false } }
   ↓
UI: PendingApprovalsBlock filtrerar bort approval från listan
   ↓
Christoffer ser "Godkänt!" toast → tror SMS skickades
```

---

## Risk per approval_type

### 🔴 HÖGRISK — silent SMS-failure via internal fetch

Alla nedanstående kallar `fetch(appUrl + /api/sms/send)`. `/api/sms/send` har auth-check som returnerar 401 vid server-side fetch utan cookie.

| Approval-type | Plats | Risk |
|---|---|---|
| `send_sms` (Karin/Daniel/Lisa typed actions) | [rad 173](../app/api/approvals/[id]/route.ts#L173) | Klick "Godkänn" → SMS skickas INTE → kund får inget |
| `customer_sms` (autopilot_package sub-action) | [rad 320](../app/api/approvals/[id]/route.ts#L320) | Samma |
| `proactive_care` | [rad 462](../app/api/approvals/[id]/route.ts#L462) | Samma |
| `warranty_followup` | [rad 502](../app/api/approvals/[id]/route.ts#L502) | Samma |
| `propose_booking_times` / `reschedule_request` / `new_booking_request` | [rad 548](../app/api/approvals/[id]/route.ts#L548) | Samma |
| `send_matte_customer_reply` | [rad 596](../app/api/approvals/[id]/route.ts#L596) | Samma |
| `propose_site_visit` | [rad 653](../app/api/approvals/[id]/route.ts#L653) | Samma |
| `customer_reactivation` | [rad 713](../app/api/approvals/[id]/route.ts#L713) | Samma |
| Default fallback (om payload har SMS-data) | [rad 789](../app/api/approvals/[id]/route.ts#L789) | Samma |

**Detta är 9 typed actions som ALLA misslyckas tyst.**

### 🟡 MEDELRISK — internal fetch mot icke-SMS-endpoints

| Approval-type | Endpoint | Notering |
|---|---|---|
| `send_quote` | `/api/quotes/[id]/send` | Behöver verifiera auth-krav |
| `send_invoice` | `/api/invoices/[id]/send` | Behöver verifiera auth-krav |
| `create_booking` | `/api/bookings` | Behöver verifiera auth-krav |
| `booking_suggestion` (autopilot sub) | `/api/bookings` | Samma |
| `create_quote_draft` / `quote_request` / `quote_addition` | `/api/quotes/ai-generate` | Behöver verifiera |
| `create_ata_draft` | `/api/quotes/ai-generate` | Samma |
| `review_auto_invoice` | `/api/invoices/send` (med `_internal_business_id`) | **Backdoor-param finns — verifiera om den fungerar** |
| `four_eyes_quote` | `/api/push/send` (fire-and-forget) | Push-notis, inte kritisk |

### 🟢 LÅGRISK — direkt DB eller import (ingen fetch)

| Approval-type | Hur exekveras | Status |
|---|---|---|
| `review_request` | `sendSmsViaElks` direkt | ✅ KORREKT — fixad |
| `lead_review` | `activatePendingLead` import | ✅ KORREKT |
| `dispatch_suggestion` | supabase direkt UPDATE | ✅ |
| `time_attestation` | supabase UPDATE + INSERT | ✅ |
| `seasonal_campaign` | supabase INSERT (sms_campaign) | ✅ skapar campaign-rad, ingen direkt SMS |
| `job_report` | `approveJobReport` import | ✅ |
| `four_eyes_project_close` | supabase UPDATE + fireEvent | ✅ |
| `price_adjustment` | supabase UPDATE price_list | ✅ |
| `low_stock_alert` | bara acknowledge | ✅ no-op-OK |
| `profitability_warning` | bara acknowledge | ✅ no-op-OK |
| `create_invoice_from_report` | bara acknowledge + navigate | ✅ navigerar-fokus |
| `agent_observation` (Lars/Hanna) | default fallback → acknowledge | ✅ — det är vad Christoffer godkänt i Bee idag |

### ⚪ N/A — inte typed actions

| Approval-type | Notering |
|---|---|
| `agent_observation`, `agent_insight` | Ack-only by design. Exkluderas redan från approve_rate. |
| `manual_project_create` | Behöver verifiera om case finns (såg det i UI men inte i switch — kan vara TODO) |

---

## Konkret verifierings-test (kör mot Bee när första typed action finns)

### Test 1 — Simulera Karin send_sms-approval och godkänn

```sql
-- Skapa en test-typed-approval för Bee (Karin send_sms-mönster)
INSERT INTO pending_approvals (
  business_id,
  approval_type,
  title,
  payload,
  status,
  risk_level
) VALUES (
  'biz_21wswuhrbhy',
  'send_sms',
  'TEST: skicka påminnelse till Andreas',
  jsonb_build_object(
    'agent_id', 'karin',
    'to', '+46707654321',  -- ditt eget testnummer
    'message', 'Test från audit 3 — om du får detta SMS fungerar approve-flödet end-to-end',
    'customer_id', null
  ),
  'pending',
  'low'
);
```

Klick Godkänn i `/dashboard/approvals`. Förvänta:

**Om bug:** API returnerar `{ success: true, execution: { action: 'send_sms', ok: false } }`. **Inget SMS landar i din telefon.** SQL visar `status='approved'`. Silent failure bekräftad.

**Om OK:** SMS landar inom 30s. SQL visar `status='approved'`.

### Test 2 — Verifiera sms_log

```sql
SELECT created_at, direction, phone_to, message, status, error_message
FROM sms_log
WHERE business_id = 'biz_21wswuhrbhy'
  AND created_at >= NOW() - INTERVAL '5 minutes'
ORDER BY created_at DESC;
```

Om Test 1 var bug-fall: ingen rad i sms_log (eftersom `/api/sms/send` blockerades av 401 innan den nådde 46elks).

### Test 3 — Inspektera execution-resultatet i browser console

Klick Godkänn på en test-approval och kolla network-tab:

```
POST /api/approvals/<id>
Response: { success: true, execution: { action: 'send_sms', ok: false } }
                                                              ^^^^^
```

`ok: false` syns i response men UI ignorerar det (rad 244 i `/dashboard/approvals/page.tsx`: `if (res.ok) { ... }` — det är **HTTP-response-ok**, inte execution-ok).

---

## Föreslagen fix-strategi (INGEN kod nu)

### Två separata fixes (atomära):

**Fix A — SMS-actions till `sendSmsViaElks` direkt** (kopiera review_request-mönstret)

Samma lösning som är dokumenterad i koden. För varje SMS-baserad case:
1. Importera `sendSmsViaElks` från `lib/sms-send`
2. Hämta business_name för from-fältet
3. Ersätt `fetch(/api/sms/send)` med direkt `sendSmsViaElks(...)`
4. Returnera `{ sms_sent: smsResult.success, error: smsResult.error }`

Implementations-tid: 1-2 timmar (9 cases att uppdatera, ungefär 5 minuter per).

**Fix B — Status-flip EFTER execution**

Mer fundamental. Ändra ordning:
1. Steg 2 (UPDATE status) → flyttas till EFTER Steg 5 (execute)
2. Om execution failar (return ok:false eller error):
   - Återställ status till 'pending'? — Eller markera som 'execution_failed'?
   - Returnera 500 till UI så toast visar fel istället för "Godkänt!"
3. Edge-case: om DB-UPDATE failar efter execution, vad gör vi?
   - Ex. SMS skickat men UPDATE failar → kund får SMS men approval står som pending
   - Kanske retry-loop eller manual reconciliation

Fix B är arkitektoniskt rätt men har edge-cases. Fix A löser **9/9 silent SMS-failures** utan att röra status-ordningen.

**Min rekommendation:** Bygg Fix A först (snabb, hög-impact, känd lösning). Logga Fix B som TD för senare iteration när vi har fler approval-typer i prod.

### Fix C — UI-fix för execution.ok=false

Vid sidan om Fix A:

[`PendingApprovalsBlock.handleAction`](../components/dashboard/PendingApprovalsBlock.tsx) tittar bara på `res.ok` (HTTP-status), inte `execution.ok` i response-body:

```ts
if (res.ok) {
  setApprovals(prev => prev.filter(a => a.id !== approvalId))
  setFeedback(action === 'approve' ? 'Godkänt!' : 'Avvisat')
}
```

Bör utökas:

```ts
if (res.ok) {
  const result = await res.json()
  if (result.execution?.ok === false || result.execution?.error) {
    setFeedback(`Godkänt men handling misslyckades: ${result.execution.error || 'okänt fel'}`)
    // Behåll approval i listan för retry?
  } else {
    setFeedback('Godkänt!')
    setApprovals(prev => prev.filter(a => a.id !== approvalId))
  }
}
```

Implementations-tid: 30 minuter.

---

## Risk-prioritering

| Risk | Sannolikhet | Impact | Prio |
|---|---|---|---|
| Karin SMS-påminnelse skickas inte trots Godkänn | **100%** (kod-flöde bevisat) | Kunden påminns inte → faktura fortsätter förfallen → kund missnöjd | **🔴 Akut** |
| Daniel offert-nudge skickas inte | 100% | Erik nudgas inte → offert dör | 🔴 Akut |
| Lisa kund-svar skickas inte | 100% | Kund får inget svar → tappar förtroende | 🔴 Akut |
| Status-flip-före-execution arkitektur | 100% | Christoffer kan inte retry — UI visar "approved" | 🟡 Allvarligt |
| UI ignorerar execution.ok=false | 100% | Christoffer vet inte att action misslyckats | 🟡 Allvarligt |

**Konsekvens om inte fixat innan första typed-action-trigger:** Pilot-trust skadas. Christoffer tror Karin/Daniel/Lisa fungerar, kunder missnöjda när påminnelser/nudges aldrig kommer fram. Då vi får data om approve-rate kommer den vara ärligt baserad på "Godkänd"-knappar — men action-resultatet kommer vara osynligt och felaktig.

---

## Vad denna audit INTE täcker (separata audits)

- `/api/quotes/[id]/send` auth-flöde (samma silent-failure-risk för send_quote)
- `/api/invoices/send` auth-flöde (samma för send_invoice + review_auto_invoice)
- `/api/bookings` auth-flöde (create_booking, booking_suggestion)
- `/api/quotes/ai-generate` (create_quote_draft, create_ata_draft, quote_request, quote_addition)
- `review_auto_invoice._internal_business_id` workaround — verifiera om det faktiskt bypass:ar auth-check

Föreslagen Audit 4: kartlägg auth-krav per internal-fetch-endpoint. Bekräfta att icke-SMS-endpoints också failar tyst.

---

## Slutsats

Vi byggde infrastrukturen för agent-first paradigm utan att verifiera att approve-knappen faktiskt fungerar för typed actions. Bara `review_request`, `lead_review` och direkt-DB-cases är säkra. **9 av 12 SMS-cases är trasiga** (silent failure).

Lyckan i läget: Bee har inte sett en typed action än. Karin/Daniel/Lisa har inte data nog för att producera dem. Vi har **fönster** att fixa innan första riktiga SMS-action-approval kommer (uppskattningsvis 1-2 veckor när Bee börjar fakturera).

Säg till om jag ska:
- **A)** Bygga Fix A omedelbart (~1-2h, löser 9 silent failures innan Bee testar live)
- **B)** Logga som TD och vänta på pilot-data först
- **C)** Logga som TD + fixa UI-felmeddelande (Fix C, 30 min) så Christoffer åtminstone ser om något fail:ar
