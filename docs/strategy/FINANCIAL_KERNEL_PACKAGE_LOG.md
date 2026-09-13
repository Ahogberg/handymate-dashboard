# Handymate Financial Kernel — Package Log

> Status: Live execution record. Updated in the same PR as every package.
> Parent architecture: `FINANCIAL_KERNEL_ARCHITECTURE.md` (domain rules) — canonical contract:
> `handymate-dashboard/ARCHITECTURE.md` §FK.0–FK.6 (names, envelope, flags, ownership).
> Execution rules: `FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md`.
> Created: 2026-09-13 (Package C0).

## 0. How to use this document

Orchestration §7 says: *do not hand the next agent only a conversational summary*. This file is
where a package's handoff lives once it is done, and where the brief for the next package lives
before it starts. An implementation agent (Codex) reads the brief here, does the package, and
writes its handoff block here in the same PR. A reviewing agent (Claude) records BLOCKER/HIGH
findings here if they are not resolved before merge.

Rules that keep this file honest:

- A package is **done** only when its merge gates (orchestration §9) are met and the handoff
  block below is filled in. "Implemented, tests later" is *in progress*.
- A package that hits an open decision (parent §38) stops and records **Blocked on** here.
- No package brief may widen a package. If a brief needs more scope, that is a new package.

---

## 1. Package board

| Package | What | Owner | Status | Blocked on |
|---|---|---|---|---|
| P0 | Merchant-of-record decision (D1) | Owner (Andreas) | **open** | — |
| C0 | Architecture contract, event names, flags, CI gate | Claude | **done 2026-09-13** | — |
| C1 | Money primitives | Codex | **implemented — awaiting Claude dimension A review** | review before merge |
| C1b | Rounding policy + rounding account | Codex + accountant | not started | named accounting consultant (orchestration §3) |
| C2 | `financial_events` schema | Codex | not started (brief sketch in §4) | C1 |
| C3 | Outbox/inbox/idempotency primitives | Codex | not started | C2 |
| C4 | Receivables + allocations behind flag | Codex | not started | C1, C2, C3 |
| C4b | Opening balances and cut-over | Codex | not started | C4, D4 (cut-over year) |
| C5 | `applyInvoicePayment()` compatibility facade | Codex | not started | C4 |
| C6 | Shadow payment mode (S1/S2 phase per business) | Codex | not started | C5, PMF gate (orchestration §2) |
| C7 | Pay provider adapter | Codex | not started | provider contract (Sprint −1), C3 |
| C8 | Ledger schema + posting engine | Codex | not started | C2, C3 |
| C9 | SE posting rules | Codex | not started | P0, C1b, named accountant, C8 |
| C10 | Read-only Ledger projections + SIE export | Codex | not started | C8 |
| C11 | Bank/reconciliation | Codex | not started | C4, bank access (Sprint −1) |
| C12 | Fortnox shadow verifier | Codex | not started | C6, C8 |
| C13 | VAT return primitives | Codex | not started | C9, D3 (file vs produce) |
| C14 | Receivables lifecycle | Codex | not started | C4, C9 |
| R0 | Manual rulebook track: a handful of pilot companies' running bookkeeping done by hand, SIE4 of a closed year collected (roadmap §21.2, §13.1) | Owner + accounting consultant | **not started — condition, not option** | named accounting consultant |

Parallel Claude analysis tracks (orchestration §4: A schema/RLS, B call-site map, C golden
paths, D Swedish ledger review, E Pay threat model, F adversarial review, G statutory) are
**not started** and can run alongside C1–C3. Track B is the one C5 depends on; run it before C4
is briefed.

Two constraints from the 2026-09-12 decisions (PR #47, merged 2026-09-13) bind the board:

- **Shadow reaches Level 1 only.** The Fortnox grant has no `bookkeeping` scope and it will
  not be re-added (shadow architecture §21.6). C6 and C12 compare objects and balances;
  Levels 2–4 are persisted as `unsupported` with reason. A green C12 run is therefore not
  VAT or voucher evidence. R0 is what produces that evidence, which is why R0 is on the
  board as a condition for C9 rather than as a nice-to-have.
- **The obligation never moves to Handymate** (parent §40.1). No package may describe its
  output as Handymate "taking over" bookkeeping. Finished means done and evidenced.

---

## 2. Handoffs

### C1 — Money primitives (Codex, 2026-09-13)

```text
Package / scope
  C1 only: isolated exact Money mechanisms, no production callers.
Files changed
  handymate-dashboard/lib/financial-kernel/money.ts
  handymate-dashboard/tests/financial-kernel-money.spec.ts
  handymate-dashboard/package.json (test registration)
  .github/workflows/contracts.yml (test registration)
  docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md (this handoff)
Architecture sections relied on
  ARCHITECTURE.md FK.0–FK.6; blueprint §5; orchestration §5 C1, §6 A, §7, §9.
Canonical events touched
  None. C0 catalog and contract test unchanged.
DB/RPC changes
  None.
Feature flags
  None; no caller imports Money into production code.
Golden paths added/updated
  Pure arithmetic examples for VAT (including zero rate), ROT split and credit notes.
  These are numeric examples, not posting, accounting-method or end-to-end proofs.
Invariants affected
  All eleven brief invariants covered before implementation was added. Initial test
  collection failed because money.ts did not exist. 13 Money tests now pass, including
  600 seeded allocations with exact integer error bounds and amounts beyond safe Number.
  JSON-safe factory values are frozen, with a non-enumerable local toJSON hook.
  No global BigInt prototype change. Explicit rounding has compile-time assertions.
Known unresolved questions
  Implementation choices for review: DOWN truncates toward zero, UP away from zero;
  HALF_UP ties away from zero. Negative allocation mirrors positive allocation with
  stable index tie-breaking. Empty/all-zero/negative weights throw even for zero money.
  fromDecimalString rejects exponent notation, whitespace and plus signs, accepts only
  redundant zero digits beyond currency precision. fromJSON requires exactly two own
  keys. fromLegacyNumber rounds the Number's shortest decimal representation with
  bigint arithmetic, including exponent notation; cannot recover previously lost digits.
  toLegacyNumber is explicitly lossy and rejects infinity overflow. Factory-created
  Money values serialize directly; a hand-written structural object containing bigint
  must be passed through money() or the exported toJSON() before JSON.stringify.
Open decisions encountered (parent §38) and left unresolved
  None required by C1; D1–D4 remain open. C1b rounding account/policy remains unselected.
Swedish regime coverage: reverse charge / cash basis / ROT-RUT / cut-over
  No posting or invoice behavior. Zero-rate multiplication, ROT shares and signed
  credits tested as arithmetic only. Regime eligibility, recognition timing and cut-over
  remain the owning packages' responsibility; no accounting rule is implied here.
Human accounting review required? yes/no — and by whom, by name
  No for C1 numeric mechanisms. C1b/C9 still require a named accountant.
```

Local verification: 41 tests passed across Money, event-contract, schema-contract,
dead-code-paths, apply-payment-decision and fortnox-row-builder. TypeScript and remote
CI results are recorded on the PR. Await Claude review against dimension A before merge.

### C0 — architecture contract (Claude, 2026-09-13)

```text
Package / scope
  C0 — contract only. No behaviour, no table, no RPC, no flag column, no Money class.

Files changed
  handymate-dashboard/ARCHITECTURE.md
    §4 header: names the boundary between automation events and kernel events
    new section "Financial Kernel — kontrakt" §FK.0–FK.6
  handymate-dashboard/lib/financial-kernel/events/catalog.ts        (new: names + type only)
  handymate-dashboard/tests/financial-kernel-event-contract.spec.ts  (new: CI gate)
  handymate-dashboard/package.json                                    (test:contracts)
  .github/workflows/contracts.yml                                     (browserless suite)
  docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md                      (§7 finalized, amendment log)
  docs/strategy/FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md         (C0 status, amendment log)
  docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md                       (this file)
  docs/strategy/STRATEGY_INDEX.md                                     (link + decision log)

Architecture sections relied on
  parent §1.6, §5, §6, §7, §8, §10, §16, §18.2, §18.5, §19, §20.1, §21, §26, §27, §35.5, §36.1, §38
  orchestration §1, §2, §3, §5 (C0), §7, §9

Canonical events touched
  All 32 names finalized in ARCHITECTURE.md §FK.1. One rename versus the blueprint:
  payment_processing -> payment_processing_started (convention: noun_past-participle).
  Five names reserved but not canonical: opening_balance_posted, cutover_recorded,
  vat_return_prepared, receivable_written_off, shadow_phase_flipped.
  Decisions embedded in the catalogue that a later package must not quietly undo:
    - every payment, including manual mark-paid and Fortnox import, is a Payment
      (provider 'manual' / 'fortnox') and settles through payment_settled -> payment_allocated
      -> receivable_settled; there is no side path that updates an invoice directly
    - receivable_adjusted carries a reason enum that already includes ownership_transfer,
      so factoring (parent §37) needs no schema change
    - invoice_issued carries vat_regime and accounting_method from day one (parent §15.1–15.2)
    - both divergence events carry phase S1|S2 as a required field (parent §20.1)
    - amounts in event payloads are integer minor units + currency; API JSON uses decimal strings

DB/RPC changes
  None. RPC names reserved in §FK.2: record_payment_settlement, allocate_payment,
  post_journal_entry, record_provider_event.

Feature flags
  None introduced. Nine documented in §FK.4 with the package that introduces each.
  shadow_payment_phase is a text column ('S1'|'S2'|NULL) with a dated companion, not a boolean.

Golden paths added/updated
  None executable yet (Claude track C). The CI gate is a contract test, not a golden path.

Invariants affected
  None at runtime. Enforced from now on by CI: no undocumented kernel event name in kernel
  folders or in a migration touching financial_events; fireEvent() only from
  events/bridge-automation.ts and only with §4 names; catalog.ts == ARCHITECTURE.md;
  blueprint §7 == ARCHITECTURE.md.

Known unresolved questions
  - The EVENT_LIKE regex in the contract test is deliberately broad; the first kernel package
    will probably need a line or two in NOT_EVENTS. That is the intended cost.
  - Whether kernel event payload amounts should be JSON numbers (minor units) or decimal
    strings was decided here as integer minor units for payloads (they fit in 2^53 comfortably
    at SEK scale) and decimal strings at the API boundary. C2 may challenge this before the
    table exists; after C2 it is fixed.

Open decisions encountered (parent §38) and left unresolved
  All four remain open. None was needed for C0.

Swedish regime coverage: reverse charge / cash basis / ROT-RUT / cut-over
  Names and required fields cover all four. No behaviour to test.

Human accounting review required?
  No for C0. Yes before C1b and C9, by a named person — still unnamed as of 2026-09-13.
```

Verified before push: the five contract tests pass; a throwaway file with an undocumented
event name, a reserved name and a stray `fireEvent()` call made two of them fail with the
expected messages and was removed; `npx tsc --noEmit` clean.

---

## 3. Next package — Codex brief: C1 Money primitives

Read first, in this order: `handymate-dashboard/ARCHITECTURE.md` §FK.0–FK.6,
`FINANCIAL_KERNEL_ARCHITECTURE.md` §5 (all of it, including "Rounding differences are postings,
never tolerances"), `FINANCIAL_KERNEL_DEVELOPMENT_ORCHESTRATION.md` §5 C1, §6 A, §9.
Then the legacy code you are **not** allowed to change but must understand:
`lib/invoices/customer-share.ts`, `lib/invoices/payment-decision.ts`, `lib/invoices/fortnox-rows.ts`.

### Scope

One file with pure functions and one browserless test file. Nothing else.

```text
handymate-dashboard/lib/financial-kernel/money.ts          (new)
handymate-dashboard/tests/financial-kernel-money.spec.ts   (new; add to test:contracts in
                                                            package.json and to the browserless
                                                            list in .github/workflows/contracts.yml,
                                                            directly after financial-kernel-event-contract.spec.ts)
```

No import from `lib/invoices/*`, `lib/fortnox/*` or anything outside `lib/financial-kernel/`.
No caller of `money.ts` anywhere yet — that starts in C4. Existing invoice arithmetic is
untouched (orchestration C1: "must not alter existing invoice calculations globally").

### Contract (fixed — internals are yours)

```ts
type CurrencyCode = 'SEK' | 'EUR' | 'NOK' | 'DKK'           // extend by adding to a table, never by widening to string
interface Money { readonly amountMinor: bigint; readonly currency: CurrencyCode }

type RoundingMode = 'HALF_UP' | 'HALF_EVEN' | 'DOWN' | 'UP'  // always explicit; no default parameter

money(amountMinor: bigint | number, currency): Money           // number accepted only if Number.isSafeInteger; else throws
fromDecimalString(s: string, currency): Money                  // '125.00', '-0.5', '1234.5600' -> exact; more decimals than the currency allows -> throws (no silent rounding)
toDecimalString(m: Money): string                               // '125.00' — always the currency's minor digits
fromLegacyNumber(n: number, currency, rounding: RoundingMode): Money
                                                                // THE ONLY float entry point. Rounds to minor units with the given mode.
                                                                // Documented as the boundary from legacy `number` kr columns.
toLegacyNumber(m: Money): number                                // for feeding legacy projections during migration; documented as lossy-by-design in name

add(a, b) / subtract(a, b) / negate(m) / sum(ms: Money[], currency)   // currency mismatch throws; sum of [] is zero in the given currency
multiply(m, ratio: { numerator: bigint; denominator: bigint }, rounding: RoundingMode): Money
                                                                // e.g. VAT 25% = 25/100, ROT 30% of labour = 30/100
allocate(m, weights: bigint[]): Money[]                         // largest-remainder; parts sum EXACTLY to m; order-stable; zero weights get zero
compare(a, b): -1 | 0 | 1  /  equals(a, b)  /  isZero  /  isNegative   // exact. No tolerance parameter exists.
toJSON(m): { amount: string; currency: CurrencyCode }           // decimal string, never BigInt
fromJSON(v: unknown): Money                                     // validates shape; throws on anything else
```

Minor-unit digits per currency live in one table in the file (SEK/EUR/NOK/DKK all 2). An
unknown currency throws at construction; nothing defaults to SEK.

### Invariants (write them as tests before the implementation)

1. `0.1 + 0.2` style errors are impossible: `add(fromDecimalString('0.10'), fromDecimalString('0.20'))` equals `fromDecimalString('0.30')` exactly.
2. `allocate` never loses or invents an öre: for random amounts and weights, `sum(parts)` equals the input exactly, and every part differs from its ideal share by at most one minor unit.
3. `multiply` without a rounding mode does not compile (type-level), and `HALF_UP` vs `HALF_EVEN` are observably different on `x.xx5` cases — include the case that differs.
4. Currency mismatch throws on every binary operation, including `sum` and `compare`.
5. `fromDecimalString('1.005', 'SEK')` throws; it does not round.
6. `toJSON`/`fromJSON` round-trips every value, including negatives and zero, and `JSON.stringify` of a Money never produces a BigInt error.
7. `fromLegacyNumber(1234.5600000001, 'SEK', 'HALF_UP')` equals `fromDecimalString('1234.56')`, and the function is the only place in the file where a `number` is converted arithmetically.
8. VAT worked example: `multiply(fromDecimalString('99.99'), 25/100, HALF_UP)` is `25.00`; `HALF_EVEN` gives the same here — add a case where they differ.
9. ROT worked example: labour `10000.00`, ROT 30% → customer `7000.00`, tax authority `3000.00`, and `allocate` of the total by weights [70, 30] gives the same two numbers.
10. Negative Money is legal (credit notes) and `negate(negate(m))` equals `m`.
11. No comparison tolerance constant exists in the file — grep for `TOLERANCE`, `EPSILON`, `Math.abs(` and assert absence in the test (a source-scanning assertion, the repo's facit pattern).

### Acceptance (orchestration §5 C1 + §9)

- exact minor-unit/decimal conversion; currency required; explicit rounding; no floating-point
  canonical storage; serialization contract tested — all as tests above.
- `npx tsc --noEmit` clean; `npx playwright test tests/financial-kernel-money.spec.ts tests/financial-kernel-event-contract.spec.ts --no-deps --project=chromium` green.
- Diff touches only the files listed under Scope plus the two registration edits.
- No `number` arithmetic on amounts anywhere except inside `fromLegacyNumber`/`toLegacyNumber`.

### Not in this package

Rounding **policy** (which differences are absorbed and on which account) — that is C1b and
needs a named accountant. `money.ts` provides the mechanism (explicit modes, exact allocate),
never a policy. Do not add a "rounding difference" helper that picks an account.

### Handoff back

Fill in the orchestration §7 block under §2 of this file, in the same PR. Then Claude reviews
against §6 dimension A before merge.

---

## 4. Queued after C1 — sketch only, briefed when C1 merges

**C2 — `financial_events` schema.** Migration `sql/v2xx_financial_events.sql` matching parent
§6 exactly: `UNIQUE (business_id, idempotency_key)`, indexes on `(business_id, correlation_id)`,
`(business_id, event_type, occurred_at)`, `(business_id, source_type, source_id)`; RLS by
`business_id` following the pattern in the newest `sql/v23x_*.sql` files; `event_type` CHECK
constraint generated from `catalog.ts` (the contract test already scans any migration that
mentions `financial_events`). `lib/financial-kernel/events/types.ts` with the envelope from
parent §7 typed against `FinancialEventType`. No publish, no consume — that is C3. Claude track
A (schema/RLS review) should run on the proposed migration before it is applied anywhere.

**C1b — rounding policy.** Cannot start until a named accounting consultant confirms the
rounding account (parent §5 proposes 3740; that is a proposal). Add the person's name to §1 of
this file when they exist.

**P0 — merchant-of-record.** Owner decision. Does not block C1–C4. Blocks C9.

**Input to the C4 brief from an unmerged branch.** PR #12 (`codex/payment-plan-invoicing`,
draft, flags off, migration v214 never applied) designed stage invoicing against a payment
plan: server-computed integer öre with cumulative rounding, ROT split per stage, a final
settlement invoice that nets earlier stages, full credit only, a credit register, and an
atomic Fortnox export claim. The C4 brief must state whether the receivable model treats each
stage as its own `invoice_issued` + `receivable_created` (the catalogue's assumption) and how
"remaining amount goes back to the final settlement" after a credit is expressed with
`receivable_adjusted`. Read `handymate-dashboard/tasks/payment-plan-invoicing.md` on that
branch before writing C4; do not merge #12 into the kernel path as-is.

---

## 5. Review record

Findings that a review left open, or accepted with a note, so that a merge does not erase
them. BLOCKER/HIGH must be resolved before merge; MEDIUM before the feature flag; LOW is
tracked.

### C1 — Money primitives (PR #49), Claude review 2026-09-13, orchestration §6 A

Verified locally on `codex/financial-kernel-c1` head `dca5fbf`: 13 Money tests + 5 contract
tests green, plus 18 adversarial probes (exponent notation both signs, float noise, negative
ties in all four modes, more weights than units, weights beyond 2^128, VAT split by weights,
leading zeros, 30-digit decimals, structural objects without `money()`, symbol keys in JSON,
mutation of a frozen value). No BLOCKER, no HIGH.

| Sev | Finding | Status |
|---|---|---|
| MEDIUM | `toLegacyNumber` silently changes digits above `Number.MAX_SAFE_INTEGER` minor units (9007199254740993 öre → `90071992547409.94`). "Lossy by design" covers *bigint → number*, not *different digits*. Throw `RangeError` beyond the safe range and add the test. | raised on PR #49 |
| LOW | `HALF_UP` is ties-away-from-zero, so a credit note rounds symmetrically with its invoice. Correct as mechanism; C1b must state the policy for negative amounts explicitly rather than inherit it. | note for C1b |
| LOW | Callers will hold VAT rates as `25` and ROT as `30`; a `ratioFromPercent` helper belongs in the first caller package (C4), not here. | note for C4 |
| accepted | `fromLegacyNumber` interprets the number's shortest decimal representation (so `1.005` → `1.01` under HALF_UP, `0.1 + 0.2` → `0.30`). That is the right reading of a legacy `NUMERIC` column that passed through a JS number. Documented in the source. | — |
| accepted | `equals`/`compare` throw on currency mismatch rather than returning `false`. Brief-mandated; a filter across currencies must group by currency first. | — |

---

## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created with C0 handoff and C1 brief. | Package C0 |
| 2026-09-13 | Folded in the 2026-09-12 decisions (shadow Level 1, obligation boundary, R0 manual rulebook track); noted PR #12 as C4 input; added §5 review record with the C1 review. | PR #47, C1 review |
