# Handymate Financial Kernel — Pay + Ledger Architecture

> Status: Implementation blueprint / pre-build architecture
> Date: 2026-09-11
> Scope: Handymate Pay, Handymate Ledger, reconciliation, financial events, Fortnox shadow mode and migration from the current invoice/payment model.
> Strategic context: `docs/HANDYMATE_ACCOUNTING_ROADMAP.md` and `docs/HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md`.
> Review record: `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md` (2026-09-11). Its accepted findings are already written into this document as normative requirements — **you do not need to read the review to implement correctly**. It records why the requirements exist.

## 0. Why this document exists

Pay and Ledger must **not** be built as two independent products that are integrated afterwards. They are two projections of the same economic reality:

- Pay answers **where the money is and how it moved**.
- Ledger answers **what the economic event means in accounting**.
- Reconciliation proves that external money movement and internal accounting agree.
- The existing Handymate platform supplies the commercial context: customer, project, quote, invoice, material, time, ROT/RUT and supplier.

The shared foundation is the **Handymate Financial Kernel**.

```text
Handymate Operational Platform
        |
        v
Canonical Financial Events
        |
   +----+--------------------+
   |                         |
   v                         v
Pay / Money Movement     Ledger / Accounting
   |                         |
   +-----------+-------------+
               v
         Reconciliation
               |
               v
 Financial State / BI / Karin
```

This document is intended to be concrete enough for Codex/Claude implementation work to begin from it without inventing local architecture.

---

## 1. Existing codebase: what we already have

The current codebase is closer to this architecture than it may look. Reuse the good centralization already present instead of starting a parallel finance stack.

### 1.1 Customer invoices

Relevant paths:

```text
handymate-dashboard/app/api/invoices/route.ts
handymate-dashboard/lib/invoices/create-invoice.ts
handymate-dashboard/app/api/invoices/[id]/mark-paid/route.ts
handymate-dashboard/lib/invoices/apply-payment.ts
handymate-dashboard/lib/invoices/payment-decision.ts
```

Current strengths:

- Invoice creation is already centralized through `createInvoice()` for number/OCR/date/insert ownership.
- Invoice creation fires the existing `invoice_created` automation event.
- Payment registration is already centralized in `applyInvoicePayment()`.
- Manual mark-paid, customer-confirmed payment and Fortnox payment sync already converge on the same payment core.
- ROT/RUT already distinguishes customer payment from final settlement with Skatteverket.
- Post-payment effects are already centralized: pipeline/workflow/project/customer communication/`payment_received`.

**Decision:** preserve these entry points during migration. Do not bypass them with a second payment implementation.

### 1.2 Fortnox payment synchronization

Relevant path:

```text
handymate-dashboard/lib/fortnox/sync-payments.ts
```

Today Fortnox payment state is pulled into Handymate and normalized through `applyInvoicePayment()`.

This is valuable for the future architecture because the integration can become a **shadow-validation adapter**:

```text
Fortnox external state
        |
        v
Reference adapter
        |
        +--> compare with Financial Kernel
        |
        +--> ACCOUNTING_DIVERGENCE / PAYMENT_DIVERGENCE
```

Long term, Fortnox must not remain the source of truth for Handymate Pay customers. During rollout it is an excellent external comparator.

### 1.3 Supplier invoices

Relevant paths:

```text
handymate-dashboard/app/api/supplier-invoices/route.ts
handymate-dashboard/lib/fortnox/sync-payments.ts
```

The product already has project-linked supplier invoices, amounts, VAT, status, receipts and Fortnox payment synchronization.

Current weakness: supplier invoice status can currently be mutated directly (`status`, `paid_at`). In the Financial Kernel model, payment status must eventually be a projection of actual supplier-payment allocations/reconciliation rather than an arbitrary editable field.

### 1.4 Existing Swish QR

Relevant path:

```text
handymate-dashboard/app/api/swish-qr/route.ts
```

This is **not Handymate Pay**. It generates payment instructions/QR data only. There is currently no canonical payment intent, provider transaction, webhook lifecycle, settlement object or reconciliation chain associated with that QR.

Keep the UX capability, but a future invoice payment QR/link should originate from a tenant-bound `payment_intent` and, where possible, a provider adapter.

### 1.5 Existing automation engine

Relevant path:

```text
handymate-dashboard/lib/automation-engine.ts
```

`fireEvent()` is valuable for business automation but must **not** be the sole financial event infrastructure.

Reasons:

- It is automation-rule oriented.
- Existing callers often treat event firing as non-blocking.
- A financial event must be durable even if no automation rule is active.
- Financial events need idempotency, schema version, correlation/causation, replayability and immutable audit provenance.

**Decision:** build a durable financial event/outbox layer, then bridge selected events into `fireEvent()` for backwards-compatible automation behavior.

### 1.6 Existing architecture contract

`handymate-dashboard/ARCHITECTURE.md` states that event names and schema assumptions must be added there before implementation.

Therefore **Sprint 0 must update `ARCHITECTURE.md` with the final canonical financial event list before those events are coded.** This document proposes the names but does not override the canonical architecture file.

---

## 2. Core design principles

1. **One economic event, many projections.** Do not independently infer the same payment/accounting event in several modules.
2. **No direct PSP -> Ledger path.** Provider data must be normalized into Handymate objects/events first.
3. **No arbitrary journal writes from product modules.** Ledger postings go through the Posting Engine.
4. **No arbitrary paid-status writes once migrated.** Invoice/supplier status becomes a projection of allocations/receivable state.
5. **Financial writes are idempotent.** Retries must never duplicate money or journal entries.
6. **Posted accounting is append-oriented.** Correct with reversal/correction, not silent historical mutation.
7. **Provider-neutral Pay.** Stripe/Adyen/Swish/bank adapters live below Handymate's domain model.
8. **Country-neutral Ledger.** BAS/VAT/ROT/RUT/SIE live in the SE country pack, not the global core.
9. **Every financial object is tenant-bound.** `business_id` is mandatory at every boundary and every DB query.
10. **Every amount has a currency.** Never assume SEK in global core.
11. **Never use floating-point arithmetic as the financial truth.** See Money model below.
12. **Automation follows financial truth; it does not create it.** Notifications/pipeline actions are downstream effects.

---

## 3. Domain ownership / source of truth

| Domain | Owns | Must not own |
|---|---|---|
| Invoice | commercial invoice, lines, due date, receivable composition, customer | PSP state, bank settlement, journal lines |
| Pay | payment intent, payment attempt, normalized payment status, refund, payout | accounting meaning |
| Allocation | which payment amount settles which receivable/payable | provider lifecycle |
| Bank | bank accounts and imported bank transactions | invoice state |
| Reconciliation | matching bank/provider/payment/ledger evidence | journal creation rules |
| Ledger | accounts, journals, entries, lines, periods, balances | external provider state |
| Country Pack | VAT/tax/account conventions/local exports | global payment state |
| Automation Engine | customer/workflow side effects | durable financial truth |
| Fortnox Adapter | import/export/shadow comparison | permanent source of truth after migration |

---

## 4. Proposed module structure

```text
handymate-dashboard/lib/financial-kernel/
  money.ts
  events/
    types.ts
    publish.ts
    consume.ts
    outbox.ts
    bridge-automation.ts
  receivables/
    service.ts
    projections.ts
  allocations/
    service.ts
  audit/
    service.ts
  integrity/
    invariants.ts
    checks.ts

handymate-dashboard/lib/payments/
  service.ts
  state-machine.ts
  intents.ts
  refunds.ts
  payouts.ts
  providers/
    types.ts
    registry.ts
    <provider>/adapter.ts

handymate-dashboard/lib/reconciliation/
  service.ts
  matcher.ts
  projections.ts

handymate-dashboard/lib/ledger/
  posting-engine.ts
  journals.ts
  periods.ts
  reports.ts
  reversals.ts
  country-packs/
    se/
      accounts.ts
      vat.ts
      rot-rut.ts
      posting-rules.ts
      sie.ts

handymate-dashboard/app/api/payments/
handymate-dashboard/app/api/accounting/
handymate-dashboard/app/api/reconciliation/
handymate-dashboard/app/api/webhooks/payments/[provider]/
```

Folder names can be adjusted to existing conventions, but ownership boundaries must stay intact.

---

## 5. Money representation — mandatory before Pay/Ledger

Current invoice/supplier code frequently uses JavaScript `number`, `parseFloat()` and arithmetic such as `subtotal * vat_rate`. That is acceptable as legacy application behavior but must not become the Financial Kernel's source of truth.

### Recommended boundary model

For payments:

```ts
type Money = {
  amountMinor: bigint // e.g. 12500 = SEK 125.00
  currency: string    // ISO 4217, e.g. SEK
}
```

For PostgreSQL accounting storage, use exact decimal/numeric columns, never floating types. Suggested precision:

```text
NUMERIC(20,4)
```

Why allow >2 decimals internally? VAT allocation, FX and future jurisdictions can require higher intermediate precision. Posted currency totals are rounded according to the country/currency rules.

### Rules

- Provider adapters convert provider minor units into `Money`.
- API JSON can expose decimal strings; do not transport BigInt directly as JSON.
- Financial calculations use helper functions, never ad hoc `number + number` throughout the codebase.
- Define one rounding policy per currency/country pack.
- Existing invoice fields remain compatible during migration, but canonical kernel calculations use exact values.

### Rounding differences are postings, never tolerances

A monetary comparison in the kernel is exact. There is no "close enough" band.

Where a real-world difference exists — öresavrundning, a bank or provider fee taken at source, a
foreign-exchange difference — it is resolved in exactly one of two ways:

```text
difference within the country pack's documented rounding policy
  -> an explicit rounding posting on a dedicated account
     (SE proposal: 3740 Öres- och kronutjämning — confirm with the accounting consultant)

difference outside that policy
  -> a reconciliation exception; never absorbed, never silently written off
```

**Binding:** no comparison tolerance constant may exist in kernel code. `TOLERANCE_KR = 1` in
`lib/invoices/payment-decision.ts` is legacy behaviour that must not be carried across the
boundary — see §18.3 for the migration consequence, which is breaking.

---

## 6. Durable financial event model

Create a durable table, conceptually:

```text
financial_events
```

Recommended fields:

```text
id UUID/ULID PK
business_id
schema_version INT
event_type TEXT
occurred_at TIMESTAMPTZ
effective_date DATE NULL
source_type TEXT
source_id TEXT
correlation_id TEXT
causation_id TEXT NULL
idempotency_key TEXT
currency TEXT NULL
amount NUMERIC(20,4) NULL
payload JSONB
actor_type TEXT       -- system/user/provider/import/agent
actor_id TEXT NULL
created_at TIMESTAMPTZ
```

Unique constraints should include tenant-aware idempotency, e.g.:

```text
UNIQUE (business_id, idempotency_key)
```

### Transactional outbox

Do not use "write DB row, then hope event publishing succeeds" for critical financial state.

A state transition and its outbox event must commit atomically.

Because Supabase JS does not provide a generic client-side multi-statement transaction abstraction for arbitrary application operations, critical operations should use **Postgres functions/RPCs** where needed:

```text
record_payment_settlement(...)
allocate_payment(...)
post_journal_entry(...)
record_provider_event(...)
```

Each RPC can atomically:

1. validate tenant + current state;
2. write the canonical object;
3. insert financial event/outbox record;
4. return the resulting state.

Consumers must still be idempotent.

---

## 7. Canonical event envelope

All Financial Kernel events should share an envelope similar to:

```ts
interface FinancialEvent<T> {
  eventId: string
  schemaVersion: number
  eventType: string
  businessId: string
  occurredAt: string
  effectiveDate?: string
  source: {
    type: string
    id: string
  }
  correlationId: string
  causationId?: string
  idempotencyKey: string
  actor: {
    type: 'system' | 'user' | 'provider' | 'import' | 'agent'
    id?: string
  }
  payload: T
}
```

### Proposed event families

Final names must be entered in `ARCHITECTURE.md` first.

Commercial/receivable:

```text
invoice_issued
invoice_credited
receivable_created
receivable_adjusted
receivable_settled
```

Pay:

```text
payment_intent_created
payment_initiated
payment_authorized
payment_processing
payment_settled
payment_failed
payment_cancelled
payment_refunded
payment_disputed
payout_created
payout_settled
```

Allocation/reconciliation:

```text
payment_allocated
payment_allocation_reversed
bank_transaction_imported
reconciliation_matched
reconciliation_unmatched
reconciliation_reversed
```

Ledger:

```text
journal_entry_posted
journal_entry_reversed
period_locked
period_unlocked
accounting_divergence_detected
payment_divergence_detected
```

Supplier/AP:

```text
supplier_invoice_approved
payable_created
supplier_payment_settled
payable_settled
```

### Legacy event bridge

Existing `payment_received` currently has business-workflow meaning and must not be silently redefined.

During migration:

```text
canonical receivable/customer-payment event
      |
      +--> Financial Kernel consumers
      |
      +--> legacy bridge -> fireEvent('payment_received', ...)
```

This preserves current Karin/pipeline/project behavior while the durable financial semantics become more precise.

---

## 8. Correlation and causation

Every economic chain gets one `correlation_id`.

Example invoice `inv_123`:

```text
invoice_issued              correlation=fin_inv_123
receivable_created          correlation=fin_inv_123
payment_intent_created      correlation=fin_inv_123
payment_settled             correlation=fin_inv_123
payment_allocated           correlation=fin_inv_123
receivable_settled          correlation=fin_inv_123
journal_entry_posted        correlation=fin_inv_123
payout_settled              correlation=fin_inv_123
reconciliation_matched      correlation=fin_inv_123
```

Each child event also carries `causation_id` pointing to the event that caused it.

This powers:

- audit trail;
- support/debugging;
- customer-facing financial timeline;
- replays;
- shadow comparisons;
- agent explanations.

---

## 9. Pay domain model

Recommended tables (names may be prefixed `financial_` if desired):

```text
payment_intents
payments
payment_attempts
payment_allocations
refunds
payouts
provider_events
payment_external_refs
bank_accounts
bank_transactions
reconciliation_matches
```

### 9.1 Payment intent

Represents *what we want paid*.

Key fields:

```text
id
business_id
invoice_id nullable
customer_id nullable
amount
currency
status
payment_method_options
expires_at
correlation_id
metadata
```

### 9.2 Payment

Represents normalized Handymate money movement from payer toward merchant/provider balance.

```text
id
business_id
payment_intent_id
provider
provider_payment_id
amount
currency
status
settled_at
failure_code nullable
correlation_id
```

Provider-specific payloads should be stored separately/JSON for audit, not leak into all product code.

### 9.3 Payment attempt

Keep attempts separate from payments/intents. One intent may be tried multiple times.

### 9.4 Payment allocation

This is the bridge between Pay and commercial receivables.

```text
id
business_id
payment_id
invoice_id / receivable_id
amount
currency
status
allocated_at
reversed_at nullable
```

A payment is not the same thing as an invoice being paid. The invoice becomes settled according to **allocations against its receivable components**.

### 9.5 Refund

Refunds must be independent money-movement objects linked to an original payment; never just decrement `paid_amount` with no history.

### 9.6 Payout

Provider payout to bank is separate from customer payment.

A card payment can be settled from the customer perspective while the merchant cash is still held by the provider.

---

## 10. Payment state machine

Normalize provider-specific states into a stable Handymate model:

```text
created
  -> pending
  -> authorized       (where applicable)
  -> processing
  -> settled

failure branches:
  -> failed
  -> cancelled

post-settlement branches:
  -> partially_refunded
  -> refunded
  -> disputed         (where applicable)
```

No caller may jump states without the state-machine validator.

Do not assume `payment_received` means irreversible bank cash.

---

## 11. Provider adapter boundary

Never:

```text
Stripe/PSP webhook -> Ledger
```

Always:

```text
Provider webhook
   -> verify signature
   -> persist raw provider event + dedupe
   -> ProviderAdapter.normalize()
   -> Handymate Payment state transition
   -> canonical financial event
   -> Allocation/Reconciliation/Ledger consumers
```

Conceptual interface:

```ts
interface PaymentProviderAdapter {
  createPaymentIntent(input: CreatePaymentInput): Promise<ProviderIntent>
  getPayment(id: string): Promise<ProviderPayment>
  refund(input: RefundInput): Promise<ProviderRefund>
  verifyWebhook(request: Request): Promise<VerifiedProviderEvent>
  normalizeEvent(event: VerifiedProviderEvent): NormalizedPaymentEvent
}
```

Provider secrets are server-only. Provider IDs are external references, not Handymate primary IDs.

---

## 12. Webhook correctness

Every payment webhook endpoint must:

1. verify cryptographic/provider signature;
2. reject invalid timestamp/signature;
3. persist the provider event ID;
4. enforce unique provider-event dedupe;
5. process idempotently;
6. tenant-resolve from a trusted provider mapping, never request payload alone;
7. never trust user-supplied `business_id`;
8. retain enough raw metadata for audit/debugging without unnecessarily storing sensitive payment data;
9. return success appropriately on harmless retries;
10. generate canonical Financial Kernel events only after normalized state transition succeeds.

---

## 13. Ledger domain model

Suggested tables:

```text
ledger_accounts
ledger_fiscal_years
ledger_periods
ledger_journals
ledger_entries
ledger_entry_lines
ledger_posting_rules
ledger_source_documents
ledger_external_refs
ledger_audit_events
```

### Ledger entry

Header:

```text
id
business_id
journal_id
voucher_number
effective_date
posted_at
source_event_id
correlation_id
posting_rule_id
posting_rule_version
reversal_of_entry_id nullable
description
status
```

Lines:

```text
id
entry_id
account_id
debit NUMERIC
credit NUMERIC
currency
vat_code nullable
project_id nullable
customer_id nullable
supplier_id nullable
metadata
```

Invariant enforced in DB/service:

```text
SUM(debit) == SUM(credit)
```

Prefer database-level validation/posting RPC rather than trusting application callers.

---

## 14. Posting Engine

Product modules never provide arbitrary final journal lines unless they are an explicitly privileged accounting tool.

Instead:

```ts
postingEngine.handle(financialEvent)
```

A deterministic rule maps event -> posting.

Example SE customer invoice:

```text
invoice_issued
  DR 1510 Accounts Receivable
  CR revenue account(s)
  CR 2611 Output VAT
```

Example provider-settled customer payment before bank payout:

```text
payment_allocated
  DR payment-provider clearing
  CR 1510 Accounts Receivable
```

Example provider payout with fee:

```text
payout_settled
  DR 1930 Bank                      9,850
  DR payment fee expense              150
  CR provider clearing             10,000
```

This separation is essential. Otherwise Pay might claim "paid" while Ledger cannot explain where cash/fees/clearing balances came from.

### Posting rule provenance

Store:

```text
posting_rule_id
posting_rule_version
source_event_id
source_document_id
AI/classifier provenance if applicable
approval provenance if applicable
```

Same event + same rule version must produce the same posting.

---

## 15. Global Ledger + Country Packs

Global core handles:

```text
account
journal
entry
line
period
currency
counterparty
source document
allocation
reconciliation
```

Swedish pack handles:

```text
BAS mappings
VAT codes/rules
VAT regime per invoice (standard / reverse charge / exempt)
accounting method (accrual / cash basis)
ROT/RUT accounting
SIE import and export
Swedish report conventions
local rounding/tax rules
statutory retention and voucher identification rules (see §36)
```

Do not hard-code `1510`, `1930`, `2611` etc. into generic Pay code.

A provider payment event asks the country/posting layer which accounts apply.

Every BAS account number proposed in this document is a **proposal pending confirmation by the
accounting consultant**, per §13 of the roadmap. Models must not present a chosen account number
as an accounting decision.

### 15.1 Reverse-charge construction VAT (omvänd skattskyldighet för byggtjänster)

**This is not an edge case for Handymate's core segment. It is a large share of B2B invoice
volume and must be modelled before the first SE posting rule is considered complete.**

When a construction service is sold to a buyer who is a taxable person that sells construction
services other than temporarily, the seller charges no output VAT and the buyer accounts for it.

Consequences that reach outside the ledger:

```text
Invoice        needs a VAT regime, not just a vat_rate
Counterparty   needs a recorded, evidenced buyer status (it is a property of the buyer)
Posting        sale posts with no output VAT, to its own revenue account
Purchase side  the buyer books both output and input VAT on the acquisition
VAT return     separate boxes on both sides
Invoice PDF    a statutory reference to reverse charge must appear on the document
```

Current code state (2026-09-11): no reverse-charge concept exists anywhere in the repository.
`lib/invoices/create-invoice.ts` defaults `vat_rate` to 25 and the invoice carries a single rate.
Introducing a VAT regime is therefore a **data-model change to the invoice domain**, not a
country-pack-only change, and it must be designed in the same package as the SE posting rules.

Required by: §31, §36.3, Golden path 31–32.

### 15.2 Accounting method: accrual vs cash basis (kontantmetoden)

The posting model in §14 assumes accrual basis — `invoice_issued` immediately posts accounts
receivable. Swedish companies below the statutory net-sales threshold for kontantmetoden may
instead book purchases and sales on payment, with unpaid documents booked at the fiscal year end.

**That describes the default configuration of Handymate's core customer, not an exception.**

The kernel must therefore treat accounting method as a per-business SE pack setting that changes
*which event triggers the revenue/VAT posting*:

```text
accrual (faktureringsmetoden)
  invoice_issued        -> AR + revenue + output VAT
  payment_allocated     -> bank/clearing vs AR

cash basis (kontantmetoden)
  invoice_issued        -> no ledger posting (commercial/receivable state only)
  payment_allocated     -> bank/clearing + revenue + output VAT
  fiscal year end       -> unpaid documents booked as receivables/payables
```

Note the architectural consequence: under cash basis the **receivable still exists in the
kernel** — Pay, allocation, reconciliation and the invoice projection are unchanged. Only the
Ledger projection differs. This is a good test of the Financial Kernel boundary: if supporting
cash basis requires changing Pay, the boundary has been drawn wrong.

A business may also change method at a fiscal-year boundary, which interacts with §18.4.

Required by: §31, §36.4, Golden path 33.

### 15.3 VAT return (momsdeklaration)

The SE pack must produce the VAT return figures, mapped to the declaration's boxes, including
the reverse-charge and ROT/RUT interactions above.

Whether Handymate also **files** the return is an open product decision (§38.3), not an
implementation detail to be settled by whoever writes the module. Produce-only and file-also
are different products with different liability. Do not let the answer default by omission.

### 15.4 SIE is an early deliverable, not a late one

SIE import and export must be available **before the first pilot business**, not before broad
migration, for three reasons:

1. Export is the customer's exit guarantee and the cheapest answer to "what happens to my books
   if Handymate disappears" — see roadmap §5 (export capability to prevent lock-in).
2. Import is how opening balances enter the ledger at cut-over (§18.4).
3. It is the format in which an external accounting consultant or auditor will want to inspect
   the ledger — which is exactly during the pilot, when their review matters most.

---

## 16. ROT/RUT — model correctly from day one

Current code already has a useful conceptual distinction:

```text
customer_paid
then
paid when Skatteverket portion arrives
```

Preserve the behavior but model it more formally.

A ROT/RUT invoice can have multiple receivable components:

```text
Receivable A: customer share
Receivable B: tax authority expected share
```

Customer payment allocates against A.

```text
payment_settled(customer)
 -> allocation to customer receivable
 -> customer obligation settled
 -> legacy status projection = customer_paid
```

Skatteverket payout allocates against B.

```text
payment_settled(tax_authority)
 -> allocation to tax receivable
 -> all receivable components settled
 -> invoice projection = paid
```

This generalizes better than special-casing `paid_amount` and prepares the architecture for other split payer/subsidy models internationally.

Two interactions must not be forgotten:

- **Accounting method (§15.2).** Under cash basis the receivable components still exist in the
  kernel; only the ledger posting moment differs. If supporting cash basis forces a change to the
  ROT/RUT receivable model, the kernel boundary has been drawn in the wrong place.
- **Post-payment automation (§18.5).** Settlement of the *customer* component is what fires the
  customer-facing effects. Settlement of the tax-authority component must not fire them again.

---

## 17. Reconciliation domain

Reconciliation proves that external money reality agrees with Handymate state.

Objects:

```text
bank_transactions
provider settlements/payouts
payments
allocations
ledger entries
reconciliation_matches
```

Possible states:

```text
unmatched
suggested
matched
partially_matched
exception
reversed
```

Example:

```text
Bank transaction +9,850
  <-> PSP payout +9,850
  <-> payments gross 10,000
  <-> PSP fee 150
  <-> ledger clearing balance 0
```

The system should be able to explain the complete equation.

Karin UX target:

> "47 of 49 transactions are reconciled. Two exceptions require review."

---

## 18. Invoice compatibility migration

Do not break today's invoice UI/API while building the kernel.

### 18.1 Phase A — compatibility projection

Keep current fields:

```text
invoice.status
invoice.paid_amount
invoice.paid_at
invoice.settled_at
invoice.paid_via
```

But once the kernel is enabled, treat them as **compatibility projections** from receivable/payment allocation state.

### 18.2 Evolve `applyInvoicePayment()`

Current callers should continue calling `applyInvoicePayment()` initially.

Internally, when `financial_kernel_enabled` is true, it should become a facade:

```text
applyInvoicePayment()
  -> record/import canonical payment
  -> allocate payment to invoice receivable
  -> project invoice aggregate fields
  -> bridge legacy post-payment automation
```

Legacy path stays behind a feature flag during migration.

This lets these callers migrate without simultaneous rewrites:

- manual mark-paid;
- customer confirmation;
- status patch;
- Fortnox sync.

### 18.3 Removing the legacy rounding tolerance is a breaking change

`lib/invoices/payment-decision.ts` applies `TOLERANCE_KR = 1` — a documented ±1 kr tolerance
against öresavrundning between Handymate and Fortnox. It decides, today, whether an invoice
becomes `paid` or stays `customer_paid`.

It cannot cross into the kernel (§5). A silent tolerance produces a general ledger that is a
krona out with nothing that explains it, and the drift compounds across partial payments.

Treat this as a **breaking semantic change to tested behaviour**, not a cleanup:

```text
legacy      difference <= 1 kr  -> treated as fully settled, silently
kernel      difference within rounding policy  -> explicit rounding posting, receivable settled
            difference outside rounding policy -> reconciliation exception, receivable open
```

Requirements:

- The kernel path must reproduce the *user-visible outcome* of the legacy path for every case
  currently covered by `tests/apply-payment-decision.spec.ts` — an invoice that settles today
  must still settle, now with a posting that says why.
- The rounding policy and its account live in the SE pack, not in payment code.
- Shadow mode (§20) must report a tolerance-driven divergence as a divergence, not hide it.

### 18.4 Opening balances and historical data

No document may assume that historical invoices can be replayed into the ledger. They cannot:
`paid_amount` is an aggregate with no stored receivable composition, so the components of an
invoice paid before the kernel existed are not reconstructable.

**The cut-over model is an opening balance at a fiscal-year boundary, not a replay.**

```text
choose cut-over date = a fiscal year start
  -> import ingående balans from the outgoing system (SIE, see §15.4)
  -> post it as an opening-balance journal in its own journal type
  -> lock every period before the cut-over
  -> the ledger is canonical only from the cut-over forward
```

Consequences that must be designed, not discovered:

- Invoices issued before the cut-over but paid after it settle against an opening AR balance,
  not against a receivable the kernel created. This is a real case in every migration and needs
  a golden path (see 35).
- The cut-over date is per business and must be stored, displayed and auditable.
- Periods before the cut-over are permanently locked; §22's locked-period invariant applies.
- Which fiscal-year boundary to use for the first pilots is an open decision (§38.4).

### 18.5 Preserve the exact post-payment automation semantics

§7 says `payment_received` must not be silently redefined. The specific trap is narrower than
that and is encoded in today's code rather than in any specification:

```text
applyInvoicePayment() fires post-payment effects on:
  to_paid           yes
  to_customer_paid  yes   <- the customer relationship is complete when the customer has paid
  settled           NO    <- no second thank-you SMS when Skatteverket pays out
```

Under the receivable-component model (§16) the natural implementation fires on receivable
settlement — which produces exactly the duplicate customer message the current code avoids.

**Binding:** the bridge fires on settlement of the *customer* receivable component only. This
is a named regression test (golden path 34), not a note to be careful.

### 18.6 Later

New Handymate Pay flows call the Financial Kernel directly; `applyInvoicePayment()` remains only as a compatibility adapter for manual/import paths.

---

## 19. Supplier invoice compatibility migration

Today supplier invoice status can be set directly and Fortnox sync marks it paid.

Target:

```text
supplier_invoice_approved
 -> payable_created
 -> ledger AP posting

supplier payment
 -> payment/money movement
 -> allocation to payable
 -> payable_settled
 -> supplier_invoices.status projection = paid
```

During migration, direct admin updates can remain available but must create an explicit manual financial event rather than silently flip status.

---

## 20. Fortnox shadow mode

Fortnox becomes temporary validation infrastructure, not permanent architecture.

### Payment shadowing

Current `syncFortnoxPaymentsForBusiness()` can evolve from "Fortnox tells Handymate the truth" toward:

```text
Fortnox status/balance
      |
      v
Fortnox Reference Snapshot
      |
      v
compare with Financial Kernel
      |
      +--> equal: verified
      +--> mismatch: PAYMENT_DIVERGENCE
```

### 20.1 Shadow mode is structurally blind until the direction is flipped

Read this before interpreting any shadow comparison as evidence.

Today Fortnox is the **source** of payment truth: `lib/fortnox/sync-payments.ts` pulls Fortnox
state on a 2h cron and normalizes it through `applyInvoicePayment()` with `source: 'fortnox'`.
Handymate's payment state is therefore *derived from* Fortnox.

```text
Phase S1  Fortnox -> Handymate        comparison proves the sync works.
                                      It CANNOT detect divergent payment truth,
                                      because there is only one truth.

Phase S2  Handymate -> its own truth  Fortnox import becomes a reference snapshot
          Fortnox -> snapshot only    for the business. Divergence is now meaningful.
```

**Binding:** the phase flip is per business, explicit, dated and recorded. A green comparison in
phase S1 must never be reported — in a dashboard, a status update or a pilot decision — as
evidence that the kernel computes payment state correctly. Divergence metrics start at S2.

This does not weaken shadow mode; it is the strongest idea in this document. It means the
team must not read the easy green period as the hard one.

### 20.2 Accounting shadowing

For pilot businesses compare:

- voucher totals;
- account balances;
- AR/AP;
- VAT;
- invoice balances;
- supplier balances;
- cash/clearing;
- period totals.

Never auto-correct Handymate from Fortnox when a divergence occurs. Create an explicit exception, diagnose it and turn the fix into a regression test.

---

## 21. Idempotency model

Every external or retryable operation needs a stable idempotency key.

Examples:

```text
provider_event:{provider}:{event_id}
payment_settlement:{provider}:{payment_id}:{settlement_version}
allocation:{payment_id}:{receivable_id}:{amount}
invoice_posting:{invoice_id}:{version}
payout:{provider}:{payout_id}
fortnox_import:{business_id}:{document}:{external_version}
```

If the same provider webhook arrives five times, the outcome is still one payment transition, one allocation and one posting.

Ledger should enforce uniqueness on source event/posting rule where appropriate.

---

## 22. Required invariants

Run these at write-time where possible and also in scheduled integrity checks.

### Ledger

```text
For every posted entry: sum(debit) = sum(credit)
No posting into a locked period unless explicitly privileged correction workflow
A reversal references an existing entry and cannot itself be silently mutated
```

### Receivables

```text
invoice outstanding
= receivable total
- valid allocations
- valid credit adjustments
```

### Payments

```text
sum(active allocations) <= settled allocatable payment amount
sum(refunds) <= refundable settled amount
provider event processed at most once
```

### Reconciliation

```text
reconciled bank amount
= matched payout/payment amount adjusted by explicitly modelled fees/differences
```

### Tenant isolation

```text
Every referenced invoice/payment/account/bank transaction belongs to same business_id
```

Create a scheduled `financial_integrity_check` that reports exceptions without silently repairing history.

---

## 23. Golden-path E2E scenarios

These tests are more important than isolated "Pay tests green" and "Ledger tests green".

Minimum suite:

1. Standard invoice -> customer payment -> allocation -> AR zero -> ledger -> reconciliation.
2. Card/provider payment -> clearing -> payout -> provider fee -> bank reconciliation.
3. Full Swish/bank payment.
4. Partial payment.
5. Two partial payments completing one invoice.
6. One payment allocated to multiple invoices.
7. Overpayment.
8. Full refund.
9. Partial refund.
10. Credit note before payment.
11. Credit note after payment/refund workflow.
12. Duplicate webhook.
13. Provider webhook arrives before UI callback.
14. Bank transaction arrives before provider payout event.
15. Payment failure after intent creation.
16. Provider settlement delayed.
17. ROT customer share paid; Skatteverket pending.
18. ROT customer + Skatteverket fully settled.
19. ROT partial/adjusted authority payment exception.
20. Supplier invoice approved -> AP posting -> supplier payment -> reconciliation.
21. Supplier credit note.
22. Bank/provider fee.
23. Rounding difference.
24. Period locks between invoice and settlement dates.
25. Reversal/correction of a wrongly categorized accounting event.
26. Fortnox shadow equality.
27. Fortnox divergence creates exception, not silent overwrite.
28. Replay all financial events produces same derived state.
29. Cross-tenant reference attempt is rejected.
30. Same command retried after network timeout remains exactly-once economically.
31. Reverse-charge construction invoice: no output VAT, correct revenue account, correct VAT
    return boxes, statutory reference present on the invoice document (§15.1).
32. Same customer, one standard-VAT invoice and one reverse-charge invoice in the same period —
    VAT return and revenue accounts stay separated (§15.1).
33. Cash-basis business: `invoice_issued` produces no ledger posting; payment produces revenue
    and output VAT; fiscal-year-end books the unpaid documents (§15.2).
34. ROT/RUT settlement fires post-payment automation exactly once — on the customer share, not
    again when the Skatteverket share arrives (§18.5). Regression test for existing behaviour.
35. Invoice issued before cut-over, paid after cut-over: settles against the opening AR balance,
    no duplicate revenue, no posting into a locked pre-cut-over period (§18.4).
36. Öresavrundning difference: settles with an explicit rounding posting, not a tolerance (§18.3).
37. Difference outside the rounding policy: receivable stays open, reconciliation exception
    raised, nothing silently absorbed (§5).
38. Cash-basis business switching to accrual at a fiscal-year boundary (§15.2).
39. Dunning fee and interest on an overdue invoice: correct VAT treatment and accounts (§37).
40. Shadow phase S1 comparison is not reported as kernel-correctness evidence (§20.1).

Each test should assert the **whole final state**:

```text
payment state
allocation state
invoice outstanding/status
bank/reconciliation state
ledger balances
financial event chain
audit provenance
legacy automation bridge behavior where applicable
```

---

## 24. Financial timeline / observability

Build an internal timeline early; do not wait for a polished customer UI.

Example:

```text
Invoice #1843
10:21 invoice issued             84,375 SEK
10:21 receivable created        84,375 SEK
10:21 journal posted            V#1043

14 Sep
09:04 payment initiated
09:05 payment settled           84,375 SEK
09:05 payment allocated         84,375 SEK
09:05 customer receivable       0 SEK

15 Sep
11:32 PSP payout                84,120 SEK
11:32 PSP fee                      255 SEK
11:33 bank transaction matched
11:33 ledger clearing           0 SEK
```

Every row should link through `correlation_id` and source IDs.

This view is useful for engineering, support, accountants, auditors and eventually customers.

---

## 25. Security and permission model

Reuse current tenant/auth patterns (`getAuthenticatedBusiness`, ownership checks, existing financial permissions), but introduce finer financial capabilities when needed.

Suggested future permissions:

```text
see_financials          existing
create_invoices         existing
manage_payments
refund_payments
reconcile_bank
manage_accounting
post_manual_journal
lock_accounting_period
manage_payment_provider
```

Rules:

- Refunds and manual journals are high-risk actions.
- Period unlocking requires explicit audit reason and elevated permission.
- Provider connection changes require admin-level permission.
- Every privileged financial command stores actor ID + reason where relevant.
- Never expose provider secrets to browser/client components.
- Webhook tenant resolution must come from trusted provider account mapping.
- PII/payment metadata retention must be minimized and classified.

---

## 26. Dates and financial time semantics

Do not overload one timestamp.

Use explicit concepts:

```text
occurred_at     when event happened in source system
effective_date  accounting/business effective date
created_at      when Handymate persisted it
settled_at      when payment became settled
payout_at       provider payout timestamp
banked_at       when bank transaction posted
posted_at       ledger posting timestamp
```

Accounting period selection should use `effective_date` according to country rules, not arbitrary API receipt time.

---

## 27. Feature flags / rollout controls

Suggested per-business settings:

```text
financial_kernel_enabled
handymate_pay_enabled
handymate_ledger_enabled
shadow_payments_enabled
shadow_accounting_enabled
auto_post_accounting_enabled
auto_reconcile_enabled
```

Rollout sequence should allow:

```text
legacy only
-> kernel shadow
-> kernel canonical + legacy projection
-> Pay live, Fortnox accounting remains reference
-> Ledger shadow
-> Ledger canonical with Fortnox shadow
-> Handymate-only accounting
```

Never require a big-bang migration.

---

## 28. Suggested implementation phases

### Sprint −1 — Commercial and regulatory track (starts first, runs in parallel throughout)

**The critical path for Pay is not owned by the engineering team.** This sprint has no code and
must start before Sprint 0, because its lead times are months, not weeks:

- **Merchant-of-record decision** (§38.1). Merchant-of-record vs. platform vs. marketplace payout
  determines who holds customer money, who owns the receivable at each moment, what the clearing
  account *means*, who carries chargeback liability, and how Handymate's own fee is invoiced and
  VAT-treated. These are ledger semantics. The decision must precede the first posting rule even
  though the implementation stays behind the adapter boundary (§11).
- **PSP selection and onboarding**: KYC, commercial terms, contract.
- **Bank transaction access**: a PSD2/AIS licence or a contract with a licensed aggregator.
- **Named domain experts engaged**: an operational accounting consultant and an auditor who will
  actually review the posting rules, per roadmap §13. Sprint 3 and Package C9 are blocked on a
  real person, not on a document.

Sprint estimates elsewhere in this section price coding time only. Treat any date that depends
on a counterparty as unestimated until that counterparty is contracted.

### Sprint 0 — Contracts and architecture

- Update canonical `ARCHITECTURE.md` with approved financial events.
- Implement `Money` abstraction.
- Define financial event schema/versioning.
- Define DB schema and indexes.
- Define RPC/atomic write boundaries.
- Define provider adapter interface.
- Define Posting Engine interface.
- Write first 10–15 golden-path tests before production implementation.

### Sprint 1 — Financial Kernel foundation

- `financial_events` + outbox/inbox/idempotency.
- Correlation/causation.
- Audit service.
- Receivable/allocation model.
- Compatibility projection to current invoice fields.
- Adapt `applyInvoicePayment()` behind feature flag.

### Sprint 2 — Pay beta

- Payment intent API.
- First licensed payment provider adapter.
- Signed webhook endpoint.
- Provider-event dedupe.
- Payment state machine.
- Allocation to customer invoice.
- Existing invoice UX/payment link integration.
- Legacy `payment_received` bridge.

### Sprint 3 — Ledger core

> **Open decision (§38.2):** the review recommends running Ledger *before* Pay — Ledger has no
> regulated counterparty, no customer money at risk, and delivers the margin-truth moat directly,
> while Pay has the longest external lead time and the largest blast radius. The order below is
> the original plan and stands until the owner decides. Do not reorder unilaterally.

- Accounts/fiscal years/periods/journals/entries/lines.
- SE country-pack skeleton.
- Invoice posting rules.
- Payment/clearing posting rules.
- Reversal/correction flow.
- Basic general ledger / balance / P&L projections.

### Sprint 4 — Bank + reconciliation

- Bank/provider transactions.
- Payouts/fees.
- Reconciliation matcher.
- Exception queue.
- Financial timeline.

### Sprint 5 — Supplier/AP + VAT

- Supplier invoice approval event.
- Payable model.
- Supplier payment allocations.
- AP posting rules.
- VAT reporting primitives, including reverse charge on both sides (§15.1).
- VAT return box mapping (§15.3).

### Sprint 6 — Shadow Accounting

- Fortnox reference snapshots.
- Account/voucher/AR/AP/VAT comparisons.
- Divergence events + UI/internal report.
- Historical replay tests.

### Sprint 7 — Controlled pilot

- Professional accounting review.
- Selected businesses.
- Auto-post thresholds.
- Daily integrity checks.
- Formal rollback/export procedure.

---

## 29. Definition of done — Handymate Pay beta

Pay is not "done" because a payment button works.

Beta requires at minimum:

- Provider-neutral internal payment model.
- Tenant-bound payment intents.
- Signed webhook verification.
- Provider-event idempotency.
- Payment state machine.
- Partial payments.
- Allocation to invoices.
- Refund model.
- Clear distinction customer settlement vs provider payout.
- Fees modeled.
- Audit trail.
- Ledger-ready canonical events.
- Reconciliation-ready external refs.
- E2E tests for duplicates/retries/failures.
- Current invoice UI/status remains consistent.
- Merchant-of-record model decided, documented and reflected in the clearing/receivable semantics (§38.1).
- No monetary comparison tolerance anywhere in the kernel path (§5, §18.3).
- Post-payment automation fires exactly as it does today, ROT/RUT included (§18.5, golden path 34).

---

## 30. Definition of done — Ledger beta

Ledger is not "done" because debit equals credit in one test.

Beta requires at minimum:

- Exact-number storage/calculation.
- Double-entry posting engine.
- Accounts/journals/voucher numbering.
- Fiscal years/periods/locking.
- Immutable posted history + reversal workflow.
- Source-document/event provenance.
- SE account/VAT mapping, reviewed and confirmed by the accounting consultant.
- VAT regime support: standard, reverse-charge construction, exempt (§15.1).
- Accounting method support: accrual and cash basis (§15.2).
- Customer invoice posting.
- Customer payment/clearing posting.
- Supplier invoice/AP posting.
- Rounding differences posted explicitly; no tolerances (§5, §18.3).
- Basic P&L/balance/general ledger.
- SIE import and export working **before the first pilot business**, not before broad migration (§15.4).
- Opening-balance cut-over implemented, with pre-cut-over periods locked (§18.4).
- Statutory requirements met and evidenced: voucher identification, retention, system
  documentation and processing history, readable presentation (§36).
- Audit/system documentation.
- Golden-path E2E suite.
- Fortnox shadow validation for pilot companies, in phase S2 — phase S1 does not count (§20.1).

---

## 31. What not to do

Do not:

- build Stripe-specific tables as the product domain;
- let webhook handlers write `invoice.status='paid'` directly;
- let Pay write journal rows directly;
- use `fireEvent()` as the only financial record;
- trust floating-point JS values as accounting truth;
- store only aggregate `paid_amount` with no payment/allocation history;
- equate customer payment with bank payout;
- silently alter posted journals;
- let Fortnox divergences overwrite Handymate automatically;
- hard-code Swedish account numbers into global payment code;
- add new financial event names locally without first updating `ARCHITECTURE.md`;
- launch auto-posting broadly before shadow comparison and professional review;
- introduce any monetary comparison tolerance in kernel code — a difference is a posting or an
  exception, never a band (§5, §18.3);
- assume every Swedish invoice carries output VAT — reverse-charge construction VAT is a large
  share of B2B volume in this segment (§15.1);
- assume accrual accounting — cash basis is the default for most of the target segment (§15.2);
- plan to replay historical invoices into the ledger; cut over on an opening balance (§18.4);
- report a phase S1 shadow comparison as evidence that the kernel is correct (§20.1);
- present a chosen BAS account number as an accounting decision — it is a proposal until the
  accounting consultant confirms it (§15);
- resolve an open decision in §38 by picking the convenient answer.

---

## 32. Existing-file integration checklist

| Existing path | Keep | Change during kernel migration |
|---|---|---|
| `lib/invoices/create-invoice.ts` | Yes | emit durable `invoice_issued/receivable_created` transactionally or via safe outbox path; retain legacy event bridge; **add VAT regime — today it defaults `vat_rate` to 25 with no reverse-charge concept (§15.1)** |
| `app/api/invoices/route.ts` | Yes | consume Money helpers gradually; no direct Ledger writes |
| `lib/invoices/apply-payment.ts` | Yes, initially | become compatibility facade over payment + allocation + invoice projection |
| `lib/invoices/payment-decision.ts` | Concepts yes | move toward receivable-component/allocation rules; remove aggregate-only assumptions over time; **`TOLERANCE_KR` must not cross into the kernel — breaking change, see §18.3** |
| `app/api/invoices/[id]/mark-paid/route.ts` | Yes | manual payment becomes explicit financial command/event |
| `lib/fortnox/sync-payments.ts` | Yes | shift from source-of-truth importer to reference/shadow adapter per rollout phase; **the flip is what makes shadow divergence meaningful (§20.1)** |
| `app/api/invoices/[id]/reconcile-fortnox` | Yes | evolve into shadow reconciliation/reporting surface |
| `app/api/invoices/[id]/send-via-fortnox` | Temporary | bridge until Handymate is accounting system of record |
| `app/api/swish-qr/route.ts` | UX helper | tenant-bound invoice Pay flows should use payment intents; do not treat QR generation as settlement |
| `app/api/supplier-invoices/route.ts` | Yes | supplier payment/status becomes payable/allocation projection; replace raw monetary parsing in kernel paths |
| `lib/automation-engine.ts` | Yes | downstream bridge only; not durable finance bus |
| `app/api/rot-payment/*` | Yes | integrate with SE country pack and receivable components |

---

## 33. First implementation tasks for Codex/Claude

When this initiative starts, create separate scoped workstreams rather than one giant prompt.

### Workstream A — Kernel/contracts

1. Read `handymate-dashboard/ARCHITECTURE.md` and this document.
2. Propose exact SQL schema + indexes + RLS/tenant constraints.
3. Update `ARCHITECTURE.md` event contract before implementation.
4. Implement Money utilities and event types.
5. Implement idempotent event/outbox primitives.
6. Add tests only; no Pay provider yet.

### Workstream B — current payment migration

1. Characterize all callers of `applyInvoicePayment()`.
2. Add kernel feature flag.
3. Implement receivable/payment/allocation compatibility facade.
4. Prove legacy invoice statuses and post-payment automations remain unchanged under golden-path tests.

### Workstream C — Ledger

1. Implement schema + posting RPC.
2. Implement SE invoice posting rules.
3. Add balance invariant tests.
4. Feed canonical invoice/payment events.
5. Build read-only reports.

### Workstream D — Pay provider

1. Select provider/partner separately from domain architecture.
2. Implement adapter only against the already-defined interface.
3. Add webhook verification/dedupe.
4. Create tenant-bound payment intents.
5. Feed canonical payment events; never call Ledger provider-specific code.

### Workstream E — Fortnox shadow verifier

1. Reuse current integration/auth.
2. Persist reference snapshots.
3. Compare payment and accounting state.
4. Create divergence artifacts/events.
5. Convert every real divergence found into regression tests.

---

## 34. Final architectural rule

The Financial Kernel is the economic spine for future Handymate verticals.

Later modules should plug into the same contracts:

```text
Procurement -> payable events -> Pay -> Ledger
Payroll     -> payroll liabilities/payments -> Ledger
Cards       -> payment/card transactions -> reconciliation -> Ledger
Capital     -> financing cash flows -> Ledger
Insurance   -> premiums/payments -> Ledger
Marketplace -> customer payments/payouts -> Ledger
```

If we build this foundation correctly, Pay and Ledger are not two features. They become the shared financial infrastructure that lets Handymate expand into the rest of the customer's company without repeatedly reinventing how money, accounting, audit and reconciliation work.

> **Guiding principle:** operational work creates economic events; the Financial Kernel records the money truth; Ledger records the accounting truth; reconciliation proves they agree.

---

## 35. Platform & Product Integration Contract

This section is a **binding product-architecture decision**. Pay and Ledger must integrate into the existing Handymate product as parts of one platform, not become separate applications that fragment context, navigation or data ownership.

### 35.1 One platform, not a separate Accounting product

Handymate remains the platform and primary application shell.

Do **not** create a separate Accounting codebase, separate login experience, separate tenant model or a standalone `accounting.handymate...` product that forces customers to leave the operational context.

The product hierarchy is:

```text
HANDYMATE PLATFORM

CRM / Leads / Quotes / Projects / Time / Materials / Invoices
                         |
                         v
                FINANCIAL KERNEL
        Money • Events • Receivables • Payables
        Payments • Allocations • Bank • Audit
                 |                |
          +------+                +------+
          v                              v
   HANDYMATE PAY                  HANDYMATE LEDGER
 payment capability              accounting module
 PSP / Swish / bank              journal / VAT / reports
```

The Financial Kernel is infrastructure. It has no requirement to be exposed as one monolithic user-facing product surface.

### 35.2 Ledger is an entitlement-based Handymate module

Handymate Ledger / Accounting is an optional module inside the existing Handymate platform.

A customer without Ledger may continue using Handymate for operational workflows, invoicing and Pay while an external accounting system remains system of record.

A customer with Ledger gets additional finance surfaces in the same product context.

Target information architecture:

```text
Economy
├── Overview
├── Invoices / Accounts Receivable
├── Payments
├── Supplier Invoices / Accounts Payable
├── Bank & Reconciliation
├── Bookkeeping              [ledger entitlement]
├── VAT                      [ledger entitlement]
├── Reports                  [ledger entitlement]
└── Accountant / Auditor     [role + entitlement]
```

Do not require customers to understand ledger concepts for ordinary daily work. Detailed accounting is available when needed, but most bookkeeping should be the verified consequence of operational events.

### 35.3 Pay is a cross-platform capability first, admin surface second

Handymate Pay is primarily a service/capability embedded where payment intent naturally occurs.

Primary surfaces:

```text
Invoice
  -> payment link / Swish / card / bank

Customer portal
  -> pay outstanding invoice

Project
  -> financial status / paid / outstanding

Automation / Karin
  -> payment reminders / payment status / exceptions

Financial timeline
  -> initiated / settled / allocated / payout / reconciled
```

Pay also needs a dedicated operational surface for exceptions and administration:

```text
Economy > Payments
├── Transactions
├── Payment attempts
├── Payouts
├── Refunds
├── Failed / disputed payments
└── Provider settings
```

The dedicated Pay page is not the primary customer workflow. Users should normally encounter Pay inside the invoice, portal, project and financial workflows they already use.

### 35.4 Pay and Ledger must be independently purchasable/capable

Technical coupling through the Financial Kernel must **not** force commercial coupling.

Supported configurations must include:

```text
Core only
Core + Pay
Core + Ledger
Core + Pay + Ledger
```

#### Core + Pay, external accounting

```text
Invoice
 -> Handymate Pay
 -> payment settled
 -> allocation
 -> invoice projection updated
 -> current Handymate workflows/automation
 -> external accounting/Fortnox remains accounting system of record
```

#### Core + Ledger, external payment rails

```text
Invoice
 -> external bank/payment
 -> bank/import/provider event
 -> reconciliation/allocation
 -> Handymate Ledger posting
```

#### Core + Pay + Ledger

```text
Invoice
 -> Handymate Pay
 -> payment settled
 -> allocation
 -> receivable settled
 -> Ledger posting
 -> payout/bank reconciliation
 -> project profitability / cash / reports updated
```

Pay must never depend on `handymate_ledger_enabled=true` to operate. Ledger must never require Handymate Pay to receive and reconcile external payments.

### 35.5 Entitlements and rollout flags

Separate infrastructure activation from product entitlement.

Conceptually:

```text
financial_kernel_enabled       internal infrastructure rollout
handymate_pay_enabled          customer can use Pay
handymate_ledger_enabled       customer can use Ledger/accounting
bank_reconciliation_enabled    bank/reconciliation surfaces enabled
auto_post_accounting_enabled   autonomous posting policy
payroll_enabled                future module
```

A Core customer may have Financial Kernel infrastructure active under the hood even when Ledger UI is not licensed. This lets payment/allocation history be captured consistently and makes later upgrades/migrations much safer.

Do not gate canonical kernel correctness behind a UI entitlement. Entitlements govern product access, not whether economic history is represented correctly.

### 35.6 Contextual finance across the existing platform

Ledger data must not live only on a bookkeeping screen.

Project surfaces should be able to show, subject to permissions:

```text
Revenue
Cost
Gross margin / contribution
Invoiced
Paid
Outstanding
Booked status
Reconciliation status
```

Invoice surfaces should show a lifecycle such as:

```text
Issued       ✓
Sent         ✓
Paid         ✓
Reconciled   ✓
Booked       ✓
```

with drill-down to detailed financial evidence when needed.

Customer and deal timelines can include financial milestones, but detailed account/journal information remains permission-controlled.

The Financial Timeline defined in section 24 should therefore support multiple presentation modes:

- internal engineering/support detail;
- accountant detail;
- business-owner summary;
- contextual invoice/project timeline.

All modes read the same canonical chain; they do not create separate status models.

### 35.7 User modes: business owner, accounting professional, auditor

The same underlying financial truth should be presented differently by role.

#### Business owner / trades company

Default UX is outcome- and exception-oriented:

```text
184,000 SEK outstanding
23,000 SEK due this week
38 of 40 financial events handled automatically
2 items require your review
```

Avoid forcing routine users into debit/credit screens.

#### Accountant / finance operator

Provide the full Ledger workspace:

- journals and voucher detail;
- source documents;
- reconciliation;
- VAT;
- corrections/reversals;
- reports;
- exception handling;
- closing/period controls.

#### Auditor / reviewer

Future controlled access should support read-only/review workflows for relevant periods, documents, journal history and audit trail without granting normal operational mutation rights.

This should reuse the same tenant/account identity system rather than creating a separate auditor application architecture.

### 35.8 Karin is the default day-to-day financial interface

The strategic UX goal is not to reproduce Fortnox screens inside Handymate.

Karin should surface outcomes and exceptions from Pay, Ledger and reconciliation, for example:

```text
Karin · Economy

✓ 12 payments matched
✓ 7 supplier invoices booked
✓ Bank reconciled through 10 September

Needs review:
• Supplier invoice 18,420 SEK — unusual project cost
• Bank transaction 2,995 SEK — receipt missing
```

The user can drill down into the underlying payment, allocation, source document, journal entry and audit chain.

Karin does not create a parallel finance truth. She consumes Financial Kernel state and invokes explicit, permissioned financial commands.

### 35.9 Navigation direction

Do not couple this architecture change to an immediate navigation redesign, but design toward a coherent Economy area.

Possible mature navigation:

```text
Home
Sales
Projects
Calendar

Economy
├── Invoices
├── Payments
├── Supplier invoices
├── Bank
├── Bookkeeping
├── VAT
└── Reports

Analytics
...
```

Existing standalone Invoice navigation may remain during migration. Move/merge navigation only when customer UX evidence supports it; do not combine risky financial backend migration with unnecessary information-architecture churn.

### 35.10 Product-surface source-of-truth rule

No UI surface may maintain its own independent interpretation of financial truth.

Examples:

- Project `paid` values derive from canonical payment allocations.
- Invoice payment status derives from receivable/allocation projections.
- Ledger badges derive from posting state.
- Reconciliation badges derive from reconciliation state.
- Karin summaries derive from the same canonical data.

Never add convenience booleans that become parallel sources of truth unless they are explicitly documented projections with reproducible derivation.

### 35.11 Internationalization consequence

The product shell should stay globally consistent while financial capabilities localize underneath it.

```text
Handymate Product UX
        |
Financial Kernel
        |
+-------------------------------+
| Global Pay domain             |
| Global Ledger domain          |
+-------------------------------+
        |
Country pack + provider adapters
```

A Swedish user and a future Norwegian/UK user should largely experience the same operational concepts — invoice, payment, bank, bookkeeping, report — while local tax/accounting/payment implementations differ below the shared product model.

### 35.12 Product integration acceptance criteria

Before Pay/Ledger is considered correctly integrated into Handymate, prove that:

1. An invoice can be created by today's existing flows and enter the Financial Kernel without a second invoice model.
2. Pay can settle that invoice without Ledger enabled.
3. An externally received payment can settle/reconcile that invoice without Handymate Pay enabled.
4. Ledger can consume the same canonical events when enabled without changing Pay semantics.
5. Turning Ledger on does not require migrating users to another app/login/tenant.
6. Project, invoice and Economy surfaces display consistent financial state from the same canonical objects.
7. Karin reports the same state that detailed financial views show.
8. Accountant/auditor permissions expose deeper views without creating separate financial records.
9. Disabling a product entitlement hides/disables its product capability but does not corrupt or erase canonical financial history.
10. A future country pack/provider can be added without rewriting the Handymate product shell or invoice/project domains.

### 35.13 Final product rule

> **Handymate is the platform. Financial Kernel is the economic infrastructure. Pay is an embedded money-movement capability with an operational admin surface. Ledger is an entitlement-based accounting module inside the same platform.**

Do not build a second finance product beside Handymate. Build financial depth into the system that already knows why the economic event exists.

---

## 36. Swedish statutory bookkeeping requirements

> Source of these requirements: review finding F8. They are stated concretely here because
> "audit trail" and "archiving" as generic goals are how a team discovers a hard requirement
> during a pilot instead of during design. Cheap now, expensive to retrofit.

The bookkeeping obligation remains with the customer (roadmap §3). Handymate's obligation is to
be a system in which the customer *can* comply. The following are design constraints, not
features to be prioritized later.

### 36.1 Voucher identification and sequence

Every posted entry must carry a voucher identification that lets the connection between the
voucher, the source document and the bookkeeping be established without effort, in an unbroken
series. Consequences:

- Voucher numbers are allocated by the ledger, atomically, per journal series and fiscal year —
  never by an application caller and never optimistically in JavaScript.
- A gap in a series is a defect, not an inconvenience. A failed posting must not consume a number,
  or if it does, the consumption must itself be recorded and explainable.
- A reversal is a new voucher referencing the original (§13), never a reuse or a rewrite.

### 36.2 Retention, readability and system documentation

- Räkenskapsinformation must be retained until the seventh year after the end of the calendar
  year in which the fiscal year ended. This is a **data lifecycle requirement that outlives the
  customer's subscription** — it must be reflected in the deletion, export and offboarding design,
  and it interacts with the account-deletion paths that already exist in the product.
- The information must be presentable in readable form. SIE export (§15.4) is part of this answer
  but is not the whole of it — source documents (receipts, supplier invoices, invoice PDFs) must
  remain retrievable and linked to their vouchers.
- **System documentation and processing history are a named obligation**, not internal
  engineering notes. The system must be able to describe how a posting came to exist, including
  posting rule and version, AI involvement and approval provenance (§14). The provenance model
  already specified is the right shape; this section makes it a compliance requirement, so it
  cannot be deprioritized as a nice-to-have.

### 36.3 Reverse-charge construction VAT

Statutory consequences beyond the posting itself (see §15.1 for the model):

- The invoice document must carry a reference indicating reverse charge.
- The determination depends on the buyer's status, which must be recorded with evidence and a
  date — a customer's status can change.

### 36.4 Accounting method

Cash basis (kontantmetoden) is available below the statutory net-sales threshold and requires a
year-end booking of unpaid documents. See §15.2. The threshold, and the consequences of a company
crossing it mid-year, require confirmation by the accounting consultant.

### 36.5 Adjacent but out of scope

Personalliggare/ID06 is a statutory obligation for the construction sector but is not accounting.
Noted here only so that it is not mistaken for a Financial Kernel responsibility.

### 36.6 Rule for models

Nothing in this section is a substitute for professional review. Where an implementation needs a
threshold, an account number or a filing rule, the model **flags it for the accounting consultant
and blocks** rather than choosing a plausible value. Presenting a model's assumption as an
accounting decision is the one failure this whole architecture is designed to prevent.

---

## 37. Receivables lifecycle beyond settlement

The current documents model a receivable as something that is created and then settled. Real
receivables in this segment have more states, and each has an accounting treatment that must be
defined **before the Ledger becomes canonical** (it is not required for beta).

```text
issued -> overdue -> reminded -> interest charged -> collection -> written off
                  \
                   -> sold (factoring)
```

Required treatments:

- **Påminnelseavgift and dröjsmålsränta.** These already exist as invoice rows with `vat_rate 0`
  in `lib/invoices/fortnox-rows.ts` — the comment there records that they were previously posted
  incorrectly. They need their own revenue accounts and an explicit VAT treatment, and interest
  accrues over time rather than at a point, which interacts with period boundaries (§26).
- **Debt collection / Kronofogden handoff.** Who owns the receivable during collection, and what
  happens to the ledger when a collection agency remits a net amount after its fee.
- **Bad debt write-off.** Including the VAT consequence, which is not symmetric with the original
  posting and differs between accounting methods (§15.2).
- **Factoring / fakturaköp.** Common in trades and structurally significant: the receivable is
  sold, so Handymate's AR must be able to stop representing a claim on the customer while the
  invoice remains commercially visible to the user. If the receivable model cannot express a
  change of owner, this cannot be added later without a migration.

---

## 38. Open decisions — owner's call, not the implementer's

These are commercial or strategic judgements. A model that encounters one **states the blocker
and stops**; it does not resolve it by choosing the convenient answer. Record the resolution here
and in the `STRATEGY_INDEX.md` decision log when it is made.

### 38.1 Merchant-of-record model for Handymate Pay — D1

Merchant-of-record vs. platform vs. marketplace payout. Decides who holds customer money, who
owns the receivable at each moment, what the clearing account means, who carries chargeback and
refund liability, and how Handymate's own fee is invoiced and VAT-treated.

*Recommendation:* decide before the first posting rule is written (Sprint −1). It is a ledger
semantic wearing an integration costume.

**Status: open.**

### 38.2 Sprint order — Pay before Ledger, or Ledger before Pay — D2

*Recommendation:* swap, running Ledger first. Ledger has no regulated counterparty, no KYC and no
customer money at risk; a failure is a wrong number in a report rather than a wrong movement of
cash. It also delivers the moat directly — true realized margin per project. Pay has the longest
external lead time and the largest blast radius, so it is better run as a parallel commercial
procurement track than as a sequential coding sprint.

*Counter-argument the review cannot weigh:* a Pay launch may be worth more to pricing,
positioning or a funding conversation than a correct ledger.

**Status: open.** §28 keeps the original order until this is decided.

### 38.3 Does Handymate file the momsdeklaration, or only produce it? — D3

Producing correct VAT figures and filing a return are different products with different liability,
and the customer's perception of "Handymate replaced Fortnox" is anchored on the second.

*Recommendation:* decide explicitly. Do not let it default to produce-only by omission.

**Status: open.**

### 38.4 Cut-over fiscal-year boundary for the first pilots — D4

Drives §18.4. Needed before the first pilot business is selected, because it constrains which
businesses can be pilots at all.

**Status: open.**

---

## 39. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-11 | Original blueprint. | — |
| 2026-09-11 | Added §5 rounding rules, §15.1–15.4 (reverse-charge VAT, cash basis, VAT return, SIE timing), §18.3–18.5 (tolerance removal, opening balances, automation semantics), §20.1 (shadow phase S1/S2), golden paths 31–40, Sprint −1, §36 statutory requirements, §37 receivables lifecycle, §38 open decisions; extended §29–§31. | Review F1–F14, `FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md` |

---

## 40. AI-native Accounting Outcome Delivery Contract

This section is a **binding product-architecture rule** for Handymate Accounting. The target system is not a bookkeeping UI where AI prepares suggestions and a human permanently reviews every transaction. The target is verified financial outcomes delivered from operational truth, with human review reserved for exceptions that require judgment or elevated risk handling.

### 40.1 Outcome, not tool usage, is the product target

The desired customer experience is increasingly:

```text
Books current                 ✓
Bank reconciled               ✓
Supplier invoices booked      ✓
Customer payments matched     ✓
VAT prepared                  ✓
Needs review                  2 items
```

not:

```text
Here are 87 AI-generated bookkeeping suggestions.
Please approve them one by one.
```

Detailed journals, vouchers and accounting controls remain available to accountants and auditors, but routine customers should consume **completed outcomes and exceptions**, not bookkeeping work queues.

### 40.2 Delivery architecture

The accounting delivery loop is:

```text
Operational truth
(project/customer/quote/time/material/invoice/supplier/payment)
        |
        v
Financial Kernel
        |
        v
Deterministic Ledger rules + bounded AI classification
        |
        v
Rulebook / Country Pack / company policy
        |
        v
Reconciliation + Financial Integrity Engine
        |
        +-------------------------+
        |                         |
        v                         v
verified, within policy       exception / uncertainty / high risk
        |                         |
        |                         v
        |                    human review
        |                         |
        +-------------+-----------+
                      v
              completed financial outcome
                      |
                      v
                Karin / Economy UI
```

Human review is therefore a first-class safety path, but it must not become an implicit permanent dependency for all transactions.

### 40.3 The rulebook is durable product infrastructure

For Accounting, the "rulebook" is not a prompt file. It is the combined, versioned body of evidence that defines what correct means:

- Global Ledger invariants;
- country-pack rules;
- company accounting policy;
- posting-rule versions;
- Golden Paths;
- regression tests;
- shadow/integrity comparison rules;
- documented exception resolutions;
- professional accounting decisions and provenance;
- confidence and approval policies.

A material real-world mistake or divergence should, where appropriate, become a durable addition to this rulebook rather than a one-off manual fix.

### 40.4 Exception-to-automation flywheel

The intended learning loop is:

```text
new real-world exception
  -> classify root cause
  -> obtain professional/domain decision where needed
  -> update rule/policy
  -> add regression/Golden Path/integrity check
  -> replay or re-verify affected cases
  -> future equivalent cases auto-handle when policy allows
```

The metric to optimize is **not maximum autonomy at any cost**. It is safe growth in the proportion of financial work that can be completed without human intervention while correctness, traceability and customer accountability remain intact.

Track at minimum:

```text
straight-through processing rate
human-review rate
exception rate by category
false-auto-post rate
false-review / unnecessary-escalation rate
repeat-divergence rate
mean time to resolve exception
percentage of resolved exceptions converted into durable tests/rules
```

### 40.5 Model capability is replaceable; correctness history is not

Do not make the moat depend on a specific foundation model.

The durable financial moat is:

```text
Handymate operational context
+ Financial Kernel history
+ trades-specific country/domain rules
+ real edge cases
+ professional decisions
+ shadow divergences
+ regression corpus
+ outcome feedback
```

A model/provider can be swapped or improved underneath this system. The accumulated definition of correctness must remain Handymate-owned and portable across model runtimes.

### 40.6 Review-layer scaling rule

A managed or human-assisted Accounting offering is allowed and may be strategically valuable, but its economics must improve with automation rather than scale linearly with headcount.

Therefore:

- low-confidence, novel, regulated/high-risk or policy-required cases may require human review;
- reviewers should receive a bounded exception with evidence, not reconstruct the entire transaction manually;
- the resolution must feed the rulebook where generalizable;
- operational dashboards must distinguish straight-through work from reviewed work;
- no implementation may claim "autonomous accounting" while silently routing all transactions through human approval.

### 40.7 Relationship to shadow and integrity architecture

`FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md` is the first concrete implementation of this learning model. During migration it asks whether Handymate agrees with an independent reference; after Fortnox cut-over the same machinery evolves into a permanent Financial Integrity Engine that asks whether Ledger, bank, payments, receivables, payables, VAT and source documents agree with each other.

Every meaningful divergence should be treated as both:

1. a current correctness issue to resolve, and
2. potential training material for the deterministic rulebook/regression corpus.

### 40.8 Final outcome-delivery rule

> **Handymate Accounting should increasingly sell and deliver "the financial work is done and verified", not "here is software that helps you do the financial work". Agents and deterministic systems perform the routine work; humans review exceptions; the rulebook grows from every verified edge case.**
