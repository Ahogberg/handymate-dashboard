# Handymate Financial Kernel — Development Orchestration

> Status: Execution companion / mandatory reading for implementation agents
> Parent architecture: `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md`
> Date: 2026-09-11

## 0. Purpose

This document defines **how Codex and Claude should divide, implement, review and integrate Financial Kernel / Pay / Ledger work**. It is intentionally separate from the architecture blueprint so implementation agents can receive a focused execution contract without weakening the parent architecture.

The parent `FINANCIAL_KERNEL_ARCHITECTURE.md` remains authoritative for domain boundaries, events, Money, Pay, Ledger, reconciliation, migration and product integration. If this execution plan conflicts with it, the parent architecture wins.

No model should interpret a workstream assignment as permission to invent local architecture.

---

## 1. Global execution rule

Do not assign one model the prompt "build Financial Kernel".

Work in small, reviewable packages:

```text
Architecture / contract
        ↓
Scoped implementation package
        ↓
Codex implementation
        ↓
Claude adversarial review
        ↓
Codex correction
        ↓
Golden-path + invariant tests
        ↓
Merge
        ↓
Next package
```

The objective is not maximum parallel code generation. The objective is **parallel reasoning with serialized ownership of financial truth**.

Two agents must not independently implement competing versions of the same financial primitive.

---

## 2. Pre-launch vs post-launch rule

### Before launch

Financial Kernel production behavior is **not** the priority.

Use available model capacity primarily for:

- launch-blocker audit;
- tenant isolation audit;
- auth/permission audit;
- invoice/payment correctness audit;
- Fortnox integration audit;
- data-integrity audit;
- agent failure-mode audit;
- mobile/customer-portal critical UX audit;
- architecture review and pre-build specifications for Financial Kernel.

Do not perform broad finance refactors immediately before launch merely because model capacity is available.

Financial Kernel work before launch should normally be read-only analysis, specification, tests/plans or isolated primitives that cannot alter existing production behavior.

### After launch stability

Once launch is stable, begin Financial Kernel behind feature flags.

Target progression:

```text
contracts
→ Money
→ durable financial events
→ idempotency/outbox
→ receivables/allocations
→ legacy compatibility facade
→ shadow mode
→ Pay
→ Ledger
→ bank/reconciliation
→ supplier/AP/VAT
→ Fortnox shadow accounting
→ controlled pilot
```

---

## 3. Recommended model responsibilities

Model names describe preferred responsibilities, not permanent vendor lock-in. If model availability changes, preserve the role separation.

### Claude — architecture/domain/adversarial reviewer

Prefer Claude for reasoning-heavy work:

- architecture criticism;
- schema and invariant review;
- accounting edge-case discovery;
- threat modelling;
- migration analysis;
- exhaustive call-site analysis;
- golden-path scenario design;
- regulatory/domain questions for human validation;
- PR/diff review after Codex implementation;
- identifying hidden coupling with current Handymate behavior.

Claude should generally **review and challenge** financial implementation rather than simultaneously author a competing implementation of the same package.

### Codex — scoped implementation owner

Prefer Codex for bounded code changes:

- migrations;
- TypeScript primitives;
- RPCs;
- state machines;
- adapters;
- tests;
- compatibility facades;
- provider integration;
- posting engine;
- reconciliation implementation;
- fixing findings from review.

Every Codex package should have explicit files/ownership, invariants and acceptance tests.

### Human/domain expert

Auditor/accounting consultant owns accounting truth where legislation/practice requires domain judgment.

Models must flag unresolved accounting assumptions instead of silently selecting convenient behavior.

---

## 4. Parallel Claude analysis tracks

These tracks can run in parallel because they produce analysis/specification rather than competing production implementations.

### Claude A — schema + tenant/RLS review

Deliver:

- proposed SQL schema;
- keys/indexes;
- uniqueness/idempotency constraints;
- RLS/tenant boundaries;
- atomic RPC boundaries;
- concurrency/deadlock risks;
- migration/backfill risks.

Must read current Supabase patterns first.

### Claude B — current financial call-site map

Trace all existing flows involving:

- invoice creation;
- invoice status;
- `applyInvoicePayment()`;
- `payment-decision.ts`;
- Fortnox payment sync;
- customer payment confirmation;
- ROT/RUT payment flows;
- supplier invoice status/payment;
- automation `payment_received`;
- project profitability/financial projections.

Deliver a dependency map and identify every path that could bypass Financial Kernel.

### Claude C — Golden Path / edge-case owner

Expand the parent architecture's E2E suite into executable specifications.

For every scenario define:

```text
Given
When
Expected canonical events
Expected payment/allocation state
Expected invoice/payable projection
Expected ledger postings
Expected reconciliation state
Expected legacy automation behavior
Expected audit chain
```

Prioritize duplicates, retries, partials, refunds, credits, ROT/RUT, provider fees, delayed payouts and period boundaries.

### Claude D — Swedish Ledger domain review

Review:

- BAS mapping strategy;
- VAT;
- ROT/RUT receivable composition;
- credit notes;
- corrections/reversals;
- fiscal periods;
- source-document provenance;
- SIE requirements;
- customer/supplier accounting edge cases.

Produce a list of items requiring accountant/auditor confirmation. Do not present model assumptions as accounting approval.

### Claude E — Pay threat model

Review:

- webhook verification;
- replay attacks;
- provider-event dedupe;
- tenant mapping;
- idempotency;
- refund authorization;
- payout manipulation;
- race conditions;
- forged payment confirmation;
- secret handling;
- cross-tenant external references;
- audit retention;
- failure/retry behavior.

Deliver abuse cases plus concrete mitigations/tests.

### Claude F — adversarial architecture review

Read the entire parent architecture and try to break it.

Questions include:

- Where can two sources of truth emerge?
- Which event names are ambiguous?
- Which operations cannot safely be eventually consistent?
- Where could a provider state leak into Ledger?
- Which derived statuses could drift?
- What fails during network timeout after DB commit?
- Can historical replay reproduce state?
- What breaks internationalization?
- What assumptions are Sweden-specific but accidentally global?

Every accepted finding should update the parent architecture or become an explicit implementation/test requirement.

---

## 5. Codex implementation packages

Do these as separate packages/PRs where practical.

### Package C0 — architecture contract only

Before production Financial Kernel code:

- read `handymate-dashboard/ARCHITECTURE.md`;
- read both Financial Kernel documents;
- finalize canonical financial event names;
- update `ARCHITECTURE.md` first;
- document feature flags;
- no behavior change.

### Package C1 — Money primitives

Implement exact Money utilities and tests.

Must not alter existing invoice calculations globally in the same package.

Acceptance:

- exact minor-unit/decimal conversion;
- currency required;
- explicit rounding;
- no floating-point canonical storage;
- serialization contract tested.

### Package C2 — financial event schema

Implement:

- `financial_events`;
- schema version;
- correlation/causation;
- actor/source provenance;
- tenant-aware idempotency;
- required indexes/RLS.

No Pay provider.

### Package C3 — outbox/inbox/idempotency primitives

Implement atomic event persistence/dispatch/retry primitives.

Acceptance includes duplicate delivery and crash-after-commit scenarios.

### Package C4 — receivables + allocations

Implement canonical receivable components and payment allocations behind flags.

Do not change current customer-visible payment behavior yet.

ROT/RUT must support separate customer and tax-authority receivable components.

### Package C5 — `applyInvoicePayment()` compatibility facade

When kernel flag is enabled:

```text
legacy caller
→ applyInvoicePayment()
→ canonical payment/import
→ allocation
→ invoice projection
→ legacy automation bridge
```

Golden paths must prove legacy behavior remains unchanged for non-kernel customers and equivalent for kernel-shadow customers.

### Package C6 — shadow payment mode

Run Financial Kernel alongside current behavior for selected internal/test businesses.

Record divergences. Do not auto-correct.

### Package C7 — Pay provider adapter

Only after provider-neutral contracts exist.

Implement:

- payment intent;
- signed webhook;
- provider-event persistence/dedupe;
- normalized state machine;
- allocation;
- refund primitive;
- payout/fee evidence where supported.

Provider-specific code must stay inside adapter boundary.

### Package C8 — Ledger schema + posting engine

Implement:

- accounts;
- fiscal years/periods;
- journals;
- entries/lines;
- atomic posting;
- balance invariant;
- source-event provenance;
- reversal primitive.

No broad UI yet.

### Package C9 — SE posting rules

Implement professionally reviewed deterministic rules for:

- customer invoice;
- credit invoice;
- payment allocation;
- provider clearing;
- payout/fee;
- ROT/RUT components;
- supplier invoice/AP as approved.

### Package C10 — read-only Ledger projections

Build:

- general ledger;
- balance;
- P&L;
- voucher detail;
- financial timeline.

Keep manual posting limited until controls are reviewed.

### Package C11 — bank/reconciliation

Implement bank/provider evidence, matcher, partial matches, fees and exception queue.

### Package C12 — Fortnox shadow verifier

Reuse current integration to compare:

- payments;
- invoice balances;
- vouchers;
- AR/AP;
- VAT;
- account/period totals.

Every confirmed divergence becomes a regression test.

---

## 6. Review protocol

Every financial PR/package should be reviewed against four dimensions.

### A. Correctness

- Are Money calculations exact?
- Can retries duplicate economic effects?
- Are state transitions legal?
- Are invariants enforced at the strongest practical layer?

### B. Integration

- Does existing invoice/project/automation behavior remain correct?
- Is there any new parallel source of truth?
- Are feature flags safe?
- Does legacy behavior remain available during migration?

### C. Security / tenant isolation

- Is `business_id` trusted only from authenticated/trusted mapping?
- Can IDs cross tenants?
- Are webhook/provider refs mapped safely?
- Are privileged commands audited?

### D. Accounting/auditability

- Is every posting traceable to a source event/document?
- Is posted history immutable/correctable by reversal?
- Is rule version/provenance stored?
- Does the change require human accounting validation?

Claude review findings should be categorized:

```text
BLOCKER — cannot merge
HIGH — must resolve before enabling feature flag
MEDIUM — tracked before beta
LOW — improvement/documentation
```

---

## 7. Model handoff contract

Every implementation agent should begin by reading:

1. `handymate-dashboard/ARCHITECTURE.md`
2. `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md`
3. this document
4. the existing files named by its assigned package

Every implementation handoff should state:

```text
Package / scope
Files changed
Architecture sections relied on
Canonical events touched
DB/RPC changes
Feature flags
Golden paths added/updated
Invariants affected
Known unresolved questions
Human accounting review required? yes/no
```

Do not hand the next agent only a conversational summary. The repo documents and code are the source context.

---

## 8. Parallelism rules

Safe parallelism examples:

```text
Claude threat model        || Claude accounting edge cases
Claude schema review       || Claude golden paths
Codex Money primitives     || Claude review of provider options
Codex Ledger read model    || Claude audit of reconciliation cases
```

Unsafe parallelism examples:

```text
Codex A implements Money   || Codex B invents different Money
Codex A changes payments   || Codex B changes same payment state machine
Claude authors Ledger core || Codex independently authors competing Ledger core
Two agents edit same migration/event contract without coordination
```

Prefer one implementation owner per primitive, multiple reviewers.

---

## 9. Merge gates

Do not merge/enable a financial package unless:

- existing relevant tests pass;
- new package tests pass;
- golden-path tests covering the change pass;
- duplicate/retry behavior is tested when applicable;
- tenant isolation is tested;
- feature flag defaults preserve current production behavior;
- no new undocumented event name exists;
- no provider-specific semantics leaked across adapter boundary;
- no direct Pay -> journal writes were introduced;
- unresolved BLOCKER review findings are zero.

For accounting-rule packages, also require the appropriate human/domain review before broad activation.

---

## 10. Recommended near-term capacity strategy

While high model capacity is temporarily available, spend the highest-reasoning capacity on work that reduces future architectural uncertainty rather than on broad speculative implementation.

Priority order:

```text
1. Launch stability and P0/P1 fixes
2. Financial Kernel adversarial reviews
3. Schema / event / Money / idempotency contracts
4. Golden-path executable specifications
5. Kernel implementation behind flags
6. Shadow payment data
7. Pay provider integration
8. Ledger implementation + shadow accounting
```

The target before reducing model capacity is ideally not "all Accounting finished". A stronger milestone is:

> **Financial Kernel architecture locked, core implemented and tested, Pay/Ledger foundations in place, and real Handymate financial events running through shadow mode.**

Once that foundation exists, later work becomes more deterministic and can be completed efficiently with lower model capacity.

---

## 11. Definition of successful orchestration

This development model is working when:

- agents rarely need to invent architecture;
- each PR has one clear owner;
- reviews find issues before production;
- the same Golden Paths validate Pay and Ledger together;
- current Handymate behavior remains stable during migration;
- every discovered real-world financial edge case becomes a permanent regression test;
- model/provider availability can change without changing the architecture;
- human accounting expertise validates accounting truth rather than cleaning up model guesses after implementation.

> **Execution principle:** use models in parallel to think, challenge and verify; serialize ownership when changing financial truth.