# Handymate Financial Kernel — Development Orchestration

> Status: Execution companion / mandatory reading for implementation agents
> Parent architecture: `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md`
> Review record: `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md` — accepted findings are already normative here and in the parent. You do not need to read the review to work correctly.
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

### Resolving the apparent conflict with the roadmap

`docs/HANDYMATE_ACCOUNTING_ROADMAP.md` §16 says Accounting should not automatically be the first
large initiative after launch, and that PMF comes first. §10 of this document says the
highest-reasoning capacity available now should go to Financial Kernel work. Both are correct and
they are not in conflict — but nothing said so, which meant either could be cited to justify the
opposite sequencing decision.

**The resolution, binding:**

```text
now          specification, review, contracts, executable golden paths
             (no production risk, no customer exposure, and the work that is
              hardest to parallelize or reconstruct later)

after PMF    implementation behind flags, shadow mode, pilots
             evidence of retention and transaction volume gates this, not capacity
```

Available model capacity is a reason to specify more, never a reason to ship finance code earlier.

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

**This role must be a named, contracted person before Package C9, not a document.** Parent §28
Sprint −1 treats engaging them as a prerequisite with months of lead time. A posting rule written
without a reviewer is not "done pending review"; it is unvalidated.

The same applies to the open decisions in parent §38. A model that reaches one states the blocker
and stops. Choosing the convenient answer to keep moving is the single most damaging thing an
implementation agent can do in this initiative.

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
- VAT, **including reverse-charge construction VAT on both the sales and purchase side**
  (parent §15.1 — absent from the original scope and from the current codebase);
- **accounting method: accrual vs cash basis** (parent §15.2 — cash basis is the default for
  most of the target segment, not an edge case);
- ROT/RUT receivable composition, and its interaction with both of the above;
- credit notes;
- corrections/reversals;
- fiscal periods;
- rounding policy and the account that carries rounding differences (parent §5);
- source-document provenance;
- SIE requirements, import as well as export;
- opening balances and cut-over (parent §18.4);
- receivables lifecycle: dunning fees, interest, write-off, factoring (parent §37);
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

### Claude G — statutory compliance review

Separate from Claude D because it asks a different question: not "is this posting correct?" but
"can a customer using this system comply with the law?"

Review against parent §36:

- voucher identification and unbroken series, including what happens to a number on a failed post;
- retention of räkenskapsinformation, and its collision with subscription cancellation and the
  existing account-deletion paths in the product;
- readable presentation and source-document retrievability;
- system documentation and processing history as a statutory obligation;
- invoice-document requirements, including the reverse-charge reference;
- evidence and dating of a counterparty's construction-buyer status.

Deliver a list of items requiring confirmation by the accounting consultant or auditor. Do not
present a model's reading of a statute as legal advice or as approval.

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
- Which Swedish assumptions are in fact segment-specific rather than universal? (The original
  draft assumed accrual accounting and universal output VAT; both are wrong for the majority of
  the target segment. Assume more of these exist.)
- Where would supporting a second accounting method or VAT regime force a change in Pay? Any
  such place means the kernel boundary is drawn wrong.

Every accepted finding should update the parent architecture or become an explicit implementation/test requirement.

---

## 5. Codex implementation packages

Do these as separate packages/PRs where practical.

### Package P0 — merchant-of-record decision (no code, blocks C9)

Not a Codex package — an owner decision, tracked here because packages depend on it.

Merchant-of-record vs. platform vs. marketplace payout determines clearing-account semantics,
receivable ownership and liability (parent §38.1). It must be resolved before the first SE
posting rule. Runs in parallel with C0–C4; it does not block them.

### Package C0 — architecture contract only

Before production Financial Kernel code:

- read `handymate-dashboard/ARCHITECTURE.md`;
- read both Financial Kernel documents;
- finalize canonical financial event names;
- update `ARCHITECTURE.md` first;
- document feature flags;
- **add a CI contract test that fails when a financial event name appears in code but not in
  `ARCHITECTURE.md`** — the repository already enforces comparable contracts in
  `tests/schema-contract.spec.ts` and `tests/dead-code-paths.spec.ts`, and a rule that depends on
  three parallel agents remembering it is the rule that erodes first;
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

### Package C1b — rounding policy

Define the country-pack rounding policy and the account that carries a rounding difference
(parent §5). Separate from C1 because it is an accounting decision, not a numeric primitive, and
requires the accounting consultant.

Acceptance:

- a difference within policy produces an explicit posting; a difference outside it produces a
  reconciliation exception;
- **no comparison tolerance constant exists in kernel code**;
- the account number is recorded as confirmed by a named person, or the package is not done.

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

The receivable model must also be able to express a **change of owner** (factoring, parent §37).
If it cannot, adding factoring later requires a data migration.

### Package C4b — opening balances and cut-over

Historical invoices cannot be replayed — `paid_amount` is an aggregate with no stored composition
(parent §18.4). Implement the cut-over instead:

- opening-balance journal and its own journal type;
- SIE import of ingående balans;
- per-business cut-over date, stored, displayed and auditable;
- every period before the cut-over locked.

Acceptance includes golden path 35: an invoice issued before cut-over and paid after it settles
against the opening AR balance, with no duplicate revenue and no posting into a locked period.

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

Two behaviours in the existing code are easy to break and must be named acceptance criteria:

- **Post-payment automation fires on `to_paid` and `to_customer_paid`, never on `settled`**
  (parent §18.5). The naive receivable-settlement implementation sends a second thank-you SMS
  when Skatteverket pays out. Golden path 34.
- **`TOLERANCE_KR = 1` must not cross into the kernel** (parent §18.3). Every invoice that
  settles today must still settle — now with a rounding posting that explains why. Golden
  paths 36–37.

### Package C6 — shadow payment mode

Run Financial Kernel alongside current behavior for selected internal/test businesses.

Record divergences. Do not auto-correct.

Implement the S1/S2 phase distinction from parent §20.1 **in this package, not later**: while
Fortnox is still the payment source, a green comparison proves the sync works and nothing more.
The phase must be stored per business and displayed anywhere divergence metrics appear, so that
a phase S1 green period cannot be read as kernel-correctness evidence.

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

Blocked on: Package P0 (clearing semantics) and a named accounting consultant (§3).

Implement professionally reviewed deterministic rules for:

- customer invoice;
- **reverse-charge construction invoice** (parent §15.1) — this requires a VAT regime on the
  invoice and an evidenced buyer status on the counterparty, so it is a change to the invoice
  domain and not a country-pack-only change;
- **cash-basis posting** (parent §15.2) — the accounting method decides which event triggers the
  revenue/VAT posting. If supporting it requires changing Pay, stop: the kernel boundary is wrong;
- credit invoice;
- payment allocation;
- provider clearing;
- payout/fee;
- rounding differences (Package C1b);
- ROT/RUT components, and their interaction with both the VAT regime and the accounting method;
- supplier invoice/AP as approved.

No account number in this package is done until a named person has confirmed it. A model's
plausible BAS number is a proposal, never an accounting decision.

### Package C10 — read-only Ledger projections and SIE

Build:

- general ledger;
- balance;
- P&L;
- voucher detail;
- financial timeline;
- **SIE export** — moved earlier on purpose (parent §15.4). It is the customer's exit guarantee
  and the format an external consultant or auditor will want during the pilot, which is exactly
  when their review matters most. It must exist before the first pilot business, not before
  broad migration.

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

Respect the S1/S2 phase distinction established in Package C6 (parent §20.1): divergence counts
and "verified" claims are only meaningful once the business has flipped to Handymate-canonical
payment truth. Label every comparison with its phase.

### Package C13 — VAT return primitives

Map ledger state to the VAT return's boxes, including reverse charge on both sides and the
ROT/RUT interaction (parent §15.3).

Whether Handymate also *files* the return is an open decision (parent §38.3). Do not resolve it
by building whichever is easier.

### Package C14 — receivables lifecycle

Required before the Ledger is canonical, not before beta (parent §37): dunning fees and interest
with their accounts and VAT treatment, bad-debt write-off, collection handoff, and factoring.

Note that dunning fees and interest already exist as invoice rows with `vat_rate 0` in
`lib/invoices/fortnox-rows.ts`, whose comment records that they were previously posted
incorrectly. Read that history before designing the treatment.

---

## 6. Review protocol

Every financial PR/package should be reviewed against five dimensions.

### A. Correctness

- Are Money calculations exact?
- **Is there any comparison tolerance? There must be none** (parent §5).
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
- Is any BAS account number presented as decided when it is only proposed?

### E. Swedish regime coverage

Applies to anything that posts, reports VAT, or touches an invoice's monetary fields.

- Does it hold for a **reverse-charge construction invoice**, not only a standard-VAT one?
- Does it hold for a **cash-basis business**, not only an accrual one?
- Does it hold for a ROT/RUT invoice under both of the above?
- Does it hold across the cut-over date, with pre-cut-over periods locked?
- Would supporting a second regime or method require changing Pay? If yes, the kernel boundary
  is in the wrong place — that is a BLOCKER, not a follow-up.

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
Open decisions encountered (parent §38) and left unresolved
Swedish regime coverage: reverse charge / cash basis / ROT-RUT / cut-over
Human accounting review required? yes/no — and by whom, by name
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
- **no monetary comparison tolerance was introduced anywhere in the kernel path**;
- **the event-contract CI test passes** — no financial event name exists in code that is absent
  from `ARCHITECTURE.md` (Package C0);
- **Swedish regime coverage is demonstrated** for any package that posts or computes VAT:
  reverse charge and cash basis are tested, not assumed inapplicable;
- no open decision from parent §38 was resolved by the implementer;
- unresolved BLOCKER review findings are zero.

For accounting-rule packages, also require the appropriate human/domain review before broad activation.

---

## 10. Recommended near-term capacity strategy

While high model capacity is temporarily available, spend the highest-reasoning capacity on work that reduces future architectural uncertainty rather than on broad speculative implementation.

Priority order:

```text
1. Launch stability and P0/P1 fixes
2. Financial Kernel adversarial reviews
3. Swedish domain/statutory review (Claude D + Claude G) — the 2026-09-11 review found two
   segment-blocking gaps here, so treat this as high-yield rather than routine
4. Schema / event / Money / idempotency contracts
5. Golden-path executable specifications
6. Kernel implementation behind flags
7. Shadow payment data
8. Pay provider integration
9. Ledger implementation + shadow accounting
```

Items 1–5 carry no production risk and are gated only by reasoning capacity. Items 6–9 are gated
by PMF evidence (§2) and, for anything involving Pay, by counterparty lead time that no amount of
model capacity shortens (parent §28, Sprint −1).

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

---

## 12. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-11 | Original execution plan. | — |
| 2026-09-11 | Resolved the priority conflict with roadmap §16 (§2); strengthened the domain-expert rule (§3); expanded Claude D and added Claude G (§4); added Packages P0, C1b, C4b, C13, C14 and expanded C0, C5, C6, C9, C10 (§5); added review dimension E (§6); extended the handoff contract (§7) and the merge gates (§9); reordered capacity priorities (§10). | Review F1–F14, `FINANCIAL_KERNEL_ARCHITECTURE_REVIEW.md` |
