# Handymate Strategy Index

> Purpose: Persistent strategic memory for Handymate. Important strategic conversations, architecture conclusions and sequencing decisions should be summarized into this repository so future Codex/Claude sessions can build from the same long-term thesis.

## Canonical product / strategy documents

### Financial OS

- [`../HANDYMATE_ACCOUNTING_ROADMAP.md`](../HANDYMATE_ACCOUNTING_ROADMAP.md) — strategic roadmap for replacing Fortnox/Bokio-class accounting for Handymate's core customer segment, including Global Ledger, country packs, shadow accounting, rollout and pricing implications.
- [`../HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md`](../HANDYMATE_VERTICAL_EXPANSION_STRATEGY.md) — vertical expansion thesis: Pay, Supply/Procurement, Payroll, Capital, Fleet, Insurance, People/Capacity Network and Marketplace.
- [`FINANCIAL_KERNEL_ARCHITECTURE.md`](FINANCIAL_KERNEL_ARCHITECTURE.md) — implementation blueprint tying Handymate Pay and Ledger together with durable financial events, payments, allocations, reconciliation, posting engine, Fortnox shadow mode and migration from current invoice/payment code.

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

---

## North Star

> **Handymate — The operating system for the trades.**

The moat is not any individual module. It is the closed loop from demand and quote assumptions through operational execution, money movement, accounting truth and realized profitability back into better future decisions.
