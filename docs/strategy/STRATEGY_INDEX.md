# Handymate Strategy Index

> Purpose: Persistent strategic memory for Handymate. Important strategic conversations, architecture conclusions and sequencing decisions should be summarized into this repository so future Codex/Claude sessions can build from the same long-term thesis.

## Canonical product / strategy documents

### Financial OS

- [`../HANDYMATE_ACCOUNTING_ROADMAP.md`](../HANDYMATE_ACCOUNTING_ROADMAP.md) — strategic roadmap for replacing Fortnox/Bokio-class accounting for Handymate's core customer segment, including Global Ledger, country packs, shadow accounting, rollout and pricing implications.
- [`../HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md`](../HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md) — vertical expansion thesis: Pay, Supply/Procurement, Payroll, Capital, Fleet, Insurance, People/Capacity Network and Marketplace.
- [`FINANCIAL_KERNEL_ARCHITECTURE.md`](FINANCIAL_KERNEL_ARCHITECTURE.md) — implementation blueprint tying Handymate Pay and Ledger together with durable financial events, payments, allocations, reconciliation, posting engine, Fortnox shadow mode and migration from current invoice/payment code.
- [`FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md`](FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md) — normative companion to the architecture's §20: automated shadow verification, the S1/S2 evidence split, divergence lifecycle, migration-readiness gate and the permanent Financial Integrity Engine. **§21 records which comparison levels are reachable with the current Fortnox OAuth grant — only Level 1 — and what the rest would cost.**
- [`FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md`](FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md) — execution contract for how Codex and Claude divide, implement, review and merge Financial Kernel work. Mandatory reading for implementation agents.
- [`FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md`](FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md) — permanent adversarial review record (2026-09-11). Its accepted findings are already normative in the two documents above; it preserves the reasoning so a constraint is not silently reversed. **Implementation agents do not need to read it.**

### Business / platform strategy

- [`BUSINESS_TWIN_VISION.md`](BUSINESS_TWIN_VISION.md) — Business Twin vision.
- [`BUSINESS_TWIN_IDEA_BACKLOG.md`](BUSINESS_TWIN_IDEA_BACKLOG.md) — strategic idea backlog around Business Twin.
- [`PRICING_STRATEGY.md`](PRICING_STRATEGY.md) — pricing strategy.
- [`EXIT_SCENARIOS.md`](EXIT_SCENARIOS.md) — long-term exit scenarios.
- [`../storfirman-product-strategy.md`](../storfirman-product-strategy.md) — larger-company product strategy.

### Execution roadmaps

- [`../roadmap/POST_REALITY_LAUNCH_VALUE_WAVE.md`](../roadmap/POST_REALITY_LAUNCH_VALUE_WAVE.md)
- [`../roadmap/BRAIN_VISIBILITY_WEEKEND.md`](../roadmap/BRAIN_VISIBILITY_WEEKEND.md)

## Current long-term thesis

Handymate should evolve approximately as follows:

```text
AI administration
  -> operational system of record
  -> financial system of record
  -> embedded financial/services platform
  -> supply + demand network
  -> operating system for the trades
```

The expansion test is not "can we add this feature?" but:

> **Does Handymate already own, or naturally deserve to own, the data and workflow behind something the customer currently pays another vendor to do?**

### AI-native outcome delivery

Handymate should not stop at giving trades companies better AI tools. Over time the platform should increasingly **deliver finished business outcomes**, with agents and deterministic systems doing the work and humans reviewing only the exceptions that genuinely require judgment.

```text
Traditional SaaS
  customer receives a tool
  -> customer or external firm still performs the work

Handymate target state
  operational truth enters Handymate
  -> agents + deterministic engines execute the workflow
  -> rulebooks/integrity checks verify the result
  -> exceptions are escalated
  -> customer receives the finished outcome
```

This is a product and operating-model principle, not a mandate to disguise manual services as software. The system must deliberately collapse the service overhead as it matures: structured intake, explicit scope, machine-readable rules, confidence/risk gates, exception review and visible delivery state.

The model provider is not the moat. The durable moat is the combination of:

- proprietary operational context;
- domain rulebooks defining what "correct" means;
- real customer edge cases;
- Golden Paths and regression tests;
- shadow/integrity divergences and their resolutions;
- accumulated automation policies and outcome history.

Every material production mistake that teaches Handymate a new domain rule should, where appropriate, become a permanent rule, test or integrity check. The desired long-term effect is that the human-review percentage falls as the rulebook grows while accountability and auditability increase.

High-priority adjacent vertical order currently:

```text
Core / PMF
   -> Accounting + Pay (parallel, shared Financial Kernel)
   -> Procurement / Supply
   -> Payroll / People
   -> Capital
   -> Fleet / Insurance
   -> Capacity / Recruiting Network
   -> Marketplace
```

This order is directional rather than a fixed launch commitment. Real customer demand, retention data and unit economics after launch decide actual prioritization.

### Note on the breadth of that order

The order above is broad by design, and that is in **mild tension** with the case for
AI-native service delivery below, which argues that the defensible asset is depth in one
narrow rulebook. Handymate's answer is that the shared operational dataset makes each new
vertical cheaper than a standalone specialist's. That is a bet, not a settled conclusion:
each vertical still needs its own rulebook at full depth. Do not cite the AI-native
services thesis as support for the breadth — it argues the opposite.

## Product principle — the boundary on outcome delivery

> Adopted 2026-09-12. The direction is stated under **AI-native outcome delivery** above.
> This is the clause that makes it usable, and it is the half that gets dropped when the
> principle is quoted.

**Handymate delivers finished business outcomes where the outcome is verifiable and the
obligation stays with the customer. Where the obligation would move to Handymate, that is
a separate, regulated service line with its own economics and its own liability — never a
tier in the SaaS price list.**

Without the second sentence the principle approves everything.

Two further limits, both written out in full in `FINANCIAL_KERNEL_ARCHITECTURE.md` §40:

- **The review share is a measured number, not a direction.** Earned autonomy today covers
  four action types behind a hardcoded allowlist after a 15-approval streak. Any claim about
  an automation share must name the measured figure and the date.
- **Marginal cost is metered, not zero.** The existing cost guard produces a real
  per-business COGS figure. Price against it.

Read §39, §40 and `../HANDYMATE_ACCOUNTING_ROADMAP.md` §17.1 and §21 before quoting the
ambition anywhere customer-facing.

## Architectural rule for financial expansion

Pay and Ledger are not independent integrations. They share the **Handymate Financial Kernel**:

```text
Money
Financial Events
Payments
Allocations
Receivables / Payables
Reconciliation
Ledger
Audit
```

Future Procurement, Payroll, Cards, Capital, Insurance and Marketplace functionality should reuse this same economic spine.

## Documentation convention going forward

When a strategic conversation produces a durable conclusion:

1. Put product/market thesis in `docs/strategy/` or the relevant existing strategy document.
2. Put implementation-ready architecture in a dedicated architecture/spec document.
3. Put dated execution plans in `docs/roadmap/`.
4. Update this index when a new major strategic document is added.
5. Do not treat strategy documents as replacements for `handymate-dashboard/ARCHITECTURE.md`; implementation-level event names, schema contracts and mandatory runtime assumptions must still be added to the canonical architecture file before code is implemented, per its own rules.
6. Prefer updating an existing canonical document over creating multiple overlapping documents for the same decision area.

## Decision log — Financial OS

### 2026-09-11 — Build Accounting as Handymate's financial layer, not a Fortnox clone

Goal: make external accounting software unnecessary for the majority of Handymate's core customers while retaining export/data portability.

### 2026-09-11 — Global Ledger + Country Packs

Keep double-entry ledger, money/event primitives and reconciliation global; isolate BAS/VAT/ROT/RUT/SIE and future country-specific rules in country packs.

### 2026-09-11 — Pay is the highest-adjacency vertical next to Accounting

Build Pay in parallel with Ledger rather than after Accounting is completely finished.

### 2026-09-11 — Financial Kernel is shared infrastructure

Pay owns money movement, Ledger owns accounting interpretation, Reconciliation proves agreement, and durable financial events connect the domains.

### 2026-09-11 — Use regulated payment/banking partners initially

Handymate owns UX, domain model, automation and customer relationship while licensed partners provide regulated payment/banking rails.

### 2026-09-11 — Fortnox becomes validation infrastructure during migration

Use existing Fortnox connectivity for shadow payment/accounting comparison until Handymate has enough verified production history to become system of record.

### 2026-09-11 — Preserve existing centralized payment paths during migration

Evolve `lib/invoices/apply-payment.ts` into a Financial Kernel compatibility facade instead of bypassing it and creating a second payment truth.

### 2026-09-11 — Automation Engine is downstream, not the finance event store

Financial events need their own durable/idempotent/replayable event/outbox layer. Relevant canonical events are bridged into existing automations for compatibility.

### 2026-09-11 — Exact money representations are mandatory in the kernel

Legacy `number` fields can remain during migration, but Pay/Ledger canonical state must use exact monetary representations and PostgreSQL NUMERIC/integer minor units rather than floating-point arithmetic.

### 2026-09-11 — Rounding differences are postings, never tolerances

The legacy ±1 kr tolerance in `lib/invoices/payment-decision.ts` must not cross into the kernel. A difference within the country pack's rounding policy becomes an explicit posting; a difference outside it becomes a reconciliation exception. This is a breaking change to tested behaviour, not a cleanup.

### 2026-09-11 — The SE pack must support reverse-charge construction VAT and cash basis from the start

Omvänd skattskyldighet för byggtjänster is a large share of B2B invoice volume for the target segment, and kontantmetoden is the default accounting method for most companies in it. Neither was in the original scope and neither exists in the codebase today. Both are segment-blocking rather than edge cases.

### 2026-09-11 — Historical data enters the ledger as an opening balance, never as a replay

`paid_amount` is an aggregate with no stored receivable composition, so pre-kernel invoices cannot be reconstructed. Cut over at a fiscal-year boundary via SIE import, post an opening-balance journal and lock every earlier period.

### 2026-09-11 — Shadow mode is structurally blind until the payment direction is flipped

Fortnox is currently the source of payment truth and syncs into Handymate. Until that is reversed per business, a green shadow comparison proves the sync works and must never be reported as evidence that the kernel computes payment state correctly.

### 2026-09-11 — Specify now, implement after PMF

Roadmap §16 (PMF first) and orchestration §10 (spend reasoning capacity on the kernel now) are not in conflict. Specification, review, contracts and executable golden paths carry no production risk and proceed now; implementation, shadow mode and pilots are gated by PMF evidence. Available model capacity is a reason to specify more, never a reason to ship finance code earlier.

### 2026-09-12 — The obligation stays with the customer; Managed is a separate line

Boundary on the outcome-delivery principle above. The outcome must be verifiable and the bookkeeping obligation stays with the bookkeeping entity — a finished outcome means the work is done and evidenced, not that responsibility transferred. A service line where Handymate undertakes the work as an engagement is a separate regulated business with its own liability and insurance (roadmap §17.1), never a SaaS tier.

### 2026-09-12 — Exception-based review is a measured target, not a description of today

Earned autonomy currently covers four action types behind a hardcoded allowlist after a 15-approval streak. Any claim about an automation share must name the measured figure and the date. Marginal cost is metered by the existing cost guard, not assumed to be zero. See `FINANCIAL_KERNEL_ARCHITECTURE.md` §39.2.

### 2026-09-12 — Start the rulebook before the ledger

Taking a handful of pilot companies' running bookkeeping by hand, in the existing external system if needed, produces rulebook entries before there is code that can be wrong about them. No Fortnox partner licence, no migration, no kernel required. See roadmap §21.2.

### 2026-09-11 — Four decisions deliberately left open

Merchant-of-record model, Pay-vs-Ledger sprint order, whether Handymate files the momsdeklaration, and the pilot cut-over fiscal-year boundary are recorded as open in `FINANCIAL_KERNEL_ARCHITECTURE.md` §38. Implementation agents state the blocker and stop rather than choosing a convenient answer.

### 2026-09-12 — Finished outcomes, not just AI tools

Handymate's target operating model is AI-native outcome delivery: customers increasingly buy completed administrative and financial outcomes rather than software they must operate line-by-line. Agents and deterministic systems perform the routine work; rulebooks and integrity systems verify it; humans handle exceptions. This principle applies first and most concretely to Accounting, but should guide future service-like verticals where Handymate already owns the underlying operational context.

---

## North Star

> **Handymate — The operating system for the trades.**

The moat is not any individual module. It is the closed loop from demand and quote assumptions through operational execution, money movement, accounting truth and realized profitability back into better future decisions — plus the rulebook of real edge cases that lets Handymate increasingly deliver those outcomes without proportional human headcount.
