# Handymate Financial Kernel — Pay + Ledger Architecture

> Status: Implementation blueprint / pre-build architecture
> Date: 2026-09-11
> Scope: Handymate Pay, Handymate Ledger, reconciliation, financial events, Fortnox shadow mode and migration from the current invoice/payment model.
> Strategic context: `docs/HANDYMATE_ACCOUNTING_ROADMAP.md` and `docs/HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md`.

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
ROT/RUT accounting
SIE
Swedish report conventions
local rounding/tax rules
```

Do not hard-code `1510`, `1930`, `2611` etc. into generic Pay code.

A provider payment event asks the country/posting layer which accounts apply.

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

### Phase A — compatibility projection

Keep current fields:

```text
invoice.status
invoice.paid_amount
invoice.paid_at
invoice.settled_at
invoice.paid_via
```

But once the kernel is enabled, treat them as **compatibility projections** from receivable/payment allocation state.

### Evolve `applyInvoicePayment()`

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

### Later

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

### Accounting shadowing

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
- VAT reporting primitives.

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
- SE account/VAT mapping.
- Customer invoice posting.
- Customer payment/clearing posting.
- Supplier invoice/AP posting.
- Basic P&L/balance/general ledger.
- SIE export target before broad migration.
- Audit/system documentation.
- Golden-path E2E suite.
- Fortnox shadow validation for pilot companies.

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
- launch auto-posting broadly before shadow comparison and professional review.

---

## 32. Existing-file integration checklist

| Existing path | Keep | Change during kernel migration |
|---|---|---|
| `lib/invoices/create-invoice.ts` | Yes | emit durable `invoice_issued/receivable_created` transactionally or via safe outbox path; retain legacy event bridge |
| `app/api/invoices/route.ts` | Yes | consume Money helpers gradually; no direct Ledger writes |
| `lib/invoices/apply-payment.ts` | Yes, initially | become compatibility facade over payment + allocation + invoice projection |
| `lib/invoices/payment-decision.ts` | Concepts yes | move toward receivable-component/allocation rules; remove aggregate-only assumptions over time |
| `app/api/invoices/[id]/mark-paid/route.ts` | Yes | manual payment becomes explicit financial command/event |
| `lib/fortnox/sync-payments.ts` | Yes | shift from source-of-truth importer to reference/shadow adapter per rollout phase |
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
