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
| C2 | `financial_events` schema + append RPC | Codex | **done 2026-09-13** (PR #50 merged; HIGH + 2 MEDIUM corrected) | — |
| C3 | Outbox/inbox/idempotency primitives | Codex | **done 2026-09-14** (PR #54 merged; lease model, ordered ack, Postgres concurrency proof) | — |
| C4 | Receivables + allocations behind flag | Codex | **done 2026-09-14** (PR #56 merged; payload amounts as strings per amended §FK.1) | — |
| C4b | Opening balances and cut-over | Codex | not started | C4, D4 (cut-over year) |
| C5 | `applyInvoicePayment()` compatibility facade | Codex | **ready — brief in §3** | — |
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

**Deployment state (2026-09-14):** `v235`–`v238` are applied to the production Supabase
project (Handymate, eu-west-1). Verified read-only the same day: the seven `financial_*` tables
exist with RLS enabled and no FORCE; every kernel RPC is SECURITY DEFINER with
`search_path = public, pg_temp` and EXECUTE only for `postgres` and `service_role` (the three
internal helpers `financial_lock`, `financial_append`, `assert_financial_consumer_lease` are
`postgres` only); `business_config.financial_kernel_enabled` defaults false and is true for
**0** businesses; `accounting_method` and `invoice.vat_regime` carry their defaults; the
`v237` backfill left **0** paid/customer_paid invoices with `paid_amount IS NULL`;
`financial_events` and `financial_receivables` are empty. Supabase security advisors report
two INFO items that are by design (`financial_event_consumers` and `financial_event_deliveries`
have RLS enabled and no policy: status is read through `get_financial_consumer_status`) and
one WARN that C5's `v239` fixes (`financial_events_immutable()` and
`financial_receivable_json()` have no pinned `search_path`; neither is SECURITY DEFINER, so
this is hardening, not exposure). `v239` is not yet written.

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

## 3. Next package — Codex brief: C5 the compatibility facade around `applyInvoicePayment()`

> The C4 brief is retired to git history (outcome: C4 handoff in §2, C4 review in §5).
> **Prerequisite met:** `main` carries C0–C4 with payload amounts as strings.
> **This is the first package that touches legacy code.** Dimension B (integration) is the
> review's centre of gravity. Every legacy behaviour named below was read from the code at
> `main` on 2026-09-14; if the code has moved, the code wins and the handoff says so.

Read first: `FINANCIAL_KERNEL_CALL_SITE_MAP.md` §1, §2 (tier 1–3), §4; blueprint §18.1–18.5,
§20.1, §21; orchestration §5 C5, §6 A+B+C+E, §9; `ARCHITECTURE.md` §FK.3 (the bridge rule);
`tests/financial-kernel/golden-paths.ts` (1, 4, 5, 7, 12, 30, 34, 36, 37 and their
`legacyStatus`/`legacyPaymentReceived` fields). Then the legacy code you change:
`lib/invoices/apply-payment.ts`, `lib/invoices/send-invoice.ts` (`recordInvoiceDeliveryOutcome`),
`lib/invoices/sync-to-fortnox.ts` (the receipt update at ~:413); and the code you read but do not
change: `lib/invoices/payment-decision.ts`, `lib/invoices/customer-share.ts`,
`lib/fortnox/sync-payments.ts`, `app/api/invoices/[id]/status/route.ts`,
`app/api/approvals/[id]/route.ts` (`confirm_payment`). Test pattern for legacy modules with
injected dependencies: `tests/project-invoice-journey.spec.ts` (transpile + `new Function`
loader with a `deps` map) and `tests/helpers/financial-receivables-database.ts` (PGlite with
the real v235–v238).

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **The legacy path is preserved byte-for-byte.** Move today's body of `applyInvoicePayment` into `applyInvoicePaymentLegacy` unchanged; the exported `applyInvoicePayment` dispatches on `isFinancialKernelEnabled(businessId)`. Flag off → legacy, with zero kernel RPC calls. | Orchestration C5: legacy behaviour unchanged for non-kernel customers. A facit test asserts the legacy function's source is identical to `main`'s. |
| **Under the flag, the kernel is the truth and `invoice.status/paid_amount` are a projection** written by the facade from the RPC results, with the same columns legacy writes. | Blueprint §18.1. The projection write is app-side and not atomic with the kernel; C6/C12's integrity check compares them. Accepted for C5; C6 owns the alarm. |
| **Post-payment effects run inline, exactly as today, gated on "customer component settled in this call"**, and the facade writes the bridge marker per `receivable_id` *before* running them. The C3 consumer runner and the event-driven bridge become **C5b**. | Keeps C5 equivalent and small. The marker guarantees that when C5b's bridge later consumes `receivable_settled{customer}` it finds the marker and stays silent (C4 review requirement). |
| **Interim SE rounding policy: shortfall ≤ 100 öre after allocating everything available settles via `adjust_receivable{rounding}`.** Named `INTERIM_SE_ROUNDING_MAX_MINOR = 100n` in `lib/financial-kernel/policies/se-rounding.ts`, exported as a *policy function*, with a header stating it mirrors legacy `paid >= total - 1` and is replaced by C1b's accountant-confirmed value. No account number is chosen. | Orchestration C5: "every invoice that settles today must still settle — now with a rounding posting that explains why". This is the explicit posting mechanism (blueprint §5), not a comparison tolerance: the kernel never compares with slack; it records an adjustment. The contract test's tolerance scan targets `TOLERANCE`/`EPSILON`/`Math.abs(` in kernel dirs; this constant is a policy in `policies/`, documented as interim. The reviewer will check that no *comparison* uses it. |
| **Overpayment stays unallocated on the payment** (customer credit), visible in `financial_payments.allocated_minor < amount_minor`; the invoice projects `paid` when all components are settled. | Golden path 7. Legacy silently marks paid; kernel keeps the 100 kr visible. Same customer-visible status. Refund/apply-to-next is C7/C14. |
| **The non-ROT partial-payment quirk is fixed under the flag**: a partial payment leaves the invoice `sent` (or `overdue`) with `paid_amount` updated and no `payment_received`. Legacy path keeps the quirk. | Call-site map + golden paths 4 and 37. This is an intended, documented divergence for kernel businesses; it is why shadow (C6) compares status, so it will show up there as expected, not as a bug. Owner may veto in review. |
| **Allocation strategy for a legacy call** (`amount` optional): allocate to the customer component first, then the tax-authority component, then leave the rest unallocated; then apply the rounding policy per component still open. `amount` undefined = "everything still open on the next open component" (legacy: customer share, then the Skatteverket remainder). | Mirrors `decidePaymentOutcome` exactly, including the ROT case where the customer pays `total − 0.5`: legacy jumps to `paid`; kernel allocates 9 500 to customer, 2 999,50 to tax, rounds 0,50 → both settled → `paid`. |
| **Idempotency keys per source:** `customer_confirmed` → `customer_confirmed:<approval_id>`; `fortnox` → `fortnox_import:<invoice_id>:<fortnox_document_number>:<Balance>` (blueprint §21); `manual`/`status_patch` → `manual:<invoice_id>:<paid_at to the minute>:<amount_minor>`; every key also carries the target component when `amount` was derived. | Legacy callers have no idempotency key. These make a double-click, a retried cron and a redelivered approval each exactly-once; two genuine equal manual payments within the same minute are the accepted edge. |
| **Lazy issuance:** if the flagged invoice has no receivables at payment time, the facade calls `issue_invoice_receivables` first (`origin='invoice'`, `issued_date = invoice_date`). `recordInvoiceDeliveryOutcome` issues eagerly on successful delivery. | Fortnox sync runs *before* delivery in `send-invoice.ts`, so the number is final at issue. C4b replaces lazy issuance with opening balances for pre-cut-over documents; until then this is the only way a flagged business can pay an older invoice. |
| **`invoice_number` becomes immutable once receivables exist.** In `sync-to-fortnox.ts`, under the flag and when `financial_receivables` has rows for the invoice, the receipt update omits `invoice_number` (keeps `fortnox_invoice_number`, `fortnox_document_number`, `ocr_number`). Legacy path unchanged. | §36.1 and every idempotency key derived from the number. Only reachable when a first sync failed and a later retry succeeds after issuance. |
| **The thank-you SMS in `[id]/status/route.ts` stays where it is.** | It keys on `result.transition`, which the facade reproduces. Moving it is C5b together with the bridge. |

### Facade algorithm (kernel branch)

```text
applyInvoicePaymentKernel(opts):
  read invoice (same select as legacy) → if status = 'paid' → return already_paid (legacy shape)
  receivables := issueInvoiceReceivables(invoiceId)            -- idempotent, lazy
  key := idempotency key per source (table above)
  payment := recordPaymentSettlement({ provider: source→provider, method, amount: opts.amount ?? nextOpenComponentOutstanding,
             evidence: 'manual' | 'fortnox', settledAt: opts.paidAt, correlationId: fin_invoice_<id>, idempotencyKey: key, actor })
  for component in [customer, tax_authority] while payment.unallocated > 0 and component.open:
      allocatePayment(min(unallocated, component.outstanding), key ':' component)
  for component still open with 0 < outstanding ≤ policy.maxMinor and payment.unallocated = 0:
      adjustReceivable({ reason: 'rounding', delta: −outstanding, idempotencyKey: key ':rounding:' component })
  derive transition (table below); write invoice projection (same columns as legacy:
      status, paid_amount = Σ allocated across components as kr, paid_at/settled_at/paid_via/manual_paid_*)
  if customer component settled in this call: write bridge marker (receivable_id), then runPostPaymentAutomations(...) exactly as legacy
  return legacy ApplyPaymentResult shape (+ kernel: { paymentId, allocations, unallocated })
```

Source → provider: `manual`/`status_patch` → `'manual'` (evidence `'manual'`), `customer_confirmed`
→ `'manual'` with `method: 'customer_confirmed'`, `fortnox` → `'fortnox'` (evidence `'fortnox'`).

### Legacy transition derived from kernel results

| Customer component | Tax component | This call settled | Transition | Status |
|---|---|---|---|---|
| settled now | none | customer | `to_paid` | `paid` |
| settled now | open | customer | `to_customer_paid` | `customer_paid` |
| settled now | settled now | customer (+tax) | `to_paid` | `paid` |
| settled earlier | settled now | tax | `settled` | `paid` |
| open | any | nothing | `none` | unchanged (`sent`/`overdue`/`customer_paid`) |

`customerJustSettled` (the gate for all effects) = "customer component settled in this call".
This reproduces §18.5 and golden path 34 without reading `status`.

### Scope

```text
lib/invoices/apply-payment.ts                       (dispatch + kernel branch; legacy body moved verbatim to applyInvoicePaymentLegacy)
lib/invoices/send-invoice.ts                        (eager issuance on delivered, under flag)
lib/invoices/sync-to-fortnox.ts                     (invoice_number immutable after issuance, under flag)
lib/financial-kernel/policies/se-rounding.ts        (new; interim policy function)
lib/financial-kernel/bridge/marker.ts               (new; write/read marker per receivable_id) + sql/v239_financial_bridge_markers.sql
lib/financial-kernel/kernel-db.ts                   (new; KernelDb adapter over the service-role Supabase client — the only place the two meet)
tests/financial-kernel-facade.spec.ts               (new; PGlite + injected legacy deps; golden paths under both flag states)
tests/financial-kernel-facade-legacy-frozen.spec.ts (new; legacy function source identical to main; flag-off makes no kernel RPC)
package.json, .github/workflows/contracts.yml, docs (handoff)
```

Migration `v239`: `financial_bridge_markers (business_id, receivable_id, marker, delivered_at, source, PRIMARY KEY (business_id, receivable_id, marker))`
with `marker = 'payment_received'` for now; RPC `record_bridge_marker(...)` returning whether it
was new. Grants as in v236.
`v239` also pins the search path of the two v235/v238 helpers the Supabase advisor flagged
(`ALTER FUNCTION public.financial_events_immutable() SET search_path = public, pg_temp;` and the
same for `public.financial_receivable_json(public.financial_receivables)`), and the v235/v238
files in the repo get the same `SET search_path` so PGlite and production agree.

### Invariants (tests first)

1. **Legacy frozen:** with the flag off, `applyInvoicePayment` produces identical results and
   identical `invoice` writes to `main` for every existing test in `apply-payment-decision.spec.ts`,
   `facit-invoice-customer-paid.spec.ts`, `fortnox-classify-payment.spec.ts`; no kernel RPC is
   invoked (assert the `KernelDb` fake was never called); the legacy function's source text equals
   the pre-C5 body (facit).
2. **Equivalence table:** for golden paths 1, 5, 12, 30, 34, 36 the kernel branch yields the same
   `status`, `transition` sequence and `payment_received` count as `legacyStatus`/`legacyPaymentReceived`;
   for 4, 7, 37 it yields the documented divergence (open vs. paid; unallocated 100 kr) and the
   test names it as intended.
3. **Rounding boundary:** shortfalls of 0,01, 1,00 → settled with a `receivable_adjusted{rounding}`
   of exactly that amount; 1,01 → open, no adjustment. Both branches agree at 1,00 (legacy `>=`).
4. **ROT `total − 0.5` case:** customer 9 500 allocated, tax 2 999,50 allocated, 0,50 rounding on
   tax, status `paid`, `payment_received` once.
5. **Double-click / retry:** the same manual call twice within a minute → one payment, one
   allocation set, one marker, one `payment_received`; the second returns `already_paid` or the
   same result, never a second effect.
6. **Fortnox sync equivalence:** `syncFortnoxPaymentsForBusiness` through the flagged facade on
   the classifier's `paid`/`customer_paid` fixtures produces the same counters as today, and a
   second run with the same `Balance` is a no-op (idempotency key).
7. **Approval path:** `customer_confirmed` with `approvalFollowUps` keeps preparing the separate
   approval cards; key is the approval id; a redelivered approval is exactly-once.
8. **Lazy issuance:** an invoice sent before the flag flipped gets receivables at first payment
   with `issued_date = invoice_date`, then behaves as any other.
9. **Eager issuance:** `recordInvoiceDeliveryOutcome` success under the flag issues once; delivery
   failure issues nothing; flag off issues nothing.
10. **Number immutability:** under the flag with receivables present, the Fortnox receipt update
    does not change `invoice_number`; without receivables (or flag off) it behaves as today.
11. **Marker before effects:** the marker row exists before `runPostPaymentAutomations` is called
    (order asserted with a spy); a marker already present suppresses effects and is reported in
    `effects[]` as skipped.
12. **Contract test still green:** `fireEvent` appears only in `apply-payment.ts` (not a kernel
    dir) and the bridge file; no undocumented event name; no `Number(` on minor amounts in the new
    kernel files; the interim policy constant is used only as an argument to `adjustReceivable`,
    never in a comparison that skips an adjustment (source-scan).

### Acceptance (orchestration §5 C5 + §9)

All existing invoice/payment suites green unchanged; all kernel suites green; `tsc` clean; the
flag defaults false and no business has it set; the diff outside the three legacy files is
additive; handoff states which golden paths diverge and why.

### Not in this package

The consumer runner and event-driven bridge (C5b). Moving the thank-you SMS (C5b). Real
rounding policy and account (C1b). Opening balances (C4b). Refund of unallocated overpayment
(C7/C14). Supplier side (C4s). Any flag flip for any business (C6).

### Handoff back

Orchestration §7 block under §2, same PR, including the list of behaviours that differ under
the flag. Claude reviews against §6 A, B, C, E with B as the centre.

---

## 4. Queued after C5 — sketch only, briefed when C5 merges

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

**C5b — consumer runner and event-driven bridge.** A cron route (with the repo's cron-auth
contract) that runs `consumeOnce` for `automation-bridge` per flagged business; the bridge maps
`receivable_settled{customer}` → the same effects the facade runs inline, guarded by the
`financial_bridge_markers` row, so producers that are not the facade (ROT decision import,
PSP webhooks in C7) get the effects exactly once. Moves the thank-you SMS out of
`[id]/status/route.ts` into the bridge. Handler gets an `AbortSignal` (C3 review).

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

### C4 — receivables, payments, allocations (PR #56), Claude review 2026-09-14, orchestration §6 A + B + C + E

Verified locally on `codex/financial-kernel-c4`: 24 C4 tests plus every kernel, schema, retention
and side-door suite green (121); my own 32-probe script from the brief re-run against the
implemented migration with identical results; an extra probe of the legacy ROT fallback
(`customer_pays = total`, deduction 0 → one component, as `getCustomerShare`). Golden paths 1, 4,
5, 7, 10, 12, 19, 30, 34, 36, 37 replay through the RPCs with matching event sequences. No BLOCKER,
no HIGH. Six of Codex's seven deviations are improvements: composite tenant FK to `invoice`, the
exact `getCustomerShare` fallback, `receivable_id` in creation payloads, null-safe idempotency
identity, `p_currency` asserted inside the transaction, settlement keys that survive a
reverse-and-resettle cycle.

| Sev | Finding | Status |
|---|---|---|
| MEDIUM | Payload `*_minor` fields are now written as strings while §FK.1 said integers, and `types.ts` was widened to `number \| string`. A contract cannot be both. Decision (C0 owner): **strings**, for the same reason every RPC returns text and the mirror column does — no `Number()` on money anywhere. §FK.1 amended in PR #57; `types.ts` must narrow to `string` (drop the union) in #56 before merge; the fixture payloads in `golden-paths.ts` are metadata and may stay numeric. | contract amended; narrow the union |
| MEDIUM | Reverse-then-resettle emits a second `receivable_settled` (correct: the earlier event is immutable). The bridge must therefore dedupe `payment_received` per `receivable_id`, not per `eventId`. Written into the C5 sketch. | C5 requirement |
| LOW | `CREATE UNIQUE INDEX` on `public.invoice` inside the migration takes a SHARE lock on the legacy table for its duration. Trivial at today's row counts; run outside peak hours and note it in the apply checklist. | note |
| LOW | Currency is hard-coded `'SEK'` in `issue_invoice_receivables`. Correct for the SE pack; when `invoice` gains a currency column (C7 or C9) it must come from there. | note |

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


## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created with C0 handoff and C1 brief. | Package C0 |
| 2026-09-13 | Folded in the 2026-09-12 decisions (shadow Level 1, obligation boundary, R0 manual rulebook track); noted PR #12 as C4 input; added §5 review record with the C1 review. | PR #47, C1 review |
| 2026-09-13 | C1 marked done (PR #49). Claude track A delivered as the C2 brief: proposed DDL, RLS, immutability, append RPC, lock order, migration risk. C3 sketched. The C1 brief is retired to git history; its handoff and review stand in §2 and §5. | Package C2 prep |
| 2026-09-13 | Tracks C and D delivered: executable golden paths + SE ledger review. | Tracks C, D |
| 2026-09-13 | Track B delivered as `FINANCIAL_KERNEL_CALL_SITE_MAP.md`; board updated. | Track B |
| 2026-09-13 | C3 brief written (outbox = events table, cursor per business/consumer, delivery ledger, halt-never-skip, two-connection proof). C2 brief retired to git history. C4 sketched. | Package C3 prep |
| 2026-09-13 | C3 brief corrected after Codex's review (lease tokens, ordered ack enforced in SQL, attempt timestamps, status RPC); the review is recorded in §5. | Codex review of the C3 brief |
| 2026-09-14 | C3 marked done (PR #54, review in §5). C4 brief written (receivables, payments, allocations, adjustments; DDL verified in PGlite with 32 probes). C3 brief retired to git history. C5 sketched. | Package C4 prep |
| 2026-09-14 | C4 marked done (PR #56, review in §5; §FK.1 amended to decimal-string payload amounts in PR #57). C5 brief written (frozen legacy path, kernel branch as projection writer, inline effects behind a bridge marker, interim SE rounding policy, idempotency keys per source, lazy/eager issuance, immutable `invoice_number`). C4 brief retired to git history. C5b sketched. | Package C5 prep |
| 2026-09-14 | `v235`–`v238` applied to production; read-only verification recorded under §1 "Deployment state". Duplicate C2 review block in §5 removed. `v239` gains the advisor's `search_path` pin for two helpers. | Owner deploy, Supabase advisors |
