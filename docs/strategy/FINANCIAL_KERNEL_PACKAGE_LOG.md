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
| C1 | Money primitives | Codex | **done 2026-09-13** (PR #49 merged; MEDIUM corrected) | — |
| C1b | Rounding policy + rounding account | Codex + accountant | not started | named accounting consultant (orchestration §3) |
| C2 | `financial_events` schema + append RPC | Codex | **done 2026-09-13** (PR #50 merged; HIGH + 2 MEDIUM corrected; migration not yet applied to any environment) | — |
| C3 | Outbox/inbox/idempotency primitives | Codex | **done 2026-09-14** (PR #54 merged; lease model, ordered ack, Postgres concurrency proof) | — |
| C4 | Receivables + allocations behind flag | Codex | **ready — brief in §3** (Claude track A done, golden paths 34/10/36/19/7/30 replayed against the DDL) | — |
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

Parallel Claude analysis tracks (orchestration §4): **A done** (C2 brief), **B done**
(`FINANCIAL_KERNEL_CALL_SITE_MAP.md`), **C done** (18 of 40 golden paths executable as data in
`tests/financial-kernel/golden-paths.ts`, consistency-checked by
`tests/financial-kernel-golden-paths.spec.ts` in `test:contracts`; remaining 22 listed by the
spec), **D done** (`FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md`, 23 questions for the consultant);
E, F, G not started. Two findings for C4 from C/D: `receivable_adjusted.reason` needs
`reclassification` (ROT partial payout), and legacy marks any non-ROT partial payment `paid`
(golden paths 4 and 37) — C5 must decide whether the facade preserves that.

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

### C2 — financial event store (Codex, 2026-09-13)

```text
Package / scope
  C2 only: immutable financial_events schema, service-only append RPC, typed
  envelope/row conversion, and executable tests against the real migration.
Files changed
  handymate-dashboard/sql/v235_financial_events.sql
  handymate-dashboard/lib/financial-kernel/events/types.ts
  handymate-dashboard/tests/financial-kernel-events-sql.spec.ts
  handymate-dashboard/lib/account/radera.ts (required retention classification only)
  handymate-dashboard/package.json (registration)
  .github/workflows/contracts.yml (registration)
  docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md (brief and this handoff)
Architecture sections relied on
  ARCHITECTURE.md FK.1-FK.2; blueprint 6, 7, 8, 21, 26, 36.2;
  orchestration 5 C2, 6 A+C, 7, 9; this log's C2 brief.
Canonical events touched
  All 32 names in the database CHECK, exact parity tested against catalog.ts.
  Nine C4 payloads typed verbatim from FK.1; other payloads are never.
DB/RPC changes
  financial_events, indexes/constraints, immutable trigger, append_financial_event.
  NOT APPLIED to any remote/test/production environment. No backfill or caller.
Feature flags
  None. C4 still owns financial_kernel_enabled; no behavior switched on.
Golden paths added/updated
  Isolated database proofs for repeat append, conflicting retry, same-tenant
  causation and rejected cross-tenant chains, membership reads, immutable history,
  client denial, safe BIGINT transport and transaction rollback.
Invariants affected
  All eleven brief invariants, plus retention FK and unsafe numeric transport.
  Tests were written first; collection failed before types.ts existed. After
  installing the proposed DDL verbatim the inherited-service-grants test failed;
  it passes with the correction below. Real is_business_member body is extracted
  from the repository migration; auth.uid and tenant tables are isolated fixtures.
DDL deviations from the proposal, with reasons
  Replaced service_role's UPDATE/DELETE/TRUNCATE revoke with REVOKE ALL then
  GRANT SELECT, and revoked sequence rights from PUBLIC/anon/authenticated/service_role.
  Reason: inherited/default INSERT and sequence grants otherwise bypass the RPC,
  business lock and idempotency checks. The harness deliberately installs broad
  service default grants before the migration and proves this failure/correction.
  SECURITY DEFINER still appends as the migration owner; service_role can read and
  execute the RPC but cannot write directly. Header records the mandated lock order.
  Claude review corrections: removed FORCE RLS so the non-bypass owner can append; RPC now returns a flat row with TEXT seq/amount_minor; replay comparison also guards correlation, source, causation and effective_date. Actor and occurred_at deliberately remain first-write values on retry.
Scope deviation required by the existing CI contract
  lib/account/radera.ts now classifies financial_events in BEHALLS. The existing
  kontoradering completeness gate failed because every new business_id table must
  be classified. This implements C2's retain-history requirement without changing
  deletion logic or selecting retention/anonymisation policy. Seven files in total.
Known unresolved questions / limits of evidence
  PGlite is single-session: 200 ordered appends and lock placement are verified,
  not competing transactions' commit order. C3 must add a multi-connection Postgres
  concurrency proof before a consumer relies on seq. Sequence gaps are intentional.
  UPDATE/DELETE normally fail at the privilege boundary for service_role. The
  trigger is separately proven as owner and with test-only temporary grants.
  TRUNCATE is prevented by grants, not by a trigger against a database administrator.
  Correction to the brief's deletion assumption: the existing account deletion path
  soft-deletes business_config. RESTRICT rejects a hard DELETE, as tested, but does
  not itself block that existing soft-delete flow. Track G remains necessary.
  The append RPC compares event type, payload,
  amount, currency and chain identity; retry actor and occurred_at do not replace
  the first event. Payload-shape/business semantics are future writers' responsibility.
  Row mappers require string BIGINT transport, rejecting number input. The RPC supplies
  text fields and is tested through to_jsonb plus JSON.parse, for append and replay. Raw table JSON is
  still unsafe: future read views/RPCs must cast both BIGINT columns. Payload amounts remain the brief's number
  minor units; their owning packages must enforce the safe integer bound.
Open decisions encountered and left unresolved
  D1-D4, R0 and C1b remain unchanged. No retention/anonymisation decision made.
Swedish regime coverage: reverse charge / cash basis / ROT-RUT / cut-over
  Payload fields retain regime/method/tax-reduction and separate receivable
  components. No posting, VAT calculation, accounting rule or historical replay.
  RESTRICT intentionally exposes account-retention work to track G.
Human accounting review required? yes/no — and by whom, by name
  No for C2 storage mechanics. Named accountant still required for R0/C1b/C9.
```

Verification: 15 C2 tests, including the eleven brief invariants; 79 tests in
the combined C2/C0/C1/schema/dead-code/CI-registration/account-deletion pass. TypeScript and remote
CI status are recorded on the PR. Claude review of dimensions A and C is recorded below; its HIGH and two MEDIUM findings are corrected.

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
  collection failed because money.ts did not exist. 14 Money tests now pass, including
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
  toLegacyNumber is explicitly lossy and rejects minor units beyond the safe integer range. Factory-created
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

Local verification after the review correction: 53 tests passed across Money, event-contract, schema-contract,
dead-code-paths, apply-payment-decision, fortnox-row-builder and facit-ci-grind. TypeScript and remote
CI results are recorded on the PR. Claude dimension A review is recorded in §5; its MEDIUM finding is corrected.

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

### C3 implementation handoff — Codex, 2026-09-14

- **Package / scope:** C3, based on corrected brief `28baf4fe8` (PR #53). Library primitives only; no runner, production caller, migration execution or feature flag.
- **Files changed:** v236 migration; `events/publish.ts`, `consume.ts`, `bridge-automation.ts`; outbox SQL and PostgreSQL concurrency specs; package/workflow registrations; this handoff. `lib/account/radera.ts` additionally classifies the two retained kernel tables, as required by the existing account-deletion completeness gate.
- **Architecture:** ARCHITECTURE FK.2–FK.3/FK.5; blueprint §6/§8/§21; orchestration C3 and §9. Events table remains the outbox. No canonical event names changed.
- **DB/RPC:** cursor leases and delivery ledger, claim/ack/fail/release/resume, private lease guard and service-only status view. Added service-only `begin_financial_event_attempt` and `get_financial_consumer_status` to satisfy the RPC-only TypeScript boundary.
- **Deviation — attempt evidence:** timestamps on ack/fail alone cannot prove a crash before ack. The loop records an attempt before the handler. `attempt_token` makes that registration idempotent within a lease; a new lease records redelivery. Separate `failures` counts actual failures for the halt threshold. Ack retries do not inflate either counter. Failure closes the lease so a replayed failure cannot increment twice.
- **Deviation — status transport:** a service-only RPC reads halt state from the view and returns last_seq/backlog as TEXT. The existing KernelDb contract has no table-query API. The view also explicitly revokes service default privileges before granting SELECT.
- **Deviation — wall-clock lease checks:** uses `clock_timestamp()` so a transaction opened before expiry cannot acknowledge after expiry using its old `now()`. PostgreSQL test covers this.
- **Deviation — validation:** ack validates renewal duration, fail validates a positive threshold and first-pending-event order, and resume rejects whitespace/empty actor and reason. Both mutation paths lock the cursor before the delivery row.
- **Golden paths / invariants:** lease takeover and stale-worker fencing; ordered ack; crash/redelivery evidence; failure/halt/resume; tenant and consumer separation; client privilege denial; lossless publication; key formats; timeout; lost-lease stop; ambiguous ack response. Real PostgreSQL suite covers writer blocking/commit order, two-session claim race and wall-clock expiry. Local PostgreSQL tests skip explicitly without the isolated test URL.
- **Validation:** local `tsc --noEmit` passed; all 12 C3 SQL/consumer tests passed, as did C0/C1/C2 and relevant schema/dead-code/account-deletion/CI contracts (CI registration formatting corrected and rerun). Real PostgreSQL: [job 103803680559](https://github.com/Ahogberg/handymate-dashboard/actions/runs/34786815349/job/103803680559) at implementation `b6abf0e6e` ran all three C3 concurrency cases, with **51 passed and no skips** including existing follow-up/report tests. Full PR checks remain the final CI gate; Claude A/B/C review remains required before merge.
- **Known limitations:** handler timeout stops awaiting, not arbitrary side effects. C5 handlers must deduplicate by eventId; domain database effects and acknowledgement must share a domain RPC when atomicity is needed. A lease token fences cursor mutations, not an external provider. Resume's immutable audit record remains TODO(C4). The empty bridge must not be scheduled until C5 supplies mappings.
- **Open decisions:** R0/P0 left unresolved; no accounting policy selected. Reverse charge, cash basis, ROT/RUT and cut-over are unaffected because this package transports events and computes/posts no tax or accounting entries. No human accounting approval required for these transport primitives; later policy packages still require the named consultant.

### C4 implementation handoff — Codex, 2026-09-14

- **Package / scope:** customer-side C4; v238 four tables, five atomic domain RPCs, private helpers and service-only flags RPC. Thin typed Money wrappers; no production callers or remote migration execution. The flag defaults false, accounting method accrual and VAT regime standard.
- **Files changed:** brief scope plus `tests/helpers/financial-receivables-database.ts`, a shared isolated PGlite harness used by both new suites. It installs real v235/v236/v238 as a non-superuser/non-BYPASSRLS owner and the repository's real membership predicate. Four tables classified in BEHALLS.
- **Architecture relied on:** FK.1–FK.5; blueprint §9/§16/§18.2/§18.4/§21/§37; call-site map and track C/D. No new canonical events. All writes acquire the business advisory lock before row locks and append through C2 in the same transaction.
- **Schema evidence:** read-only information_schema query on Handymate production confirmed invoice/business IDs TEXT, total/customer_pays/rot_rut_deduction NUMERIC and invoice_date/due_date DATE. Removed the two unnecessary date casts. No customer rows were read and no production schema changed.
- **Deviation — tenant FK:** added unique `(business_id,invoice_id)` index on invoice and composite FK from receivables, so database integrity also prevents cross-business document links.
- **Deviation — ROT boundary:** the proposed COALESCE did not match `getCustomerShare` for older rows where customer_pays equals total. The exact NUMERIC expression now mirrors its ordered customer-share/deduction fallback. Test covers the mismatch found in the initial DDL.
- **Deviation — idempotency:** null-safe comparison of allocation and adjustment command identity; payment replay compares provider reference, direction, method, fee, evidence and supplied settlement time/correlation in addition to amount/currency/provider. Reversal rejects a changed reason. Replay responses include fields required by the fixed TypeScript API instead of omitting balances/booleans.
- **Deviation — settlement cycles:** settlement event keys include the causing allocation/adjustment event. A reversed settlement can therefore settle again without colliding with its immutable earlier event. Reversal/reallocation test covers the full cycle. C5 must decide any customer-notification policy across distinct settlement cycles; per-event dedupe alone is not that policy.
- **Deviation — Money boundary:** allocate/adjust accept optional final `p_currency` (wrappers always supply it), validated inside the transaction. Returned balances include currency. This prevents a Money value in another currency being silently treated as SEK. Payment fees require the same currency in the wrapper; customer allocation rejects outbound payments. Owner changes require the ownership-transfer reason.
- **Deviation — payload completeness/exactness:** creation events now contain the preallocated receivable ID required by FK.1. C4's append helper serializes numeric `*_minor` payload fields to decimal integer strings before C2 persistence, preserving values beyond JavaScript's safe integer range. Following the C0-owner decision in #57, all minor-unit payload types are string-only. C2 typed fixtures now use strings; the explicit numeric-transport rejection test is preserved. No existing environment events require compatibility. Above-safe-integer integration test exercises publication, allocation, reversal, adjustment and replay through wrappers.
- **Golden paths:** all 11 requested scenarios (1,4,5,7,10,12,19,30,34,36,37) replay via real RPCs and compare C4 event sequence, invoice outstanding sum and new customer settlement count. GP19's GIVEN customer payment is established through RPCs and its setup events excluded from WHEN assertions. GP10's invoice_credited belongs to document issuance outside these five RPCs; C4 verifies the credit adjustment closes silently. These are not claims of actual SMS delivery or journal posting.
- **Swedish regime coverage (E):** standard/reverse-charge metadata under accrual/cash, ROT and RUT components, exact boundary rounding, explicit rounding settlement versus credit/write-off closure, and reclassification conservation. No VAT calculation, posting account, rounding threshold or opening-balance policy selected. Historic cut-over remains C4b; no historical data backfill.
- **Validation:** 125 local kernel/golden-path/schema/retention/CI tests passed, then all 24 C4 tests passed after an additional validation case (126 distinct checks). TypeScript passed. Remote CI tracked on the implementation PR; Claude A/B/C/E review required before merge.
- **Open decisions / limits:** R0/P0 remain with the owner and named consultant. C1b rounding magnitude/account, C4s suppliers and C5 callers/notification semantics are not implemented. C3 resume's immutable audit TODO remains outstanding because this C4 brief includes no audit table. Human accounting review is required for later posting/policy packages; these tests preserve supplied regime data and do not approve account proposals.

## 3. Next package — Codex brief: C4 receivables, payments and allocations

> The C3 brief is retired to git history (its outcome: the C3 handoff in §2 and the C3 review in
> §5). **Prerequisite met:** `main` at `24275d1` carries C0–C3.

Read first: `handymate-dashboard/ARCHITECTURE.md` §FK.1 (amended 2026-09-14: `reclassification`,
the settle-vs-close rule on `receivable_settled`, provider values), §FK.2–FK.5;
`FINANCIAL_KERNEL_CALL_SITE_MAP.md` §1–§4 (what C4 must make expressible, what it must not
touch); `tests/financial-kernel/golden-paths.ts` (the acceptance data); `FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md`
§1 and §10 (why 1513, why reclassification); blueprint §9, §16, §18.2, §18.4, §21, §37;
orchestration §5 C4, §6 A+B+C+E, §9. Then the code you read but do not change:
`lib/invoices/apply-payment.ts`, `lib/invoices/payment-decision.ts`, `lib/invoices/customer-share.ts`,
`lib/fortnox/classify-payment.ts`, and `sql/v235`/`v236` (lock-order header, append RPC signature).

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **C4 is customer-side only.** Payables get their own package **C4s** (sketched in §4) that reuses `financial_payments` with `direction = 'outbound'`. | Serialised ownership per primitive; a package half the size is reviewable. The call-site map's "supplier side has no core" stands, and is next. |
| **Five domain RPCs, each appending its events inside one transaction** via the C2 RPC: `issue_invoice_receivables`, `record_payment_settlement`, `allocate_payment`, `adjust_receivable`, `reverse_payment_allocation`. | Closes the C3 decision: atomic event groups live in domain RPCs, never in application batching. |
| **Every RPC returns JSONB with every `*_minor` as a string.** | The C2/C3 lesson: PostgREST turns BIGINT into JSON numbers. |
| **Legacy kr → öre at exactly one boundary:** `round(numeric * 100)::bigint` inside `issue_invoice_receivables`. `round()` on NUMERIC is half away from zero, identical to Money `HALF_UP`. | The only float-ish input the kernel ever sees is the legacy `invoice` row; it is converted once and never re-read. |
| **ROT/RUT = two components from `customer_pays`**, tax = total − customer, both ≥ 0 or the RPC raises. | Same rule as `getCustomerShare`, so C5's projection cannot disagree with the kernel by construction. |
| **`receivable_settled` only from allocation, or from a rounding adjustment on an allocated receivable.** Credit, write-off, reclassification → `closed`, silently. | Golden paths 10 and 36. This is the line that decides whether a thank-you SMS goes out; the RPC owns it, not the caller. Probed. |
| **Reclassification is one RPC call producing two events** (−X on the source component, +X on the open counterpart of the same invoice). | Golden path 19 finding; keeps the invoice total invariant inside the transaction. |
| **No magnitude check on `rounding`.** | Policy is C1b and requires the accountant. C4 provides the mechanism; the caller (C5 facade via a C1b policy function) decides. There is deliberately no threshold constant in this migration — the contract test's tolerance scan would catch one anyway. |
| **Idempotency on every mutating RPC**, keyed by the caller's key; a repeat with a different amount raises `*_idempotency_conflict`. | Golden paths 12 and 30. |
| **`financial_kernel_enabled`, `accounting_method`, `invoice.vat_regime` columns added here**, all with today's behaviour as default. No code reads the flag yet. | FK.1 † fields must be populated from day one; the flag is C5's switch. |
| **`invoice_id` FK → `public.invoice`.** | The receivable cannot outlive its document; `invoice` is already in `BEHALLS`, so retention is consistent. |

Lock order (v235 header) holds: every RPC starts with `financial_lock()` (the same advisory key
as `append_financial_event`), then row locks, then appends. Verify column types of `invoice`
against production (`total`, `customer_pays`, `rot_rut_deduction` NUMERIC; `invoice_date`,
`due_date` — the RPC casts `::date` defensively; confirm and drop the casts if they are DATE).

### Scope

```text
handymate-dashboard/sql/v238_financial_receivables.sql                (new; DDL below)
handymate-dashboard/lib/financial-kernel/flags.ts                      (new; isFinancialKernelEnabled)
handymate-dashboard/lib/financial-kernel/receivables/service.ts        (new; issue/adjust wrappers)
handymate-dashboard/lib/financial-kernel/allocations/service.ts        (new; settle/allocate/reverse wrappers)
handymate-dashboard/lib/financial-kernel/events/types.ts               (payload types for receivable_adjusted gain from_component/to_component; no new events)
handymate-dashboard/tests/financial-kernel-receivables-sql.spec.ts    (new; PGlite, real migrations v235+v236+v238)
handymate-dashboard/tests/financial-kernel-golden-path-replay.spec.ts (new; replays fixture scenarios through the RPCs)
handymate-dashboard/lib/account/radera.ts                              (four new tables → BEHALLS)
package.json, .github/workflows/contracts.yml                          (registration after financial-kernel-outbox-sql.spec.ts)
docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md                          (handoff)
```

No caller in `lib/invoices/*`, `lib/fortnox/*`, `app/*`. Nothing customer-visible changes.

### Proposed DDL (implement as written; deviations in the handoff with reasons)

```sql
BEGIN;

-- ── Flags and the two regime fields the events need from day one (FK.1 †) ──
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS financial_kernel_enabled BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.business_config ADD COLUMN IF NOT EXISTS accounting_method TEXT NOT NULL DEFAULT 'accrual';
ALTER TABLE public.business_config DROP CONSTRAINT IF EXISTS business_config_accounting_method_check;
ALTER TABLE public.business_config ADD CONSTRAINT business_config_accounting_method_check CHECK (accounting_method IN ('accrual', 'cash'));
ALTER TABLE public.invoice ADD COLUMN IF NOT EXISTS vat_regime TEXT NOT NULL DEFAULT 'standard';
ALTER TABLE public.invoice DROP CONSTRAINT IF EXISTS invoice_vat_regime_check;
ALTER TABLE public.invoice ADD CONSTRAINT invoice_vat_regime_check CHECK (vat_regime IN ('standard', 'reverse_charge_construction'));

-- ── Receivable components ──
CREATE TABLE IF NOT EXISTS public.financial_receivables (
  id                TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id       TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  invoice_id        TEXT        NOT NULL REFERENCES public.invoice(invoice_id) ON DELETE RESTRICT,
  component         TEXT        NOT NULL CHECK (component IN ('customer', 'tax_authority')),
  owner             TEXT        NOT NULL DEFAULT 'business' CHECK (owner IN ('business', 'factor')),
  origin            TEXT        NOT NULL DEFAULT 'invoice' CHECK (origin IN ('invoice', 'opening_balance')),
  currency          TEXT        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor      BIGINT      NOT NULL CHECK (amount_minor >= 0),
  adjusted_minor    BIGINT      NOT NULL DEFAULT 0,
  allocated_minor   BIGINT      NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  status            TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'settled', 'closed')),
  due_date          DATE        NULL,
  created_event_id  TEXT        NOT NULL,
  settled_event_id  TEXT        NULL,
  settled_at        TIMESTAMPTZ NULL,
  closed_at         TIMESTAMPTZ NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, invoice_id, component),
  FOREIGN KEY (business_id, created_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, settled_event_id) REFERENCES public.financial_events(business_id, id),
  -- outstanding = amount + adjusted - allocated, never negative; exact, no tolerance
  CHECK (amount_minor + adjusted_minor - allocated_minor >= 0),
  CHECK ((status = 'settled') = (settled_event_id IS NOT NULL)),
  CHECK ((status = 'closed') = (closed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_receivables_open ON public.financial_receivables (business_id, status, due_date);

-- ── Payments (money movement) ──
CREATE TABLE IF NOT EXISTS public.financial_payments (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  provider           TEXT        NOT NULL CHECK (provider ~ '^[a-z][a-z0-9_]{1,31}$'),
  provider_ref       TEXT        NULL,
  direction          TEXT        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  method             TEXT        NULL,
  currency           TEXT        NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor       BIGINT      NOT NULL CHECK (amount_minor > 0),
  fee_minor          BIGINT      NULL CHECK (fee_minor IS NULL OR fee_minor >= 0),
  status             TEXT        NOT NULL CHECK (status IN ('pending', 'settled', 'failed', 'cancelled')),
  evidence           TEXT        NULL CHECK (evidence IS NULL OR evidence IN ('provider', 'manual', 'fortnox', 'bank')),
  settled_at         TIMESTAMPTZ NULL,
  allocated_minor    BIGINT      NOT NULL DEFAULT 0 CHECK (allocated_minor >= 0),
  actor_type         TEXT        NOT NULL,
  actor_id           TEXT        NULL,
  idempotency_key    TEXT        NOT NULL,
  correlation_id     TEXT        NOT NULL,
  initiated_event_id TEXT        NOT NULL,
  settled_event_id   TEXT        NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, initiated_event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, settled_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK (allocated_minor <= amount_minor),
  CHECK ((status = 'settled') = (settled_event_id IS NOT NULL)),
  CHECK ((status = 'settled') = (settled_at IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_payments_provider_ref
  ON public.financial_payments (business_id, provider, provider_ref) WHERE provider_ref IS NOT NULL;

-- ── Allocations ──
CREATE TABLE IF NOT EXISTS public.financial_payment_allocations (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL,
  payment_id         TEXT        NOT NULL,
  receivable_id      TEXT        NOT NULL,
  currency           TEXT        NOT NULL,
  amount_minor       BIGINT      NOT NULL CHECK (amount_minor > 0),
  idempotency_key    TEXT        NOT NULL,
  event_id           TEXT        NOT NULL,
  reversed_at        TIMESTAMPTZ NULL,
  reversal_reason    TEXT        NULL,
  reversal_event_id  TEXT        NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, payment_id) REFERENCES public.financial_payments(business_id, id),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id),
  FOREIGN KEY (business_id, reversal_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((reversed_at IS NULL) = (reversal_event_id IS NULL))
);

-- ── Adjustments (credit, write-off, fees, interest, rounding, ownership, reclassification) ──
CREATE TABLE IF NOT EXISTS public.financial_receivable_adjustments (
  id                        TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id               TEXT        NOT NULL,
  receivable_id             TEXT        NOT NULL,
  reason                    TEXT        NOT NULL CHECK (reason IN ('credit', 'write_off', 'dunning_fee', 'interest', 'rounding', 'ownership_transfer', 'reclassification')),
  delta_minor               BIGINT      NOT NULL,
  owner_after               TEXT        NULL CHECK (owner_after IS NULL OR owner_after IN ('business', 'factor')),
  counterpart_receivable_id TEXT        NULL,
  source_type               TEXT        NULL,
  source_id                 TEXT        NULL,
  idempotency_key           TEXT        NOT NULL,
  event_id                  TEXT        NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, idempotency_key),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, counterpart_receivable_id) REFERENCES public.financial_receivables(business_id, id),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id)
);

-- ── RLS: members read, nobody writes except the RPCs (owner) ──
DO $rls$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_receivables', 'financial_payments', 'financial_payment_allocations', 'financial_receivable_adjustments'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', t);
  END LOOP;
END $rls$;

-- ── Private helpers ──
CREATE OR REPLACE FUNCTION public.financial_lock(p_business_id TEXT) RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_business_id IS NULL OR p_business_id = '' THEN RAISE EXCEPTION 'financial_business_required' USING ERRCODE = 'check_violation'; END IF;
  -- Lock order rule 1 (v235 header): business lock before any row lock.
  PERFORM pg_advisory_xact_lock(hashtext('financial:' || p_business_id));
END $fn$;

-- Appends through the C2 RPC so every event carries the same envelope rules. Returns the event id.
CREATE OR REPLACE FUNCTION public.financial_append(
  p_business_id TEXT, p_event_type TEXT, p_occurred_at TIMESTAMPTZ, p_effective_date DATE,
  p_source_type TEXT, p_source_id TEXT, p_correlation_id TEXT, p_causation_id TEXT, p_idempotency_key TEXT,
  p_currency TEXT, p_amount_minor BIGINT, p_payload JSONB, p_actor_type TEXT, p_actor_id TEXT
) RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_id TEXT;
BEGIN
  SELECT r.id INTO v_id FROM public.append_financial_event(
    p_business_id, p_event_type, 1, p_occurred_at, p_effective_date, p_source_type, p_source_id,
    p_correlation_id, p_causation_id, p_idempotency_key, p_currency, p_amount_minor, p_payload, p_actor_type, p_actor_id) r;
  RETURN v_id;
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_receivable_json(r public.financial_receivables) RETURNS JSONB
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT jsonb_build_object(
    'id', r.id, 'invoice_id', r.invoice_id, 'component', r.component, 'owner', r.owner, 'origin', r.origin,
    'currency', r.currency, 'amount_minor', r.amount_minor::text, 'adjusted_minor', r.adjusted_minor::text,
    'allocated_minor', r.allocated_minor::text, 'outstanding_minor', (r.amount_minor + r.adjusted_minor - r.allocated_minor)::text,
    'status', r.status, 'due_date', r.due_date, 'settled_at', r.settled_at)
$fn$;

-- ── RPC 1: issue receivables for an invoice (C5 calls it when an invoice is sent/issued) ──
CREATE OR REPLACE FUNCTION public.issue_invoice_receivables(
  p_business_id TEXT, p_invoice_id TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE inv RECORD; v_method TEXT; v_total BIGINT; v_customer BIGINT; v_tax BIGINT;
        v_issued TEXT; v_ev TEXT; v_corr TEXT; existing JSONB; r public.financial_receivables%ROWTYPE;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT i.invoice_id, i.invoice_number, i.customer_id, i.project_id, i.total, i.customer_pays, i.rot_rut_deduction,
         i.rot_rut_type, i.vat_regime, i.invoice_date::date AS invoice_date, i.due_date::date AS due_date
    INTO inv FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_invoice_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF inv.total IS NULL THEN RAISE EXCEPTION 'financial_invoice_total_required' USING ERRCODE = 'check_violation'; END IF;

  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component) INTO existing
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  IF existing IS NOT NULL THEN
    RETURN jsonb_build_object('invoice_id', p_invoice_id, 'inserted', false, 'receivables', existing);
  END IF;

  SELECT b.accounting_method INTO v_method FROM public.business_config b WHERE b.business_id = p_business_id;
  -- Legacy NUMERIC kr -> exact öre at the boundary. round() is half away from zero = Money HALF_UP.
  v_total := round(inv.total * 100)::bigint;
  IF inv.rot_rut_type IN ('rot', 'rut') THEN
    v_customer := round(COALESCE(inv.customer_pays, inv.total - COALESCE(inv.rot_rut_deduction, 0)) * 100)::bigint;
    v_tax := v_total - v_customer;
    IF v_tax < 0 OR v_customer < 0 THEN RAISE EXCEPTION 'financial_invoice_split_invalid' USING ERRCODE = 'check_violation'; END IF;
  ELSE
    v_customer := v_total; v_tax := 0;
  END IF;
  v_corr := 'fin_invoice_' || p_invoice_id;

  v_issued := public.financial_append(p_business_id, 'invoice_issued', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, NULL,
    'invoice_issued:invoice:' || p_invoice_id, 'SEK', v_total,
    jsonb_build_object('invoice_id', p_invoice_id, 'invoice_number', inv.invoice_number, 'customer_id', inv.customer_id,
      'project_id', inv.project_id, 'currency', 'SEK', 'total_minor', v_total, 'vat_regime', inv.vat_regime,
      'accounting_method', v_method, 'issued_date', inv.invoice_date, 'due_date', inv.due_date,
      'tax_reduction', CASE WHEN inv.rot_rut_type IN ('rot', 'rut') THEN inv.rot_rut_type END),
    p_actor_type, p_actor_id);

  v_ev := public.financial_append(p_business_id, 'receivable_created', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, v_issued,
    'receivable_created:invoice:' || p_invoice_id || ':customer', 'SEK', v_customer,
    jsonb_build_object('invoice_id', p_invoice_id, 'component', 'customer', 'owner', 'business', 'currency', 'SEK', 'amount_minor', v_customer, 'due_date', inv.due_date),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_receivables (business_id, invoice_id, component, currency, amount_minor, due_date, created_event_id)
    VALUES (p_business_id, p_invoice_id, 'customer', 'SEK', v_customer, inv.due_date, v_ev);

  IF v_tax > 0 THEN
    v_ev := public.financial_append(p_business_id, 'receivable_created', now(), inv.invoice_date, 'invoice', p_invoice_id, v_corr, v_issued,
      'receivable_created:invoice:' || p_invoice_id || ':tax_authority', 'SEK', v_tax,
      jsonb_build_object('invoice_id', p_invoice_id, 'component', 'tax_authority', 'owner', 'business', 'currency', 'SEK', 'amount_minor', v_tax, 'due_date', inv.due_date),
      p_actor_type, p_actor_id);
    INSERT INTO public.financial_receivables (business_id, invoice_id, component, currency, amount_minor, due_date, created_event_id)
      VALUES (p_business_id, p_invoice_id, 'tax_authority', 'SEK', v_tax, inv.due_date, v_ev);
  END IF;

  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component) INTO existing
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  RETURN jsonb_build_object('invoice_id', p_invoice_id, 'inserted', true, 'receivables', existing);
END $fn$;

-- ── RPC 2: a settled payment (manual, Fortnox import, Skatteverket payout; later PSP) ──
CREATE OR REPLACE FUNCTION public.record_payment_settlement(
  p_business_id TEXT, p_provider TEXT, p_provider_ref TEXT, p_direction TEXT, p_method TEXT,
  p_currency TEXT, p_amount_minor BIGINT, p_fee_minor BIGINT, p_evidence TEXT, p_settled_at TIMESTAMPTZ,
  p_correlation_id TEXT, p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE existing public.financial_payments%ROWTYPE; v_id TEXT; v_corr TEXT; v_init TEXT; v_settled TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO existing FROM public.financial_payments p WHERE p.business_id = p_business_id AND p.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.amount_minor <> p_amount_minor OR existing.currency <> p_currency OR existing.provider <> p_provider THEN
      RAISE EXCEPTION 'financial_payment_idempotency_conflict' USING ERRCODE = 'unique_violation', DETAIL = existing.id;
    END IF;
    RETURN jsonb_build_object('payment_id', existing.id, 'inserted', false, 'amount_minor', existing.amount_minor::text,
      'unallocated_minor', (existing.amount_minor - existing.allocated_minor)::text, 'status', existing.status);
  END IF;
  v_id := gen_random_uuid()::TEXT;
  v_corr := COALESCE(p_correlation_id, 'fin_payment_' || v_id);
  v_init := public.financial_append(p_business_id, 'payment_initiated', COALESCE(p_settled_at, now()), p_settled_at::date, 'payment', v_id, v_corr, NULL,
    'payment_initiated:' || p_provider || ':' || p_idempotency_key, p_currency, p_amount_minor,
    jsonb_build_object('payment_id', v_id, 'provider', p_provider, 'provider_ref', p_provider_ref, 'direction', p_direction, 'currency', p_currency, 'amount_minor', p_amount_minor),
    p_actor_type, p_actor_id);
  v_settled := public.financial_append(p_business_id, 'payment_settled', COALESCE(p_settled_at, now()), p_settled_at::date, 'payment', v_id, v_corr, v_init,
    'payment_settled:' || p_provider || ':' || p_idempotency_key, p_currency, p_amount_minor,
    jsonb_build_object('payment_id', v_id, 'currency', p_currency, 'amount_minor', p_amount_minor, 'fee_minor', p_fee_minor, 'settled_at', COALESCE(p_settled_at, now()), 'evidence', p_evidence),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_payments (id, business_id, provider, provider_ref, direction, method, currency, amount_minor, fee_minor, status, evidence,
      settled_at, actor_type, actor_id, idempotency_key, correlation_id, initiated_event_id, settled_event_id)
    VALUES (v_id, p_business_id, p_provider, p_provider_ref, p_direction, p_method, p_currency, p_amount_minor, p_fee_minor, 'settled', p_evidence,
      COALESCE(p_settled_at, now()), p_actor_type, p_actor_id, p_idempotency_key, v_corr, v_init, v_settled);
  RETURN jsonb_build_object('payment_id', v_id, 'inserted', true, 'amount_minor', p_amount_minor::text, 'unallocated_minor', p_amount_minor::text, 'status', 'settled');
END $fn$;

-- ── RPC 3: allocate part of a settled payment to one receivable component ──
CREATE OR REPLACE FUNCTION public.allocate_payment(
  p_business_id TEXT, p_payment_id TEXT, p_receivable_id TEXT, p_amount_minor BIGINT,
  p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE pay public.financial_payments%ROWTYPE; rec public.financial_receivables%ROWTYPE; al public.financial_payment_allocations%ROWTYPE;
        v_corr TEXT; v_ev TEXT; v_settled_ev TEXT; v_outstanding BIGINT; v_settled BOOLEAN := false;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO al FROM public.financial_payment_allocations a WHERE a.business_id = p_business_id AND a.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = al.receivable_id;
    RETURN jsonb_build_object('allocation_id', al.id, 'inserted', false, 'receivable_settled', rec.status = 'settled', 'component', rec.component,
      'outstanding_minor', (rec.amount_minor + rec.adjusted_minor - rec.allocated_minor)::text);
  END IF;
  IF p_amount_minor IS NULL OR p_amount_minor <= 0 THEN RAISE EXCEPTION 'financial_allocation_amount_invalid' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO pay FROM public.financial_payments p WHERE p.business_id = p_business_id AND p.id = p_payment_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_payment_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF pay.status <> 'settled' THEN RAISE EXCEPTION 'financial_payment_not_settled' USING ERRCODE = 'check_violation'; END IF;
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'financial_receivable_not_open' USING ERRCODE = 'check_violation'; END IF;
  IF pay.currency <> rec.currency THEN RAISE EXCEPTION 'financial_currency_mismatch' USING ERRCODE = 'check_violation'; END IF;
  IF p_amount_minor > pay.amount_minor - pay.allocated_minor THEN RAISE EXCEPTION 'financial_allocation_exceeds_payment' USING ERRCODE = 'check_violation'; END IF;
  v_outstanding := rec.amount_minor + rec.adjusted_minor - rec.allocated_minor;
  IF p_amount_minor > v_outstanding THEN RAISE EXCEPTION 'financial_allocation_exceeds_receivable' USING ERRCODE = 'check_violation'; END IF;

  v_corr := 'fin_invoice_' || rec.invoice_id;
  al.id := gen_random_uuid()::TEXT;
  v_ev := public.financial_append(p_business_id, 'payment_allocated', now(), pay.settled_at::date, 'allocation', al.id, v_corr, pay.settled_event_id,
    'payment_allocated:' || p_idempotency_key, rec.currency, p_amount_minor,
    jsonb_build_object('allocation_id', al.id, 'payment_id', pay.id, 'receivable_id', rec.id, 'currency', rec.currency, 'amount_minor', p_amount_minor),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_payment_allocations (id, business_id, payment_id, receivable_id, currency, amount_minor, idempotency_key, event_id)
    VALUES (al.id, p_business_id, pay.id, rec.id, rec.currency, p_amount_minor, p_idempotency_key, v_ev);
  UPDATE public.financial_payments SET allocated_minor = allocated_minor + p_amount_minor WHERE id = pay.id;
  UPDATE public.financial_receivables SET allocated_minor = allocated_minor + p_amount_minor WHERE id = rec.id;
  v_outstanding := v_outstanding - p_amount_minor;
  IF v_outstanding = 0 THEN
    v_settled := true;
    v_settled_ev := public.financial_append(p_business_id, 'receivable_settled', now(), pay.settled_at::date, 'receivable', rec.id, v_corr, v_ev,
      'receivable_settled:' || rec.id, NULL, NULL,
      jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'component', rec.component, 'settled_at', now()),
      p_actor_type, p_actor_id);
    UPDATE public.financial_receivables SET status = 'settled', settled_at = now(), settled_event_id = v_settled_ev WHERE id = rec.id;
  END IF;
  RETURN jsonb_build_object('allocation_id', al.id, 'inserted', true, 'receivable_settled', v_settled, 'component', rec.component,
    'outstanding_minor', v_outstanding::text, 'payment_unallocated_minor', (pay.amount_minor - pay.allocated_minor - p_amount_minor)::text);
END $fn$;

-- ── RPC 4: adjust a receivable (never touches allocations; closes at zero without a settlement) ──
CREATE OR REPLACE FUNCTION public.adjust_receivable(
  p_business_id TEXT, p_receivable_id TEXT, p_reason TEXT, p_delta_minor BIGINT, p_owner_after TEXT,
  p_source_type TEXT, p_source_id TEXT, p_idempotency_key TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE rec public.financial_receivables%ROWTYPE; sib public.financial_receivables%ROWTYPE; adj public.financial_receivable_adjustments%ROWTYPE;
        v_corr TEXT; v_ev TEXT; v_ev2 TEXT; v_outstanding BIGINT; v_sib_id TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO adj FROM public.financial_receivable_adjustments a WHERE a.business_id = p_business_id AND a.idempotency_key = p_idempotency_key;
  IF FOUND THEN
    SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = adj.receivable_id;
    RETURN jsonb_build_object('adjustment_id', adj.id, 'inserted', false, 'receivable', public.financial_receivable_json(rec));
  END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF rec.status <> 'open' THEN RAISE EXCEPTION 'financial_receivable_not_open' USING ERRCODE = 'check_violation'; END IF;
  CASE p_reason
    WHEN 'credit', 'write_off' THEN IF p_delta_minor >= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'dunning_fee', 'interest' THEN IF p_delta_minor <= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'rounding' THEN IF p_delta_minor = 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
      -- Magnitude is policy (C1b), deliberately not checked here. Callers apply the country pack's policy first.
    WHEN 'ownership_transfer' THEN
      IF p_delta_minor <> 0 OR p_owner_after IS NULL OR p_owner_after = rec.owner THEN RAISE EXCEPTION 'financial_ownership_transfer_invalid' USING ERRCODE = 'check_violation'; END IF;
    WHEN 'reclassification' THEN
      IF p_delta_minor >= 0 THEN RAISE EXCEPTION 'financial_adjustment_sign' USING ERRCODE = 'check_violation'; END IF;
      SELECT * INTO sib FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = rec.invoice_id AND x.component <> rec.component FOR UPDATE;
      IF NOT FOUND OR sib.status <> 'open' THEN RAISE EXCEPTION 'financial_reclassification_no_open_counterpart' USING ERRCODE = 'check_violation'; END IF;
    ELSE RAISE EXCEPTION 'financial_adjustment_reason_invalid' USING ERRCODE = 'check_violation';
  END CASE;
  v_outstanding := rec.amount_minor + rec.adjusted_minor - rec.allocated_minor + p_delta_minor;
  IF v_outstanding < 0 THEN RAISE EXCEPTION 'financial_adjustment_exceeds_outstanding' USING ERRCODE = 'check_violation'; END IF;

  v_corr := 'fin_invoice_' || rec.invoice_id;
  adj.id := gen_random_uuid()::TEXT;
  v_ev := public.financial_append(p_business_id, 'receivable_adjusted', now(), now()::date, COALESCE(p_source_type, 'receivable'), COALESCE(p_source_id, rec.id), v_corr, rec.created_event_id,
    'receivable_adjusted:' || p_idempotency_key, rec.currency, p_delta_minor,
    jsonb_build_object('receivable_id', rec.id, 'reason', p_reason, 'delta_minor', p_delta_minor, 'owner_after', p_owner_after,
      'from_component', CASE WHEN p_reason = 'reclassification' THEN rec.component END, 'to_component', CASE WHEN p_reason = 'reclassification' THEN sib.component END),
    p_actor_type, p_actor_id);
  INSERT INTO public.financial_receivable_adjustments (id, business_id, receivable_id, reason, delta_minor, owner_after, counterpart_receivable_id, source_type, source_id, idempotency_key, event_id)
    VALUES (adj.id, p_business_id, rec.id, p_reason, p_delta_minor, p_owner_after, sib.id, p_source_type, p_source_id, p_idempotency_key, v_ev);
  -- Zero outstanding after an adjustment: a ROUNDING adjustment on a receivable that has an
  -- allocation completes a payment (golden path 36) and therefore SETTLES it — the bridge fires.
  -- Every other reason (credit, write-off, reclassification) CLOSES it silently: no customer
  -- paid, no receivable_settled, no payment_received (golden path 10).
  IF v_outstanding = 0 AND p_reason = 'rounding' AND rec.allocated_minor > 0 THEN
    v_ev2 := public.financial_append(p_business_id, 'receivable_settled', now(), now()::date, 'receivable', rec.id, v_corr, v_ev,
      'receivable_settled:' || rec.id, NULL, NULL,
      jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'component', rec.component, 'settled_at', now()),
      p_actor_type, p_actor_id);
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor + p_delta_minor,
      status = 'settled', settled_at = now(), settled_event_id = v_ev2 WHERE id = rec.id;
  ELSE
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor + p_delta_minor,
      owner = COALESCE(p_owner_after, owner),
      status = CASE WHEN v_outstanding = 0 THEN 'closed' ELSE status END,
      closed_at = CASE WHEN v_outstanding = 0 THEN now() ELSE closed_at END
     WHERE id = rec.id;
  END IF;

  IF p_reason = 'reclassification' THEN
    v_ev2 := public.financial_append(p_business_id, 'receivable_adjusted', now(), now()::date, COALESCE(p_source_type, 'receivable'), COALESCE(p_source_id, rec.id), v_corr, v_ev,
      'receivable_adjusted:' || p_idempotency_key || ':counterpart', rec.currency, -p_delta_minor,
      jsonb_build_object('receivable_id', sib.id, 'reason', 'reclassification', 'delta_minor', -p_delta_minor, 'from_component', rec.component, 'to_component', sib.component),
      p_actor_type, p_actor_id);
    INSERT INTO public.financial_receivable_adjustments (business_id, receivable_id, reason, delta_minor, counterpart_receivable_id, source_type, source_id, idempotency_key, event_id)
      VALUES (p_business_id, sib.id, 'reclassification', -p_delta_minor, rec.id, p_source_type, p_source_id, p_idempotency_key || ':counterpart', v_ev2);
    UPDATE public.financial_receivables SET adjusted_minor = adjusted_minor - p_delta_minor WHERE id = sib.id;
  END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.id = rec.id;
  RETURN jsonb_build_object('adjustment_id', adj.id, 'inserted', true, 'receivable_settled', rec.status = 'settled', 'component', rec.component,
    'receivable', public.financial_receivable_json(rec));
END $fn$;

-- ── RPC 5: reverse an allocation (misallocation, refund); reopens a settled receivable ──
CREATE OR REPLACE FUNCTION public.reverse_payment_allocation(
  p_business_id TEXT, p_allocation_id TEXT, p_reason TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE al public.financial_payment_allocations%ROWTYPE; rec public.financial_receivables%ROWTYPE; v_ev TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'financial_reversal_requires_reason' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO al FROM public.financial_payment_allocations a WHERE a.business_id = p_business_id AND a.id = p_allocation_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_allocation_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF al.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('allocation_id', al.id, 'inserted', false, 'reversed_at', al.reversed_at); END IF;
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = al.receivable_id FOR UPDATE;
  IF rec.status = 'closed' THEN RAISE EXCEPTION 'financial_receivable_closed' USING ERRCODE = 'check_violation'; END IF;
  v_ev := public.financial_append(p_business_id, 'payment_allocation_reversed', now(), now()::date, 'allocation', al.id, 'fin_invoice_' || rec.invoice_id, al.event_id,
    'payment_allocation_reversed:' || al.id, al.currency, -al.amount_minor,
    jsonb_build_object('allocation_id', al.id, 'reason', p_reason), p_actor_type, p_actor_id);
  UPDATE public.financial_payment_allocations SET reversed_at = now(), reversal_reason = p_reason, reversal_event_id = v_ev WHERE id = al.id;
  UPDATE public.financial_payments SET allocated_minor = allocated_minor - al.amount_minor WHERE id = al.payment_id;
  UPDATE public.financial_receivables SET allocated_minor = allocated_minor - al.amount_minor, status = 'open', settled_at = NULL, settled_event_id = NULL WHERE id = rec.id;
  RETURN jsonb_build_object('allocation_id', al.id, 'inserted', true, 'receivable_reopened', rec.status = 'settled');
END $fn$;

REVOKE ALL ON FUNCTION public.financial_lock(TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_append(TEXT, TEXT, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_receivable_json(public.financial_receivables) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.issue_invoice_receivables(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_payment_settlement(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.allocate_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.adjust_receivable(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reverse_payment_allocation(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_invoice_receivables(TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_payment_settlement(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, BIGINT, TEXT, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.allocate_payment(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.adjust_receivable(TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.reverse_payment_allocation(TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
```

**Verified 2026-09-14 in PGlite on v235 + v236 with an `invoice` fixture, 32 probes,** including
replays of golden paths 34, 10, 36, 19, 7 and 30 whose resulting `financial_events` sequences
match the fixture's event lists exactly (e.g. GP34:
`invoice_issued > receivable_created:customer > receivable_created:tax_authority > payment_initiated >
payment_settled > payment_allocated > receivable_settled:customer > payment_initiated > payment_settled >
payment_allocated > receivable_settled:tax_authority`). Also probed: idempotent re-issue and
re-allocate, payment idempotency conflict, over-allocation against payment and against receivable,
cross-tenant receivable and wrong-business invoice, adjustment on a closed receivable, reversal
reopening a settled receivable and restoring the payment's unallocated amount, 1234.56 → 123456
öre, flag defaults, `authenticated` denied on RPCs, `service_role` denied direct INSERT.

### TypeScript contract (fixed — internals are yours)

```ts
// flags.ts
export async function isFinancialKernelEnabled(db: KernelDb, businessId: string): Promise<boolean>
// reads business_config.financial_kernel_enabled through an RPC-free select is NOT allowed here (KernelDb has no table API):
// add a tiny SECURITY DEFINER `financial_kernel_flags(p_business_id)` RPC returning {financial_kernel_enabled, accounting_method}.

// receivables/service.ts — thin typed wrappers; all amounts as Money; all ids strings
export interface ReceivableView { id: string; invoiceId: string; component: 'customer' | 'tax_authority'; owner: 'business' | 'factor';
  origin: 'invoice' | 'opening_balance'; amount: Money; adjusted: Money; allocated: Money; outstanding: Money;
  status: 'open' | 'settled' | 'closed'; dueDate?: string; settledAt?: string }
export function issueInvoiceReceivables(db, businessId, invoiceId, actor): Promise<{ inserted: boolean; receivables: ReceivableView[] }>
export function adjustReceivable(db, businessId, input: { receivableId; reason; delta: Money; ownerAfter?; source?: { type; id }; idempotencyKey; actor }): Promise<{ inserted: boolean; receivableSettled: boolean; component; receivable: ReceivableView }>

// allocations/service.ts
export function recordPaymentSettlement(db, businessId, input: { provider; providerRef?; direction; method?; amount: Money; fee?: Money; evidence; settledAt: string; correlationId?; idempotencyKey; actor }): Promise<{ inserted: boolean; paymentId: string; unallocated: Money }>
export function allocatePayment(db, businessId, input: { paymentId; receivableId; amount: Money; idempotencyKey; actor }): Promise<{ inserted: boolean; allocationId: string; receivableSettled: boolean; component; outstanding: Money; paymentUnallocated: Money }>
export function reversePaymentAllocation(db, businessId, input: { allocationId; reason; actor }): Promise<{ inserted: boolean; receivableReopened: boolean }>
```

All wrappers parse `*_minor` strings with `money(BigInt(s), currency)`; the C2 source-scan rule
(no `Number(` on minor amounts) applies to every new file.

### Invariants (tests first)

1. **Golden-path replay.** For each of 1, 4, 5, 7, 10, 12, 19, 30, 34, 36, 37 in
   `tests/financial-kernel/golden-paths.ts`: drive the scenario's `when` through the RPCs and
   assert (a) the `financial_events` type sequence for the correlation equals the fixture's
   `events[].t` filtered to C4-produced types, (b) each receivable's final `outstanding` equals
   the fixture's `invoice.outstanding`, (c) the count of `receivable_settled{component:'customer'}`
   equals `automation.paymentReceived`. This is the acceptance test of the package.
2. ROT: two components, exact öre, sum equals `round(total*100)`; non-ROT: one component.
3. `issue_invoice_receivables` twice → `inserted=false`, same ids; a wrong-business invoice raises.
4. Allocation exceeding the payment's unallocated amount or the receivable's outstanding raises;
   no partial write (row counts unchanged, checked after the rollback-to-savepoint).
5. Currency mismatch raises. Cross-tenant payment/receivable pair raises `not_found`, never leaks.
6. Full allocation → `settled` + `receivable_settled`; partial → `open`, no event.
7. `rounding` to zero on an allocated receivable → `settled` + event; `credit`/`write_off`/
   `reclassification` to zero → `closed`, no event; any adjustment on a non-open receivable raises;
   sign rules per reason enforced; `ownership_transfer` requires a different `owner_after`.
8. Reclassification conserves the invoice total across components and emits two events with
   `from_component`/`to_component`.
9. Reversal restores both sums, reopens a settled receivable, is idempotent, requires a reason,
   and raises on a closed receivable.
10. Payment idempotency: same key → same payment, `inserted=false`; different amount → conflict.
11. `financial_kernel_enabled` defaults false for every existing row; `accounting_method`
    defaults `'accrual'`; `invoice.vat_regime` defaults `'standard'`; the CHECKs reject other values.
12. Grants: `anon`/`authenticated` cannot execute any RPC; `authenticated` members can SELECT their
    own business's rows only (real `is_business_member`); `service_role` cannot INSERT/UPDATE
    any of the four tables directly; the helpers `financial_lock`, `financial_append` are not
    callable by `service_role`.
13. Source scan: the migration contains no `UPDATE public.invoice`, no tolerance constant, and
    every RPC's first statement after validation is `financial_lock`.

### Acceptance (orchestration §5 C4 + §9)

All kernel suites green; `tsc` clean; the replay spec green in `test:contracts`; diff touches only
Scope files; no production caller; flag default preserves behaviour; handoff filled in.

### Not in this package

Any caller (C5). Payables (C4s). Opening balances (C4b). Rounding policy (C1b). Refunds
(`payment_refunded`, C7). The reminder paths' collapse onto `adjust_receivable` (C14, after C5).

### Handoff back

Orchestration §7 block under §2, same PR. Claude reviews against §6 A, B, C and E.

---

## 4. Queued after C4 — sketch only, briefed when C4 merges

**C5 brief requirement from PR #54 review (MEDIUM):** before firing any automation,
the bridge must persist its own payment_received idempotency marker per `receivable_id` (C4 review supersedes the C3 per-event proposal). Database effects,
the marker and acknowledgement must share a transaction. Test lease expiry mid-handler
with a second worker and prove that no duplicate thank-you SMS is dispatched. The delivery
ledger's `delivered_at` is set too late to guard the side effect. For external sends,
define durable dispatch/retry semantics as well: a marker persisted before a crash must
not suppress a notification that was never sent. The requirement is also pinned in
`bridge-automation.ts`; implementing the mapping remains C5, not C3.

**C4s — payables minimal core.** `financial_payables` mirroring receivables (one component),
`approve_supplier_invoice` → `supplier_invoice_approved` + `payable_created`; supplier payments
are `record_payment_settlement(direction='outbound')` + `allocate_payment` against the payable,
emitting `supplier_payment_settled` and `payable_settled`. Both today's writers of
`supplier_invoices.status='paid'` (the Fortnox supplier sync and `PATCH /api/supplier-invoices`)
become callers in C5s. Golden path 20 is the acceptance replay.

**C5 — `applyInvoicePayment()` facade.** Behind `financial_kernel_enabled`: `send-invoice` calls
`issue_invoice_receivables`; every payment source calls `record_payment_settlement` +
`allocate_payment` and derives the legacy transition from the RPC's `{receivable_settled,
component}`: customer settled → `to_customer_paid` (ROT) or `to_paid`; tax settled → `settled`;
neither → `none`. The bridge maps `receivable_settled{customer}` → `payment_received` with its own
idempotency marker (C3 review requirement). Decisions C5 must take, from tracks B and C: whether
the non-ROT partial-payment quirk (`to_paid` on any amount) is preserved for non-kernel
businesses; moving the thank-you SMS from `[id]/status/route.ts` into the bridge; stopping the
Fortnox `invoice_number` overwrite before `invoice_issued` fires; how the rounding policy (C1b)
is invoked before `adjust_receivable{rounding}`.

**Open-source inputs.** Before C4b, C9, C10, C11, C13 or C14 is briefed, read
`OPEN_SOURCE_ACCOUNTING_LANDSCAPE.md` §5: it names the reference data (Odoo core `l10n_se`,
LGPL), the official schemas (HUS v6, camt.053/054, SIE 4/5) and the licence rules (AGPL and
GPL code is read, never copied).

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
| MEDIUM | `toLegacyNumber` silently changes digits above `Number.MAX_SAFE_INTEGER` minor units (9007199254740993 öre → `90071992547409.94`). "Lossy by design" covers *bigint → number*, not *different digits*. Throw `RangeError` beyond the safe range and add the test. | resolved in PR #49: symmetric safe-range guard and boundary regression test (red before fix, green after) |
| LOW | `HALF_UP` is ties-away-from-zero, so a credit note rounds symmetrically with its invoice. Correct as mechanism; C1b must state the policy for negative amounts explicitly rather than inherit it. | note for C1b |
| LOW | Callers will hold VAT rates as `25` and ROT as `30`; a `ratioFromPercent` helper belongs in the first caller package (C4), not here. | note for C4 |
| accepted | `fromLegacyNumber` interprets the number's shortest decimal representation (so `1.005` → `1.01` under HALF_UP, `0.1 + 0.2` → `0.30`). That is the right reading of a legacy `NUMERIC` column that passed through a JS number. Documented in the source. | — |
| accepted | `equals`/`compare` throw on currency mismatch rather than returning `false`. Brief-mandated; a filter across currencies must group by currency first. | — |

### C3 — outbox, leases, ordered ack (PR #54), Claude review 2026-09-14, orchestration §6 A + B + C

Verified locally on `codex/financial-kernel-c3` head `671a831`: 12 outbox tests plus contract,
C2, schema and account-deletion suites green (64); the three real-Postgres tests read and
matched to their claims (advisory wait before seq allocation, single owner in a claim race,
wall-clock lease expiry). No BLOCKER, no HIGH. Codex's deviations (attempt registered before
the handler with `attempt_token`; `failures` separate from `attempts`; fail drops the lease;
`clock_timestamp()`; status behind a text-returning RPC) are all improvements over the brief.

| Sev | Finding | Status |
|---|---|---|
| MEDIUM | A lease expiring mid-handler makes the next worker re-run the handler; the delivery ledger cannot protect the *side effect* because `delivered_at` is set only at ack. Requirement for C5: the bridge writes its own idempotency marker per `eventId` before firing anything, in the same transaction as ack when it writes to the database. Put the requirement in `bridge-automation.ts` and the C5 brief. | raised on PR #54; C5 requirement |
| LOW | Handlers get no `AbortSignal`; on timeout they keep running in the background. | note for C5 |
| LOW | `claim` counts the whole backlog to test emptiness; `EXISTS` suffices. | note |
| LOW | PR #53 edits the same lines in `package.json`, `contracts.yml` and this file; merge #53 first, then bring main into #54. | process |

### C3 brief (first version), Codex review 2026-09-13 — two BLOCKERs, both accepted

Codex reviewed Claude's C3 brief before implementing and reproduced two defects with runnable
tests: (1) `claim_financial_events` relied on a row lock that is released when the RPC returns,
so two workers could process the same batch; (2) `ack_financial_event` could advance the cursor
past unhandled events. Both were Claude's errors in the proposal. The brief in §3 is rewritten:
leases instead of locks, database-enforced ack order, delivery timestamps, a status view, and
lease release. Corrected DDL re-verified in PGlite (24 probes). Review-of-the-reviewer is the
orchestration working as intended (§1: parallel reasoning, serialised ownership).

| Sev | Finding | Status |
|---|---|---|
| BLOCKER | Row lock does not survive the RPC; batch can be double-claimed. | fixed in the brief (lease) |
| BLOCKER | Ack can skip events. | fixed in the brief (ordered ack enforced in SQL) |
| MEDIUM | Retry log lacked attempt timestamps; halted consumers had no reporting surface. | fixed (`first/last_attempt_at`, `financial_consumer_status`) |

### C2 — `financial_events` (PR #50), Claude review 2026-09-13, orchestration §6 A + C

Verified locally on `codex/financial-kernel-c2` head `1ec1c34`: the 13 C2 tests plus contract,
Money, schema and account-deletion suites green (64). Two probes beyond the suite: the migration
deployed by a role without BYPASSRLS that owns the objects, then the RPC called as
`service_role`; and `to_jsonb` of the RPC result followed by `JSON.parse`. Codex's two DDL
deviations (service_role REVOKE ALL + GRANT SELECT; `financial_events` in `BEHALLS`) are correct.
No BLOCKER.

| Sev | Finding | Status |
|---|---|---|
| HIGH | `FORCE ROW LEVEL SECURITY` makes the only write path depend on the deploying role having BYPASSRLS. Proven: with a NOBYPASSRLS owner the append fails with an RLS violation; without FORCE it succeeds. The superuser PGlite harness cannot see this. Origin: the Claude DDL proposal, not Codex. Fix: drop FORCE, document why, add the non-bypass owner probe as a test. | raised on PR #50, fix before merge |
| MEDIUM | RPC returns BIGINT inside a composite; PostgREST serialises it as a JSON number and `JSON.parse` loses digits above 2^53 (proven: …993 → …992). Return a flat row with `seq` and `amount_minor` as TEXT now, while the migration is unapplied. Any future PostgREST read of the table must cast the same two columns. | raised on PR #50 |
| MEDIUM | Idempotency replay compares type/payload/amount/currency only; a replay with a different `correlation_id`, source, `causation_id` or `effective_date` silently returns the original. Add those four to the comparison; deliberately exclude `occurred_at` and actor. | raised on PR #50 |
| accepted | Sequence gaps on failed inserts; single-session PGlite cannot prove concurrent commit order (C3 must, with the Postgres CI service); `hashtext` collisions only over-serialise; account deletion soft-deletes `business_config` so the RESTRICT FK does not fire on that path, track G remains open. | — |

---

### C2 — `financial_events` (PR #50), Claude review 2026-09-13, orchestration §6 A + C

Verified locally on `codex/financial-kernel-c2` head `1ec1c34`: the 13 C2 tests plus contract,
Money, schema and account-deletion suites green (64). Two probes beyond the suite: the migration
deployed by a role without BYPASSRLS that owns the objects, then the RPC called as
`service_role`; and `to_jsonb` of the RPC result followed by `JSON.parse`. Codex's two DDL
deviations (service_role REVOKE ALL + GRANT SELECT; `financial_events` in `BEHALLS`) are correct.
No BLOCKER.

| Sev | Finding | Status |
|---|---|---|
| HIGH | `FORCE ROW LEVEL SECURITY` makes the only write path depend on the deploying role having BYPASSRLS. Proven: with a NOBYPASSRLS owner the append fails with an RLS violation; without FORCE it succeeds. The superuser PGlite harness cannot see this. Origin: the Claude DDL proposal, not Codex. Fix: drop FORCE, document why, add the non-bypass owner probe as a test. | resolved in PR #50: non-bypass deployer owns the tested objects; FORCE removed |
| MEDIUM | RPC returns BIGINT inside a composite; PostgREST serialises it as a JSON number and `JSON.parse` loses digits above 2^53 (proven: …993 → …992). Return a flat row with `seq` and `amount_minor` as TEXT now, while the migration is unapplied. Any future PostgREST read of the table must cast the same two columns. | resolved in PR #50 with regression tests |
| MEDIUM | Idempotency replay compares type/payload/amount/currency only; a replay with a different `correlation_id`, source, `causation_id` or `effective_date` silently returns the original. Add those four to the comparison; deliberately exclude `occurred_at` and actor. | resolved in PR #50 with regression tests |
| accepted | Sequence gaps on failed inserts; single-session PGlite cannot prove concurrent commit order (C3 must, with the Postgres CI service); `hashtext` collisions only over-serialise; account deletion soft-deletes `business_config` so the RESTRICT FK does not fire on that path, track G remains open. | — |


## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created with C0 handoff and C1 brief. | Package C0 |
| 2026-09-13 | Folded in the 2026-09-12 decisions (shadow Level 1, obligation boundary, R0 manual rulebook track); noted PR #12 as C4 input; added §5 review record with the C1 review. | PR #47, C1 review |
| 2026-09-13 | C1 marked done (PR #49). Claude track A delivered as the C2 brief: proposed DDL, RLS, immutability, append RPC, lock order, migration risk. C3 sketched. The C1 brief is retired to git history; its handoff and review stand in §2 and §5. | Package C2 prep |
| 2026-09-13 | Tracks C and D delivered: executable golden paths + SE ledger review. | Tracks C, D |
| 2026-09-13 | Track B delivered as `FINANCIAL_KERNEL_CALL_SITE_MAP.md`; board updated. | Track B |
| 2026-09-13 | C3 brief written (outbox = events table, cursor per business/consumer, delivery ledger, halt-never-skip, two-connection proof). C2 brief retired to git history. C4 sketched. | Package C3 prep |
