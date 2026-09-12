# Handymate Accounting — Strategy, Architecture & Roadmap

> Status: Strategic roadmap / post-launch initiative
> Goal: Make Handymate capable of running the complete financial back office for its target customers, eventually removing the need for Fortnox/Bokio-class external accounting software.

## 1. Strategic thesis

Handymate should not build a generic Fortnox clone. The stronger opportunity is to build **Handymate Accounting / Handymate Ledger** as the financial layer of the operating system Handymate already owns.

Handymate has an inherent advantage over a standalone accounting system because it knows the business event before it becomes an accounting event:

`lead -> quote -> signed job -> project -> time -> material -> invoice -> ROT/RUT -> payment -> accounting -> profitability`

The long-term product promise becomes:

> **Run the entire company in Handymate.**

Accounting should therefore be an extension of the operational data model, not a separate bookkeeping application bolted onto the product.

## 2. Product objective

The initial objective is **not full feature parity with every Fortnox module**. It is to make Fortnox unnecessary for the large majority of Handymate's core customers.

Target end-state for a typical small trade/service company:

- CRM and customer history
- Leads and sales pipeline
- Quotes and signatures
- Projects and scheduling
- Time reporting
- Materials and supplier costs
- Customer invoicing
- ROT/RUT
- Payments and reminders
- Bank reconciliation
- Receipts and supplier invoices
- Bookkeeping and VAT
- Financial reporting
- Payroll/employee administration
- Year-end/accountant workflow

External accounting/revision partners remain possible without requiring a separate operational system.

### 2.1 Target operating model: finished financial outcomes

Handymate Accounting is **not primarily a bookkeeping tool**. Its target state is a software-operated accounting service: financial work is completed automatically from operational truth, verified by deterministic rules and integrity checks, and escalated to humans only when an exception requires judgment.

The customer should increasingly experience outcomes such as:

```text
Books are current
Bank is reconciled
VAT is prepared correctly
Supplier invoices are booked
Customer payments are matched
Two exceptions require review
```

—not a queue of bookkeeping tasks they must perform themselves.

The operating model is:

```text
INTAKE
Operational truth already exists in Handymate
(project, customer, quote, time, material, invoice, supplier, payment)
        |
        v
ENGINE
Financial Kernel + Ledger + agents/classifiers
        |
        v
RULEBOOK
Country pack + posting rules + company policy + Golden Paths
        |
        v
VERIFICATION
Reconciliation + Financial Integrity Engine + shadow comparisons
        |
        +--------------------+
        |                    |
        v                    v
high-confidence           exception / judgment
verified outcome          -> human review
        |                    |
        +---------+----------+
                  v
DELIVERY
Karin + Economy surfaces report the completed outcome and remaining exceptions
```

This model creates an important product constraint: **human review is an exception path, not the normal delivery path.** High-risk work can and should require review until confidence is earned, but the architecture must not assume that a human will permanently inspect every transaction after automation runs. Otherwise Handymate becomes a traditional accounting service with better internal tools rather than a scalable AI-native service.

The review percentage should shrink through learning:

```text
real exception
  -> domain analysis
  -> rulebook/posting-policy improvement
  -> Golden Path or regression test
  -> integrity/shadow check
  -> future equivalent cases handled automatically when safe
```

The model provider is not the accounting moat. The moat is the accumulated definition of **what correct means for trades businesses**: country-pack rules, real edge cases, posting-rule versions, shadow divergences, resolved exceptions, regression tests, operational context and outcome history.

This does not remove accountability. The opposite is required: every automated financial outcome must remain explainable, auditable and reversible through the explicit controls defined in the Financial Kernel architecture.

## 3. Important legal/product distinction

A bookkeeping system is not made valid because an auditor approves the software. The system and the customer's use of it must comply with applicable bookkeeping legislation and generally accepted accounting principles.

The bookkeeping obligation ultimately remains with the bookkeeping entity/customer.

Separate three concepts in product design and commercial agreements:

1. **Accounting software** — Handymate provides the ledger and workflows.
2. **Accounting services** — an accounting consultant/partner can review, correct and perform closing work.
3. **Audit** — where required or desired, an independent qualified auditor reviews the company/accounts.

An auditor is valuable as a control and auditability domain expert, but practical implementation should ideally also be reviewed by an experienced operational accounting consultant/bookkeeper, especially for VAT, closing, payroll and edge cases.

## 4. Architecture principle: Global Ledger + Country Packs

Do not hard-code Swedish accounting semantics into the ledger core.

Build a country-neutral **Handymate Global Ledger** and isolate jurisdiction-specific behavior into country packs.

Example structure:

```text
accounting/
  core/
    accounts
    fiscal-years
    journals
    journal-entries
    journal-lines
    documents
    counterparties
    reconciliation
    reporting
    audit

  country-packs/
    SE/
      chart-of-accounts
      vat
      rot-rut
      sie
      reporting
      tax-rules
    NO/
    DK/
    FI/
    DE/
    UK/
```

The core should understand concepts such as:

- Account
- Fiscal year
- Accounting period
- Journal
- Journal entry
- Journal line
- Debit / credit
- Tax/VAT code
- Currency
- Counterparty
- Source document
- Reconciliation
- Audit event

Country packs define local account conventions, tax treatment, reporting/export formats and regulatory behavior.

This architecture is strategically important for international expansion: expansion should become closer to **adding a country accounting pack** than rebuilding the finance stack or integrating a new local Fortnox equivalent in every market.

## 5. Core accounting invariants

The accounting engine should be deterministic wherever possible. AI assists classification and exception handling; AI should not replace ledger invariants.

Fundamental invariant:

```text
SUM(debit) == SUM(credit)
```

Core requirements:

- Double-entry ledger
- Immutable/append-oriented posted journal history
- Explicit correction/reversal flows instead of silent mutation
- Sequential and traceable voucher/journal numbering where required
- Fiscal years and periods
- Period locking
- Complete audit trail
- Source-document linkage
- Reproducible posting rules
- Idempotent event handling
- Strong tenant isolation by `business_id`
- Export capability to prevent customer lock-in
- Document retention/archiving support
- System documentation and processing history

## 6. Suggested domain model

Exact schema must be designed against the existing Handymate schema before implementation, but likely core entities include:

```text
accounting_accounts
accounting_fiscal_years
accounting_periods
accounting_journals
accounting_entries
accounting_entry_lines
accounting_documents
accounting_posting_rules
accounting_reconciliations
accounting_audit_events
suppliers
supplier_invoices
bank_accounts
bank_transactions
```

Every posted entry should retain enough provenance to answer:

- What business event caused this entry?
- Which source document supports it?
- Which rule/version produced it?
- Was AI involved?
- What confidence did the classifier have?
- Was human approval required?
- Who/what approved it?
- When was it posted?
- Has it subsequently been corrected/reversed?

Example provenance metadata:

```json
{
  "source": "supplier_invoice",
  "source_id": "...",
  "posting_rule": "construction_material_purchase",
  "posting_rule_version": 3,
  "classifier": "karin",
  "confidence": 0.97,
  "approval_mode": "automatic",
  "posted_at": "..."
}
```

## 7. Event-driven accounting

Accounting should consume the existing Handymate event model rather than duplicate operational workflows.

Examples:

```text
invoice_created
  -> create customer receivable posting

payment_received
  -> settle receivable / post bank movement

supplier_invoice_approved
  -> create payable + expense/asset + VAT posting

supplier_payment_received/confirmed
  -> settle payable
```

Example customer invoice posting (account numbers are Swedish examples and belong in the SE pack):

```text
Debit   1510 Accounts receivable
Credit  30xx Revenue
Credit  2611 Output VAT
```

Payment:

```text
Debit   1930 Bank
Credit  1510 Accounts receivable
```

The important architectural rule is that operational events are the source and accounting postings are deterministic consequences whenever the accounting treatment is known.

## 8. AI accounting model

Use AI primarily for ambiguity and exception resolution.

Good AI tasks:

- Receipt/document extraction
- Supplier identification
- Expense categorization
- Account suggestions
- VAT treatment suggestions
- Duplicate detection
- Anomaly detection
- Reconciliation suggestions
- Explaining financial results in natural language

Avoid letting AI freely create unvalidated ledger structures.

Recommended confidence model:

```text
High confidence + deterministic validation -> auto-post according to company policy
Medium confidence -> approval queue
Low confidence / unusual transaction -> accounting expert or customer review
```

All AI decisions affecting accounting must remain traceable.

## 9. Bank and reconciliation

Bank integration is a major milestone toward replacing Fortnox.

Required capabilities:

- Import/feed bank transactions
- Match incoming payments against invoices
- Match outgoing payments against supplier invoices
- Match card transactions against receipts
- Split transactions
- Handle fees/rounding/differences
- Reconciliation state per bank account/period
- Exception queue

Target UX:

> "Karin has reconciled 47 of 49 transactions. Two require your approval."

The customer should interact with exceptions, not perform bookkeeping line-by-line.

## 10. Sweden country pack — initial scope

The Swedish pack should eventually cover at minimum the list below. The authoritative and more
detailed scope is `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md` §15 and §36; this list is a
summary and must not be treated as complete on its own.

- BAS-compatible chart of accounts
- Swedish VAT codes and reporting
- **VAT regime per invoice: standard, reverse-charge construction (omvänd skattskyldighet för
  byggtjänster), exempt** — a large share of B2B volume in this segment, not an edge case
- **Accounting method: accrual and cash basis (kontantmetoden)** — cash basis is the default for
  most companies in the target segment
- ROT/RUT accounting behavior
- SIE import/export — **needed before the first pilot, not before broad migration**
- Swedish customer/supplier accounting conventions
- Financial year/period handling
- Required system documentation/auditability
- Balance sheet
- Income statement
- General ledger
- VAT report support
- Year-end/accountant export/review workflows

Later:

- Payroll
- Employer reporting/AGI workflows
- Vacation/sick pay
- Benefits
- Mileage/travel allowances
- Pension-related workflows where applicable
- Closing/year-end functionality

Payroll should be treated as a separate high-risk domain rather than casually added to the initial ledger release.

## 11. Shadow Accounting — migration and verification strategy

Do **not** immediately remove Fortnox after implementing the ledger.

Use the existing Fortnox integration as a temporary reference implementation.

For pilot companies:

```text
Operational event
       |
       +--> Handymate Ledger
       |
       +--> Fortnox

Handymate Verification Engine
       |
       +--> compare journals/accounts/VAT/AR/AP/balances
```

Automatically compare:

- Journal entries
- Account balances
- Customer receivables
- Supplier payables
- VAT totals
- Bank balances/reconciliation
- Period totals

Any mismatch generates an explicit event/alert, e.g.:

```text
ACCOUNTING_DIVERGENCE
```

Every discovered divergence becomes:

1. Domain analysis
2. Posting-rule correction if needed
3. Regression test
4. Historical replay where appropriate

This creates a real-world accounting test corpus using actual customer activity.

Only migrate customers to Handymate-only accounting after sustained verification and professional review.

## 12. Testing strategy

Accounting requires a substantially higher correctness bar than ordinary UI features.

Tests should include:

- Unit tests for every posting rule
- Property/invariant tests (`debit == credit`)
- Idempotency tests
- Reversal/correction tests
- Period locking tests
- VAT scenario tests
- ROT/RUT scenarios
- Credit notes
- Partial payments
- Overpayments
- Refunds
- Bad debt scenarios
- Supplier credits
- Duplicate invoices/documents
- Multi-period transactions
- Year boundaries
- Rounding
- Bank fees
- Historical replay
- Shadow comparison against Fortnox

Accounting bugs found in production should almost always result in a permanent regression test.

## 13. Human domain experts

Use available auditor/accounting expertise early.

Recommended responsibilities:

### Auditor / audit expert
- Audit trail requirements
- Manipulation resistance
- Internal controls
- Evidence/source-document requirements
- Traceability
- Review of system documentation
- Auditability of AI decisions

### Operational accounting consultant
- Day-to-day posting rules
- VAT edge cases
- Supplier/customer accounting
- Credit notes/refunds
- Closing workflows
- Practical bookkeeping exceptions
- Payroll/employee accounting when that phase begins

AI coding agents implement and test rules; humans define and validate accounting truth.

## 14. Development model with Codex + Claude

Suggested parallel workstreams after launch:

### Workstream A — Accounting Engine
- Ledger schema
- Posting engine
- Fiscal years/periods
- Journals
- Audit trail
- Reversals/corrections
- Reporting primitives

### Workstream B — Financial Operations
- Supplier invoices
- Documents/receipts
- Bank transactions
- Reconciliation
- AR/AP
- VAT
- SIE

### Workstream C — Product + Domain QA
- Accounting specification
- Edge-case matrix
- Regulatory/system documentation
- Architecture review
- Test generation
- Fortnox comparison analysis

Do not measure progress primarily by code volume. The bottleneck will eventually be accounting correctness, integrations, domain edge cases and verification.

## 15. Indicative roadmap

Assuming the core product is launched/stable and Accounting becomes a major prioritized initiative:

### Weeks 1–3 — Ledger foundation
- Data model
- Accounts/chart support
- Double-entry posting engine
- Journals/vouchers
- Fiscal periods
- Audit trail
- Posting rule framework

### Weeks 4–6 — Accounting Core
- Swedish country pack foundation
- VAT
- AR/AP foundations
- Balance sheet / income statement / general ledger
- SIE import/export
- Correction/reversal flows

### Weeks 6–10 — Autonomous bookkeeping
- Supplier invoices
- Receipt/document extraction
- AI categorization
- Bank feed/import
- Matching
- Reconciliation
- Approval/exception queues

### Weeks 10–14 — Production-quality beta
- Edge cases
- Accountant/reviewer portal
- System documentation
- Strong regression suite
- Shadow Accounting against Fortnox

### Months 3–4 — Handymate-only pilot
A small number of carefully selected companies may become candidates for operating without Fortnox after professional review and successful shadow validation.

### Months 4–6 — Broader migration readiness
Goal: sufficient operational history, reliability and domain validation to confidently migrate a larger share of the target customer base.

### Months 6+ — Payroll and deeper financial OS
- Payroll
- Employee financial workflows
- Closing improvements
- Tax/reporting integrations
- Additional country packs

These are planning estimates, not launch commitments. Coding may be substantially faster than the validation period required to responsibly replace a customer's accounting system.

## 16. Product prioritization after launch

Do not automatically make Accounting the first large initiative immediately after launch.

First optimize for:

```text
PMF -> retention -> active customers -> transaction volume -> accounting expansion
```

The existing Fortnox integration provides a valuable bridge while Handymate gathers real operational data.

A meaningful base of active companies will reveal exactly which Fortnox capabilities the target segment actually uses. Handymate should build the relevant subset extremely well rather than blindly reproducing an entire horizontal accounting suite.

## 17. Pricing implications

When Handymate genuinely replaces separate accounting software, pricing should increase.

Do **not** frame the increase merely as "we added bookkeeping". The value proposition changes from an AI administration tool to an integrated business operating system that can eliminate additional software subscriptions and manual accounting work.

Recommended commercial direction:

- Keep an entry tier that reduces adoption friction.
- Put autonomous accounting/full financial operations in a higher tier or add-on.
- Price primarily against **total customer value and replaced software/labor**, not Handymate's infrastructure cost.
- Consider including a limited accounting core in the standard product while reserving autonomous reconciliation, supplier accounting, payroll and professional review for higher tiers.
- Avoid bundling unlimited human accounting/revision work into a low fixed SaaS fee; professional services should have clear scope/economics.

Possible future positioning (exact prices require market/customer validation):

```text
Handymate Core
  Operational AI / CRM / quote / project / invoice

Handymate Business
  + Accounting / bank / supplier invoices / reconciliation / VAT

Handymate Complete
  + Payroll / deeper financial automation / advanced controls

Professional Accounting/Review
  Separate partner/service layer as required
```

The pricing ceiling should rise materially once a customer can cancel other systems and reduce recurring accounting administration. Validate willingness-to-pay with real customers before locking the final packaging.

## 18. Strategic moat

The long-term moat is not the ledger itself. Double-entry accounting is commoditized logic.

The moat is the unified dataset and automation loop:

```text
Lead acquisition
    -> conversion
    -> quote assumptions
    -> actual labor
    -> actual material
    -> invoice
    -> payment behavior
    -> accounting
    -> realized margin
    -> pricing recommendation
    -> next quote
```

This allows Handymate to understand *why* the company makes or loses money, not merely record that it happened.

A second layer of moat is the **accounting rulebook** accumulated from real usage: every verified exception, shadow divergence, country-pack correction and regression test increases Handymate's ability to deliver correct financial outcomes without proportional human review. A competitor can access similar foundation models; it cannot instantly reproduce years of trades-specific correctness history.

Future examples:

- Detect that bathroom projects have lower margins than service work.
- Detect supplier price inflation.
- Recommend material markup changes.
- Identify customers/job types with slow payment behavior.
- Forecast cash flow from the live pipeline.
- Adjust quoting guidance based on realized historical margin.

This closes the loop between operations and finance in a way standalone accounting software cannot easily reproduce.

## 19. Long-term vision

Evolution:

```text
Phase 1: Handymate automates administration
Phase 2: Handymate becomes the operational system of record
Phase 3: Handymate becomes the financial system of record
Phase 4: Handymate becomes the company's operating system
Phase 5: Country packs enable international rollout
```

The desired customer experience is eventually:

> **You need Handymate. The rest is included.**

Fortnox then becomes primarily a migration source/legacy integration rather than a permanent dependency.

## 20. Immediate next actions

After the current launch and once prioritization allows:

1. Validate demand and willingness-to-pay with active customers.
2. Map exactly which Fortnox modules/features Handymate customers actually use.
3. Run a domain workshop with the auditor plus an operational accounting consultant.
4. Produce the formal Accounting Core specification and threat/control model.
5. Design the Global Ledger schema and SE Country Pack boundaries.
6. Implement Accounting Core behind feature flags.
7. Build comprehensive deterministic tests before enabling auto-posting.
8. Introduce Shadow Accounting for selected customers.
9. Measure divergence and build a regression corpus.
10. Launch a controlled Handymate Accounting beta.
11. Migrate a small number of professionally reviewed pilot customers.
12. Only then begin broad Fortnox replacement messaging.

---

### Guiding principle

**Do not build a better place to manually do bookkeeping. Build a system where bookkeeping is the verified financial consequence of work Handymate already understands — and where the customer increasingly receives a finished financial outcome instead of another workflow to operate.**
