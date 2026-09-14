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
| C5 | `applyInvoicePayment()` compatibility facade | Codex | **Claude reviewed; 3 MEDIUM corrected in PR #66 — verification pending** | current-head CI; v239 not applied externally |
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

### C5 — compatibility facade implementation (Codex, 2026-09-14)

Package / scope
: C5 v3: frozen legacy dispatch, atomic command/projection, persistent effect intents,
  caller identities and Fortnox observations. Claude A/B/C/E review completed; correction verification below.

Files / boundaries
: v239; commands/service + facade; dispatch flag, service client adapter, effect runners,
  rounding policy; shared payment-thanks; existing five payment callers and two UI headers;
  eager delivery issuance and Fortnox number preservation; regression tests and CI registration.
  Account deletion classifies both new business tables as retained, as required by its gate.

Contract / events
: §3 v3, FK.1–FK.3 and orchestration C5. Uses existing C2/C4 events; no event names added.
  Legacy portal vocabulary remains in the invoice adapter. `already_paid`, `to_paid` and
  `to_customer_paid` are documented non-event state/transition names in the catalog scanner.

DB / feature flags
: v239 NOT applied outside isolated local tests / CI. Existing v235–v238 deployment is the
  previously reported owner deployment. No feature flag changed. Old helper definitions also
  receive the pinned search_path; v239 applies those pins to already deployed installations.

Implementation deviations from draft, with reasons
: Persist `effect_context` on each command and return it with claims: later callers sweeping
  older intents must use the original approval id, review choices, source and amount. Without
  this, an approval's owed portal artifact could become a direct send on a later manual call.
  `execute_payment_command` has one additional optional final JSONB argument for that context.
: Claim returns the newly unknown intent ids, not just their count, for the specified per-id
  human alert. Claim bounds are validated. Exhausted failures are reported after attempt three.
: Finish takes the business lock before the intent row lock, preserving the kernel lock order
  and allowing the Postgres delayed-finish proof to establish the actual blocking point.
: Eager issuance uses `issue_invoice_receivables_if_eligible` under the same locks as payment,
  rather than a check-then-issue race. Persisted legacy routing is consulted on subsequent keys.
: Add a tenant invoice FK to command rows; compare replay invoice/source null-safely; persist
  suppressed-effect history on the command. Current projection includes status and timestamps.
: A database trigger additionally preserves an issued invoice number for flagged businesses,
  closing the race between a receipt's preliminary read and concurrent issuance. The receipt
  path still omits invoice_number when receivables are present, as briefed.
: Callers with a real markedBy user retain user attribution. Legacy callers without an actor
  id use system attribution, satisfying FK.2 instead of inventing a user identity.
: Shared route effect functions preserve legacy message/approval content; kernel invocations
  report send/insert failures as PaymentEffect results so the intent is not falsely completed.

Verification / limits
: The pre-C5 legacy function body is byte-identical in an executable facit test. Flag-off,
  missing-row and missing-column dispatch make no kernel RPCs. Real PGlite tests cover command
  identity, stale replay, atomic rollback, snapshots, historical routing, rounding, overpayment,
  repeated settlement, intent retries/unknowns/tokens and privileges. Actual status route plus
  actual facade is exercised with external effect dispatch stubbed; no real SMS was sent.
  Original approval context survives a sweep by a different caller. Postgres CI has two
  connection tests for command identity and delayed finish. It must pass before handoff is green.
: Local full contracts initially passed 2204/2210, with three changed-contract checks corrected
  and passing subsequently. Two pre-existing Unix grep invocations cannot run in the Windows
  shell; Linux CI is the verification environment for those. One existing test is skipped.
  Updated targeted tests and TypeScript pass; final remote result is recorded on the PR.
: Updated the production-schema test fixture's two business_config columns from the documented
  production verification in §1, not from a new live inspection. Existing source facit tests
  now follow the extracted SMS module and current booking-only Fortnox route semantics.

Swedish regimes / open decisions
: Explicit interim <=100-öre rounding, ROT split and non-ROT partial-payment divergence remain
  as approved. No VAT or account selection, opening-balance import, refund or flag activation.
  C5b owns periodic sweeping/admin handling; inline recovery occurs on kernel calls. Unknown
  external outcomes require a human and are not automatically resent. R0/P0/C1b remain with
  their named owners; no accountant approval is claimed by this implementation.

### C5 — Claude review corrections (Codex, 2026-09-14)

Scope / files
: Three MEDIUM findings from [Claude's review of #66](https://github.com/Ahogberg/handymate-dashboard/pull/66#pullrequestreview-5196166127),
  also recorded by Claude in PR #67. Changes are limited to the approval caller,
  command facade, delivery outcome, existing facade regression suite and task/package logs.

Corrections
: Approval specifies `target: customer` only without an explicit reviewed amount.
  Full-amount ROT confirmation allocates customer then tax, with no unallocated remainder.
  `financial_command_target_not_open` returns a tenant-scoped current invoice projection
  with `transition: none`; unrelated command errors still propagate.
: A persisted legacy-routed replay returns the current invoice status and replay metadata,
  without executing the frozen legacy function a second time. **Replay protection is not
  crash recovery:** a crash after command persistence but before the legacy write is not
  automatically recovered by retry. C4b must resolve that cut-over/recovery limitation.
: Eager issuance errors (returned RPC errors, thrown transport errors and dispatch-flag
  read failures) are reported through `financial-kernel:eager-issuance-failed` and added
  to the send result's errors while preserving `delivered: true`. Payment-time lazy issuance
  remains the recovery path; the customer must not receive a duplicate send.

Evidence
: All three findings reproduced before the fix. 78 targeted tests pass after correction,
  including seven added cases: real approval executor + actual v239 allocation with/without
  amount, second customer confirmation with tax still open, actual legacy function invoked
  once on replay, and three post-delivery failure modes. External delivery providers are
  stubbed; no actual SMS/email or production database write is claimed.
: The test DB uses per-RPC savepoints to reproduce PostgREST transaction boundaries inside
  its outer rollback; invoice NUMERIC transport is adapted to PostgREST's JSON numbers.
  The frozen legacy body is independently byte-identical to current main `db8b772` via AST.
  TypeScript, build and current-head CI results are pending and will be recorded on #66.

Contract / remaining work
: No event, SQL/RPC definition, feature flag or accounting policy change. Relies on FK.3,
  blueprint §18 and orchestration §9. ROT and legacy cut-over paths are covered; no VAT
  computation or posting rule is introduced. No new accounting approval is required.
  Claude's four LOW groups remain tracked in the review / PR #67. C5b is not implemented.
  R0/P0/C1b and owner decisions remain unchanged. **No v239 in production and no feature
  flag activation before C5 merge and the owner's C6 pilot selection.**

## 3. Next package — Codex brief: C5 v3 the compatibility facade around `applyInvoicePayment()`

> **v3, 2026-09-14.** v2 (PR #61) was reviewed by Codex in PR #62 with four further executable
> counterexamples ([C5 v2 review](FINANCIAL_KERNEL_C5_V2_REVIEW.md)): R1 obsolete projection on
> replay, R2 route-owned thank-you SMS outside the intent protocol, R3 finish without attempt
> identity, R4 incomplete no-op outcomes. All four accepted; response in §5. v3 changes: **the
> legacy invoice columns are projected by the RPC itself from current kernel state under the
> invoice row lock** (never from command history), **every response is `{command, projection}`
> for every state**, **claim mints an attempt token that finish must present**, and **the status
> route's after-payment effects become intents under the flag**. v1 (PR #59) → v2 (PR #61) fixed
> B1–B4 and M1 (command identity, atomic RPC, provider observation, persisted legacy routing,
> intents, dispatch flag reader); those decisions stand. Unchanged throughout: legacy body frozen
> byte-for-byte, flag default off and set for nobody, non-ROT partial payment stays open under the
> flag (golden paths 4/37), overpayment stays unallocated (GP7), interim rounding is an explicit
> posting, `invoice_number` immutable once receivables exist.
> **Prerequisite met:** `main` carries C0–C4; v235–v238 are applied in production (§1).

Read first: `FINANCIAL_KERNEL_C5_BRIEF_REVIEW.md`, `FINANCIAL_KERNEL_C5_V2_REVIEW.md` and their probe
specs `tests/financial-kernel-c5-brief-probes.spec.ts`, `tests/financial-kernel-c5-v2-brief-probes.spec.ts`
(the faults, to be converted into prevention tests); `FINANCIAL_KERNEL_CALL_SITE_MAP.md` §1, §2 (tier 1–3), §4; blueprint §18.1–18.5, §20.1,
§21; orchestration §5 C5, §6 A+B+C+E, §9; `ARCHITECTURE.md` §FK.3; golden paths 1, 4, 5, 7, 12,
30, 34, 36, 37. Legacy code you change: `lib/invoices/apply-payment.ts`,
`lib/invoices/send-invoice.ts` (`recordInvoiceDeliveryOutcome`), `lib/invoices/sync-to-fortnox.ts`
(receipt update ~:413), `lib/fortnox/sync-payments.ts` (observation only), the four callers under
"Callers" below. Code you read but do not change: `lib/invoices/payment-decision.ts`,
`lib/invoices/customer-share.ts`, `lib/fortnox/classify-payment.ts`. Test patterns:
`tests/project-invoice-journey.spec.ts` (transpile + injected `deps`),
`tests/helpers/financial-receivables-database.ts` (PGlite with the real v235–v238; add `status`,
`paid_amount`, `paid_at`, `settled_at`, `paid_via`, `manual_paid_marked_at`, `manual_paid_by_user_id`
to its `invoice` fixture, and v239).

### What changed from v1, and why

| Finding (PR #60) | v1 | v2 |
|---|---|---|
| **B1** command identity derived from state | key carried the derived amount and component; a retry after the customer settled became a Skatteverket payment; a fresh default timestamp conflicted in C4 | **Identity is a caller-supplied command key.** Target, amount and `settled_at` are resolved once inside `execute_payment_command`, persisted on the command row in the same transaction as the kernel writes, and every replay of the key returns the stored outcome without touching the kernel, whatever the caller sends now. A *different* key on a `customer_paid` invoice is the Skatteverket payment, which is what legacy means by a second call (mark-paid route doc comment) — now explicit and auditable instead of implicit. |
| **B2** Fortnox evidence not passed | key needed `DocumentNumber` and `Balance` that the caller never sends; cumulative `Total − Balance` treated as a new payment | `syncFortnoxPaymentsForBusiness` passes a **provider observation** (document identity, cumulative paid, observed at) next to the untouched legacy arguments. Under the flag the RPC records **new money = snapshot − everything the kernel already holds for the invoice**; zero or negative deltas record nothing and are stored on the command row for C11. Legacy branch ignores the observation. |
| **B3** lazy issuance on part-paid invoices | issued both components fully open, so the next payment was mis-targeted | **Routing rule, persisted:** an invoice with legacy payment evidence (`paid_amount > 0` or status `customer_paid`/`paid`) and no kernel receivables is `legacy_routed` — the facade runs the frozen legacy body for it, forever, until C4b imports its opening balance. No receivable is invented from legacy status. |
| **B4** no recovery protocol | app-side steps between RPCs; pre-send marker could suppress a never-sent effect; early `paid` return on retry | Issuance, settlement, allocations, rounding, outcome **and effect intents commit in one transaction**; there is no state between them to recover. Effects are **intent rows** (`pending → attempting → sent/failed/skipped`, stale attempts → `unknown` and reported to a human); a retried request finishes what a crashed one owed; the intent row is the marker C5b's bridge checks, so a marker exists only together with the obligation it records. No exactly-once claim for external sends: at-most-once per attempt, never silently lost. |
| **M1** flag helper calls a kernel RPC | dispatch used the C4 helper | New `readKernelDispatchFlag` reads the column directly; absent column/row → `false`; other errors throw. The C4 helper stays for kernel callers. |

### What changed from v2, and why

| Finding (PR #62) | v2 | v3 |
|---|---|---|
| **R1** immutable outcome replayed as projection | the facade rewrote `invoice.status/paid_amount` from the command's stored `receivables`/`recorded_minor`; a replay of the customer command after the tax command downgraded a paid invoice; app-side writes could also arrive out of order | **The RPC writes the projection**, from `financial_invoice_projection()` (current receivables, Σ settled inbound payments, derived status) under the `invoice … FOR UPDATE` lock it already holds, in the same transaction as the kernel writes. A replay writes nothing and returns the current projection. There is no app-side projection write, so no ordering problem exists. |
| **R2** route-owned SMS re-fired on replay | "thank-you SMS untouched" plus "same transition on replay" | The status route's block (thank-you SMS + scheduled review request) is extracted verbatim into `lib/invoices/payment-thanks.ts`. Flag off: the route calls it exactly as today. Flag on: the facade owns it as intents `invoice_paid_thanks` and `review_request_schedule` for source `status_patch`, and the route skips its block when `result.kernel` is present. Crash before dispatch → intent `pending` → swept by the next call. |
| **R3** finish had no attempt identity | `finish` checked only `status = 'attempting'`; a late duplicate finish failed a newer attempt | `claim` mints `attempt_token` per claimed intent; `finish` requires the exact token. Foreign or stale token → `financial_effect_attempt_stale`, no mutation. Same token, same terminal status → idempotent; different status → `financial_effect_attempt_finished`. A late finish for an attempt already marked `unknown` is accepted and resolves it (`was_unknown`). |
| **R4** no-op outcomes lacked projection fields; `already_paid` skipped the sweep | `no_new_money`/`provider_below_kernel`/`already_paid` returned state only | Every state returns `{command, projection}`; `projection.intents_owed`/`intents_unknown` tell the facade what to sweep; the facade sweeps on **every** kernel-branch call, including `already_paid`, `no_new_money` and replays. `already_paid` and `no_new_money` also (re)write the projection, which repairs one a crashed request never got to. |

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **The legacy path is preserved byte-for-byte** in `applyInvoicePaymentLegacy`; the export dispatches on `readKernelDispatchFlag(businessId)` and on the RPC's routing outcome. Flag off → zero kernel RPCs and one extra `business_config` read. | Orchestration C5. Facit test compares the legacy function source with `main`. |
| **One command = one atomic RPC.** `execute_payment_command` (v239) does routing, lazy issuance, settlement, allocation, rounding, outcome and intents under the business lock, in one transaction, keyed by `(business_id, command_key)`. | B1 + B4. Verified in PGlite (below). The same RPC is what C5b's runner and C7's provider adapter will call, so the command table becomes the audit trail of "who asked for what". |
| **Callers own identity.** Every caller passes `commandKey` (table under "Callers"). HTTP routes accept a client `Idempotency-Key` header or body `command_id`; when absent the route mints one and echoes it in the response. | B1. A retry (same key) is idempotent by construction; a new key is a new command, as legacy semantics require. |
| **Resolution order for a command without an observation:** explicit `target` (+ optional amount) → explicit `amount` (allocate customer → tax_authority → unallocated) → neither: the next open component, customer first, for its full outstanding. Persisted once. | Mirrors `decidePaymentOutcome` including the ROT `total − 0.5` case, but never re-derived on replay. |
| **Provider snapshot rule:** with an observation the target is the invoice and the amount is `snapshot_paid − kernel_recorded`; `≤ 0` records nothing (`no_new_money` / `provider_below_kernel`, the latter reported once via `rapporteraTystFel`, reconciliation is C11). | B2. Manual-then-provider confirms without double counting; overpayment observed by the provider stays unallocated. |
| **Routing:** no receivables + legacy evidence → `legacy_routed`, run the frozen body. Eager issuance in `recordInvoiceDeliveryOutcome` obeys the same rule (a resend of a part-paid invoice issues nothing). | B3. C4b replaces this with opening balances; until then flagged businesses keep legacy behaviour on their old paper. |
| **Effects run inline, from intents.** Intents are created in the kernel transaction only when the **customer component settled in this command**, one per `(receivable_id, effect)` ever (a reversal + re-settlement gets `effects_suppressed`, C4 review). Dispatch: `claim_effect_intents` (max 3 attempts, 10 min stale; mints an `attempt_token` per claim) → run → `finish_effect_intent(id, attempt_token, status)`. **Every** kernel-branch call sweeps that invoice's owed intents, whatever the command's state. | B4, R3, R4. `runPostPaymentAutomations` gets an additive `only?: string[]` so one effect can run alone; legacy callers unchanged. |
| **`unknown` is a human's**: an attempt that did not finish within 10 minutes is never auto-retried (the SMS may have gone out); it is reported via `rapporteraTystFel('financial-kernel:effect-unknown', …)` with the intent id. C5b adds the periodic sweeper and the admin surface. | Honest at-most-once for external sends. |
| **Interim SE rounding policy** `INTERIM_SE_ROUNDING_MAX_MINOR = 100n` in `lib/financial-kernel/policies/se-rounding.ts`, passed to the RPC as `p_rounding_max_minor`; the RPC applies it **only to components this command paid into, only when nothing is left unallocated**, as an `adjust_receivable{rounding}` posting. | Same as v1, now a policy argument; the reviewer checks no TypeScript comparison uses the constant. |
| **Projection is written by the RPC**, never by the app: `financial_project_invoice()` sets `status` (all components settled/closed → `paid`; customer settled, tax open → `customer_paid`; customer open → unchanged), `paid_amount = round(recorded_minor / 100, 2)` (every settled inbound payment the kernel holds for the invoice, allocated or not), `paid_at`/`paid_via` when the customer settled in this command, `settled_at` when the invoice becomes `paid`, `manual_paid_marked_at/by` when a component settled and the source is not Fortnox — all under the invoice row lock, in the command transaction. Replays write nothing. Atomic with the kernel, so the v1 "not atomic, C6 compares" acceptance is withdrawn. | R1. Same columns as legacy so every reader in the call-site map keeps working. A reversal (C4 RPC) does not re-project; reopening a paid invoice is C14's. |
| **Kernel branch never reads `invoice.status` to decide.** `already_paid` comes from the RPC (`state = 'already_paid'`: nothing open). The legacy-shaped `transition` is derived from `command.settled_now` (history, stable on replay) and `status` from `projection` (current). A replay returns the stored transition for the caller's message but never writes and never re-fires an effect: effects only come from intents. | B4, R1, R2. |
| **Status route after-payment effects become intents under the flag.** `lib/invoices/payment-thanks.ts` exports `sendPaymentThanks(...)` (the SMS) and `scheduleReviewRequest(...)` (the `pending_approvals` row), both moved verbatim from the route. Flag off → the route calls them in its existing block. Flag on → the facade includes `invoice_paid_thanks` and `review_request_schedule` in the effect set for `status_patch`, dispatches them through intents, and the route skips its block when `result.kernel` is set. | R2. Replaces v1's "SMS untouched". The mark-paid route has no route-owned effects; approvals and Fortnox already run everything through the core. |
| **`invoice_number` immutable once receivables exist** (Fortnox receipt update under the flag, `sync-to-fortnox.ts`), **non-ROT partial stays open under the flag**, **overpayment unallocated**. | Unchanged from v1; not challenged. |

### Command keys per caller

| Source | Caller | `commandKey` | Target / amount |
|---|---|---|---|
| `manual` | `POST /api/invoices/[id]/mark-paid` | `manual:<invoice_id>:<client key>` — client key = `Idempotency-Key` header or body `command_id`, sanitised to `[A-Za-z0-9._-]{1,120}`; absent → `crypto.randomUUID()` minted by the route and echoed as `command_id` in the JSON response | body `amount` → explicit amount; else next open component |
| `status_patch` | `PATCH /api/invoices/[id]/status` (`status: 'paid'`) | `status_patch:<invoice_id>:<client key or minted uuid>` | body `paid_amount` → explicit; else next open component |
| `manual` | `lib/matte/action-executor.ts` `mark_invoice_paid` | `manual:<invoice_id>:matte:<sha256(channel|from|receivedAt) first 32 hex>` from the `IncomingSignal` (it has no id) | next open component |
| `customer_confirmed` | `app/api/approvals/[id]/route.ts` `confirm_payment` | `customer_confirmed:<approval_id>` | `target: 'customer'`, `reviewed.amount` if present |
| `fortnox` | `lib/fortnox/sync-payments.ts` | `fortnox_import:<invoice_id>:<document_number>:<paid_minor>` | `providerObservation` (below); `amount` argument kept as today for the legacy branch |

UI: `app/dashboard/invoices/page.tsx` `handleMarkPaid` and the status modal in
`app/dashboard/invoices/[id]/page.tsx` send `Idempotency-Key: crypto.randomUUID()` generated per
click. Server-side minting keeps old clients and curl working (no retry protection, exactly as today).

**Provider observation** (`providerObservation` on `ApplyPaymentOptions`, optional, ignored by the
legacy branch):

```ts
{ provider: 'fortnox', documentNumber: string, total?: number, balance?: number, fullyPaid?: boolean,
  paidMinor: string /* decimal string of öre: Money.fromLegacyNumber(paidSoFarFromFortnox(fn) ?? fallback) */,
  paidFrom: 'total_minus_balance' | 'local_invoice_total' | 'local_customer_share', observedAt: string }
```

`paidMinor` fallbacks mirror the caller today: classifier `paid` without `Total`/`Balance` → the
local invoice total; classifier `customer_paid` without them → `getCustomerShare(inv)`.

### v239 — implement as written (deviations in the handoff with reasons)

```sql
-- v239_financial_payment_commands.sql — DRAFT for the C5 brief v3 (Claude, 2026-09-14; v2 corrected after PR #62 R1–R4).
-- Verified in PGlite on top of v235–v238 (probe8.cjs). Codex implements as written; deviations in the handoff.
BEGIN;

-- Supabase advisor WARN (production check 2026-09-14): pin search_path on the two v235/v238 helpers.
ALTER FUNCTION public.financial_events_immutable() SET search_path = public, pg_temp;
ALTER FUNCTION public.financial_receivable_json(public.financial_receivables) SET search_path = public, pg_temp;

-- ── Payment commands: one row per command identity, written in the same transaction as the kernel writes ──
CREATE TABLE IF NOT EXISTS public.financial_payment_commands (
  id            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  command_key   TEXT        NOT NULL CHECK (command_key ~ '^[a-z_]+:\S+$' AND length(command_key) <= 400),
  invoice_id    TEXT        NOT NULL,
  source        TEXT        NOT NULL CHECK (source IN ('manual', 'status_patch', 'customer_confirmed', 'fortnox')),
  route         TEXT        NOT NULL CHECK (route IN ('kernel', 'legacy')),
  state         TEXT        NOT NULL CHECK (state IN ('executed', 'already_paid', 'legacy_routed', 'no_new_money', 'provider_below_kernel')),
  target        TEXT        NULL CHECK (target IS NULL OR target IN ('customer', 'tax_authority', 'invoice')),
  amount_minor  BIGINT      NULL CHECK (amount_minor IS NULL OR amount_minor > 0),
  currency      TEXT        NOT NULL DEFAULT 'SEK' CHECK (currency ~ '^[A-Z]{3}$'),
  settled_at    TIMESTAMPTZ NOT NULL,
  provider      TEXT        NOT NULL CHECK (provider IN ('manual', 'fortnox')),
  method        TEXT        NULL,
  evidence      TEXT        NOT NULL CHECK (evidence IN ('manual', 'fortnox')),
  observation   JSONB       NULL,
  payment_id    TEXT        NULL,
  outcome       JSONB       NOT NULL,
  actor_type    TEXT        NOT NULL,
  actor_id      TEXT        NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, command_key),
  FOREIGN KEY (business_id, payment_id) REFERENCES public.financial_payments(business_id, id),
  CHECK ((state = 'executed') = (payment_id IS NOT NULL)),
  CHECK ((state = 'executed') = (amount_minor IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_payment_commands_invoice ON public.financial_payment_commands (business_id, invoice_id, created_at);

-- ── Effect intents: durable "we owe this side effect" rows; the marker the C5b bridge checks ──
CREATE TABLE IF NOT EXISTS public.financial_effect_intents (
  id            TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id   TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  command_id    TEXT        NOT NULL,
  invoice_id    TEXT        NOT NULL,
  receivable_id TEXT        NOT NULL,
  effect        TEXT        NOT NULL CHECK (effect ~ '^[a-z_]{2,40}$'),
  status        TEXT        NOT NULL CHECK (status IN ('pending', 'attempting', 'sent', 'failed', 'skipped', 'unknown')),
  attempts      INT         NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  attempt_token TEXT        NULL,
  claimed_at    TIMESTAMPTZ NULL,
  finished_at   TIMESTAMPTZ NULL,
  last_error    TEXT        NULL,
  result        JSONB       NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, command_id, effect),
  UNIQUE (business_id, receivable_id, effect),
  FOREIGN KEY (business_id, command_id) REFERENCES public.financial_payment_commands(business_id, id),
  FOREIGN KEY (business_id, receivable_id) REFERENCES public.financial_receivables(business_id, id),
  CHECK ((status = 'attempting') = (claimed_at IS NOT NULL AND finished_at IS NULL) OR status IN ('sent', 'failed', 'skipped', 'unknown')),
  CHECK ((status = 'pending') = (attempt_token IS NULL)),
  CHECK ((status IN ('sent', 'failed', 'skipped', 'unknown')) = (finished_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_effect_intents_open ON public.financial_effect_intents (business_id, invoice_id)
  WHERE status IN ('pending', 'attempting', 'failed');

DO $rls$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_payment_commands', 'financial_effect_intents'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC, anon, authenticated, service_role', t);
    EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated, service_role', t);
  END LOOP;
END $rls$;


-- ── Projection helpers (R1): the legacy invoice columns are a projection of CURRENT kernel state, written under the
-- invoice row lock inside the command transaction. Command history never drives a write. ──
CREATE OR REPLACE FUNCTION public.financial_invoice_projection(p_business_id TEXT, p_invoice_id TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE recs JSONB; v_recorded BIGINT; v_allocated BIGINT; v_open INT; v_customer_open BOOLEAN; v_status TEXT; v_owed INT; v_unknown INT;
BEGIN
  SELECT jsonb_agg(public.financial_receivable_json(x) ORDER BY x.component), count(*) FILTER (WHERE x.status = 'open'),
         bool_or(x.component = 'customer' AND x.status = 'open')
    INTO recs, v_open, v_customer_open
    FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id;
  SELECT COALESCE(sum(p.amount_minor), 0), COALESCE(sum(p.allocated_minor), 0) INTO v_recorded, v_allocated FROM public.financial_payments p
    WHERE p.business_id = p_business_id AND p.correlation_id = 'fin_invoice_' || p_invoice_id AND p.status = 'settled' AND p.direction = 'inbound';
  SELECT count(*) FILTER (WHERE i.status IN ('pending', 'failed', 'attempting')), count(*) FILTER (WHERE i.status = 'unknown') INTO v_owed, v_unknown
    FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.invoice_id = p_invoice_id;
  v_status := CASE WHEN recs IS NULL THEN NULL WHEN v_open = 0 THEN 'paid' WHEN NOT v_customer_open THEN 'customer_paid' ELSE NULL END;
  RETURN jsonb_build_object('receivables', COALESCE(recs, '[]'::jsonb), 'recorded_minor', v_recorded::text,
    'unallocated_minor', (v_recorded - v_allocated)::text, 'derived_status', v_status,
    'intents_owed', v_owed, 'intents_unknown', v_unknown);
END $fn$;

CREATE OR REPLACE FUNCTION public.financial_project_invoice(
  p_business_id TEXT, p_invoice_id TEXT, p_settled_now TEXT[], p_settled_at TIMESTAMPTZ, p_source TEXT, p_paid_via TEXT, p_marked_by TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE proj JSONB; v_customer_now BOOLEAN := 'customer' = ANY(COALESCE(p_settled_now, '{}')); v_any_now BOOLEAN := COALESCE(array_length(p_settled_now, 1), 0) > 0; v_status TEXT;
BEGIN
  proj := public.financial_invoice_projection(p_business_id, p_invoice_id);
  UPDATE public.invoice i SET
      paid_amount = round((proj->>'recorded_minor')::numeric / 100, 2),
      status = COALESCE(proj->>'derived_status', i.status),
      paid_at = CASE WHEN v_customer_now THEN p_settled_at ELSE i.paid_at END,
      paid_via = CASE WHEN v_customer_now THEN p_paid_via ELSE i.paid_via END,
      settled_at = CASE WHEN proj->>'derived_status' = 'paid' AND i.settled_at IS NULL THEN p_settled_at ELSE i.settled_at END,
      manual_paid_marked_at = CASE WHEN v_any_now AND p_source <> 'fortnox' THEN now() ELSE i.manual_paid_marked_at END,
      manual_paid_by_user_id = CASE WHEN v_any_now AND p_source <> 'fortnox' THEN p_marked_by ELSE i.manual_paid_by_user_id END
    WHERE i.business_id = p_business_id AND i.invoice_id = p_invoice_id
    RETURNING i.status INTO v_status;
  RETURN proj || jsonb_build_object('status', v_status, 'written', true);
END $fn$;

-- ── RPC 1: execute (or replay) one payment command atomically ──
-- Identity = (business_id, command_key). Parameters are resolved ONCE and persisted with the outcome
-- in the same transaction as issuance, settlement, allocations, rounding and effect intents.
-- A replay returns the stored outcome and never touches the kernel again.
CREATE OR REPLACE FUNCTION public.execute_payment_command(
  p_business_id TEXT, p_command_key TEXT, p_invoice_id TEXT, p_source TEXT,
  p_target TEXT, p_amount_minor BIGINT, p_settled_at TIMESTAMPTZ,
  p_provider TEXT, p_method TEXT, p_evidence TEXT, p_observation JSONB,
  p_rounding_max_minor BIGINT, p_effects TEXT[], p_paid_via TEXT, p_marked_by TEXT, p_actor_type TEXT, p_actor_id TEXT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  cmd public.financial_payment_commands%ROWTYPE;
  inv RECORD; r RECORD;
  v_target TEXT; v_amount BIGINT; v_state TEXT := 'executed';
  v_recorded BIGINT; v_snapshot BIGINT; v_delta BIGINT;
  pay JSONB; al JSONB; adj JSONB; recs JSONB;
  v_unallocated BIGINT; v_alloc BIGINT; v_open_count INT;
  v_settled_now TEXT[] := '{}'; v_touched TEXT[] := '{}'; v_suppressed TEXT[] := '{}';
  v_allocations JSONB := '[]'; v_adjustments JSONB := '[]'; v_intents JSONB := '[]';
  v_customer_rec TEXT; v_effect TEXT; v_intent_id TEXT; v_cmd_id TEXT; v_outcome JSONB;
  v_settled_at TIMESTAMPTZ := COALESCE(p_settled_at, now());
  proj JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_command_key IS NULL OR p_command_key = '' THEN RAISE EXCEPTION 'financial_command_key_required' USING ERRCODE = 'check_violation'; END IF;
  IF p_source NOT IN ('manual', 'status_patch', 'customer_confirmed', 'fortnox') THEN RAISE EXCEPTION 'financial_command_source_invalid' USING ERRCODE = 'check_violation'; END IF;

  -- Replay: identity wins over everything the caller sends now.
  SELECT * INTO cmd FROM public.financial_payment_commands c WHERE c.business_id = p_business_id AND c.command_key = p_command_key;
  IF FOUND THEN
    IF cmd.invoice_id <> p_invoice_id OR cmd.source <> p_source THEN
      RAISE EXCEPTION 'financial_command_conflict' USING ERRCODE = 'unique_violation', DETAIL = cmd.id;
    END IF;
    PERFORM 1 FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
    RETURN jsonb_build_object(
      'command', cmd.outcome || jsonb_build_object('replayed', true, 'command_id', cmd.id,
        'intents', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'effect', i.effect, 'status', i.status, 'attempts', i.attempts) ORDER BY i.effect), '[]'::jsonb)
                      FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.command_id = cmd.id)),
      'projection', public.financial_invoice_projection(p_business_id, p_invoice_id) || jsonb_build_object('written', false));
  END IF;

  SELECT i.invoice_id, i.status, i.paid_amount, i.total INTO inv
    FROM public.invoice i WHERE i.invoice_id = p_invoice_id AND i.business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_invoice_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;

  -- Routing (B3): an invoice with legacy payment evidence and no kernel receivables stays on the legacy path
  -- until C4b imports its opening balance. The decision is persisted so every later command on it agrees.
  IF NOT EXISTS (SELECT 1 FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id) THEN
    IF COALESCE(inv.paid_amount, 0) > 0 OR inv.status IN ('customer_paid', 'paid') THEN
      v_outcome := jsonb_build_object('route', 'legacy', 'state', 'legacy_routed', 'reason', 'legacy_payment_evidence',
        'legacy_status', inv.status, 'legacy_paid_amount', inv.paid_amount);
      INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
        VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'legacy', 'legacy_routed', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
        RETURNING id INTO v_cmd_id;
      RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb),
        'projection', jsonb_build_object('written', false, 'receivables', '[]'::jsonb, 'recorded_minor', '0', 'unallocated_minor', '0', 'derived_status', NULL, 'intents_owed', 0, 'intents_unknown', 0));
    END IF;
    PERFORM public.issue_invoice_receivables(p_business_id, p_invoice_id, p_actor_type, p_actor_id);
  END IF;

  SELECT count(*) INTO v_open_count FROM public.financial_receivables x
    WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open';
  IF v_open_count = 0 THEN
    v_outcome := jsonb_build_object('route', 'kernel', 'state', 'already_paid', 'settled_now', '[]'::jsonb);
    INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
      VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', 'already_paid', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
      RETURNING id INTO v_cmd_id;
    -- Projection is (re)written even here: it is idempotent and repairs a projection a crashed request never wrote.
    proj := public.financial_project_invoice(p_business_id, p_invoice_id, '{}', v_settled_at, p_source, p_paid_via, p_marked_by);
    RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb), 'projection', proj);
  END IF;

  -- Resolve target and amount ONCE (B1). Persisted below; a replay never re-derives.
  IF p_observation IS NOT NULL THEN
    -- Provider snapshot (B2): new money = cumulative paid per provider − everything the kernel already holds for the invoice.
    v_target := 'invoice';
    v_snapshot := (p_observation->>'paid_minor')::bigint;
    IF v_snapshot IS NULL OR v_snapshot < 0 THEN RAISE EXCEPTION 'financial_observation_paid_minor_required' USING ERRCODE = 'check_violation'; END IF;
    SELECT COALESCE(sum(p.amount_minor), 0) INTO v_recorded FROM public.financial_payments p
      WHERE p.business_id = p_business_id AND p.correlation_id = 'fin_invoice_' || p_invoice_id AND p.status = 'settled' AND p.direction = 'inbound';
    v_delta := v_snapshot - v_recorded;
    IF v_delta <= 0 THEN
      v_state := CASE WHEN v_delta = 0 THEN 'no_new_money' ELSE 'provider_below_kernel' END;
      v_outcome := jsonb_build_object('route', 'kernel', 'state', v_state, 'snapshot_paid_minor', v_snapshot::text,
        'kernel_recorded_minor', v_recorded::text, 'delta_minor', v_delta::text, 'settled_now', '[]'::jsonb);
      INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, target, settled_at, provider, method, evidence, observation, outcome, actor_type, actor_id)
        VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', v_state, 'invoice', v_settled_at, p_provider, p_method, p_evidence, p_observation, v_outcome, p_actor_type, p_actor_id)
        RETURNING id INTO v_cmd_id;
      proj := public.financial_project_invoice(p_business_id, p_invoice_id, '{}', v_settled_at, p_source, p_paid_via, p_marked_by);
      RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', '[]'::jsonb, 'effects_suppressed', '[]'::jsonb), 'projection', proj);
    END IF;
    v_amount := v_delta;
  ELSIF p_target IS NOT NULL THEN
    IF p_target NOT IN ('customer', 'tax_authority') THEN RAISE EXCEPTION 'financial_command_target_invalid' USING ERRCODE = 'check_violation'; END IF;
    v_target := p_target;
    SELECT (x.amount_minor + x.adjusted_minor - x.allocated_minor) INTO v_amount FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.component = p_target AND x.status = 'open';
    IF NOT FOUND THEN RAISE EXCEPTION 'financial_command_target_not_open' USING ERRCODE = 'check_violation'; END IF;
    IF p_amount_minor IS NOT NULL THEN v_amount := p_amount_minor; END IF;
  ELSIF p_amount_minor IS NOT NULL THEN
    v_target := 'invoice'; v_amount := p_amount_minor;
  ELSE
    -- Legacy "no amount" = the next open component, customer first. Resolved under the lock, persisted once.
    SELECT x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) INTO v_target, v_amount FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open'
      ORDER BY CASE x.component WHEN 'customer' THEN 0 ELSE 1 END LIMIT 1;
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN RAISE EXCEPTION 'financial_command_amount_invalid' USING ERRCODE = 'check_violation'; END IF;

  pay := public.record_payment_settlement(p_business_id, p_provider, NULL, 'inbound', p_method, 'SEK', v_amount, NULL, p_evidence, v_settled_at,
    'fin_invoice_' || p_invoice_id, p_command_key, p_actor_type, p_actor_id);
  v_unallocated := (pay->>'unallocated_minor')::bigint;

  FOR r IN SELECT x.id, x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) AS outstanding FROM public.financial_receivables x
             WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open' AND (v_target = 'invoice' OR x.component = v_target)
             ORDER BY CASE x.component WHEN 'customer' THEN 0 ELSE 1 END
  LOOP
    EXIT WHEN v_unallocated <= 0;
    v_alloc := LEAST(v_unallocated, r.outstanding);
    al := public.allocate_payment(p_business_id, pay->>'payment_id', r.id, v_alloc, p_command_key || ':alloc:' || r.component, p_actor_type, p_actor_id);
    v_unallocated := v_unallocated - v_alloc;
    v_touched := v_touched || r.component;
    v_allocations := v_allocations || jsonb_build_object('component', r.component, 'receivable_id', r.id, 'amount_minor', v_alloc::text);
    IF (al->>'receivable_settled')::boolean THEN v_settled_now := v_settled_now || r.component; END IF;
  END LOOP;

  -- Interim SE rounding policy (C1b replaces the value): only components this command paid into, only when the
  -- payment is fully allocated, only a shortfall within the policy. An explicit adjustment posting, never a comparison.
  IF v_unallocated = 0 AND COALESCE(p_rounding_max_minor, 0) > 0 THEN
    FOR r IN SELECT x.id, x.component, (x.amount_minor + x.adjusted_minor - x.allocated_minor) AS outstanding FROM public.financial_receivables x
               WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.status = 'open' AND x.component = ANY(v_touched)
    LOOP
      IF r.outstanding > 0 AND r.outstanding <= p_rounding_max_minor THEN
        adj := public.adjust_receivable(p_business_id, r.id, 'rounding', -r.outstanding, NULL, 'payment_command', p_command_key,
          p_command_key || ':rounding:' || r.component, p_actor_type, p_actor_id);
        v_adjustments := v_adjustments || jsonb_build_object('component', r.component, 'receivable_id', r.id, 'delta_minor', (-r.outstanding)::text);
        IF (adj->>'receivable_settled')::boolean THEN v_settled_now := v_settled_now || r.component; END IF;
      END IF;
    END LOOP;
  END IF;

  -- History only: what THIS command did. Current state lives in the projection (R1).
  v_outcome := jsonb_build_object('route', 'kernel', 'state', 'executed', 'payment_id', pay->>'payment_id', 'amount_minor', v_amount::text,
    'target', v_target, 'settled_now', to_jsonb(v_settled_now), 'allocations', v_allocations, 'adjustments', v_adjustments,
    'payment_unallocated_minor', v_unallocated::text);
  INSERT INTO public.financial_payment_commands (business_id, command_key, invoice_id, source, route, state, target, amount_minor, settled_at, provider, method, evidence, observation, payment_id, outcome, actor_type, actor_id)
    VALUES (p_business_id, p_command_key, p_invoice_id, p_source, 'kernel', 'executed', v_target, v_amount, v_settled_at, p_provider, p_method, p_evidence, p_observation, pay->>'payment_id', v_outcome, p_actor_type, p_actor_id)
    RETURNING id INTO v_cmd_id;

  -- Effect intents (B4): owed only when the CUSTOMER component settled in this command; one per receivable and effect, ever.
  IF 'customer' = ANY(v_settled_now) AND p_effects IS NOT NULL THEN
    SELECT x.id INTO v_customer_rec FROM public.financial_receivables x
      WHERE x.business_id = p_business_id AND x.invoice_id = p_invoice_id AND x.component = 'customer';
    FOREACH v_effect IN ARRAY p_effects LOOP
      v_intent_id := NULL;
      INSERT INTO public.financial_effect_intents (business_id, command_id, invoice_id, receivable_id, effect, status)
        VALUES (p_business_id, v_cmd_id, p_invoice_id, v_customer_rec, v_effect, 'pending')
        ON CONFLICT (business_id, receivable_id, effect) DO NOTHING RETURNING id INTO v_intent_id;
      IF v_intent_id IS NULL THEN v_suppressed := v_suppressed || v_effect;
      ELSE v_intents := v_intents || jsonb_build_object('id', v_intent_id, 'effect', v_effect, 'status', 'pending', 'attempts', 0); END IF;
    END LOOP;
  END IF;

  proj := public.financial_project_invoice(p_business_id, p_invoice_id, v_settled_now, v_settled_at, p_source, p_paid_via, p_marked_by);
  RETURN jsonb_build_object('command', v_outcome || jsonb_build_object('replayed', false, 'command_id', v_cmd_id, 'intents', v_intents, 'effects_suppressed', to_jsonb(v_suppressed)), 'projection', proj);
END $fn$;

-- ── RPC 2: claim the intents owed on an invoice (pending, or failed below the retry cap). Stale attempts become 'unknown'.
-- Every claim mints an attempt token (R3); only that token can finish the attempt. ──
CREATE OR REPLACE FUNCTION public.claim_effect_intents(p_business_id TEXT, p_invoice_id TEXT, p_max_attempts INT, p_stale_minutes INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_unknown INT; v_claimed JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  UPDATE public.financial_effect_intents SET status = 'unknown', finished_at = clock_timestamp(),
      last_error = 'attempt did not finish within ' || p_stale_minutes || ' min; delivery unknown, needs a human'
    WHERE business_id = p_business_id AND invoice_id = p_invoice_id AND status = 'attempting'
      AND claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes);
  GET DIAGNOSTICS v_unknown = ROW_COUNT;
  WITH c AS (
    UPDATE public.financial_effect_intents SET status = 'attempting', attempts = attempts + 1, attempt_token = gen_random_uuid()::text,
        claimed_at = clock_timestamp(), finished_at = NULL
      WHERE business_id = p_business_id AND invoice_id = p_invoice_id
        AND (status = 'pending' OR (status = 'failed' AND attempts < p_max_attempts))
      RETURNING id, command_id, receivable_id, effect, attempts, attempt_token)
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.effect), '[]'::jsonb) INTO v_claimed FROM c;
  RETURN jsonb_build_object('claimed', v_claimed, 'marked_unknown', v_unknown);
END $fn$;

-- ── RPC 3: finish one claimed attempt. The token identifies the attempt; a stale or foreign token never mutates a later attempt. ──
-- A late finish carrying the token of an attempt already marked 'unknown' is accepted: the worker now reports what happened.
-- A repeated finish with the same token and the same status is idempotent; a different status for a finished attempt is an error.
CREATE OR REPLACE FUNCTION public.finish_effect_intent(p_business_id TEXT, p_intent_id TEXT, p_attempt_token TEXT, p_status TEXT, p_result JSONB, p_error TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.financial_effect_intents%ROWTYPE;
BEGIN
  IF p_status NOT IN ('sent', 'failed', 'skipped') THEN RAISE EXCEPTION 'financial_effect_status_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_attempt_token IS NULL OR p_attempt_token = '' THEN RAISE EXCEPTION 'financial_effect_attempt_token_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO i FROM public.financial_effect_intents x WHERE x.business_id = p_business_id AND x.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_effect_intent_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF i.attempt_token IS DISTINCT FROM p_attempt_token THEN RAISE EXCEPTION 'financial_effect_attempt_stale' USING ERRCODE = 'check_violation', DETAIL = i.status; END IF;
  IF i.status IN ('sent', 'failed', 'skipped') THEN
    IF i.status = p_status THEN RETURN jsonb_build_object('id', i.id, 'status', i.status, 'attempt', i.attempts, 'idempotent', true); END IF;
    RAISE EXCEPTION 'financial_effect_attempt_finished' USING ERRCODE = 'check_violation', DETAIL = i.status;
  END IF;
  UPDATE public.financial_effect_intents SET status = p_status, finished_at = clock_timestamp(), result = p_result, last_error = p_error
    WHERE business_id = p_business_id AND id = p_intent_id;
  RETURN jsonb_build_object('id', i.id, 'status', p_status, 'attempt', i.attempts, 'idempotent', false, 'was_unknown', i.status = 'unknown');
END $fn$;

REVOKE ALL ON FUNCTION public.financial_invoice_projection(TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.financial_project_invoice(TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.execute_payment_command(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, BIGINT, TEXT[], TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_effect_intents(TEXT, TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.finish_effect_intent(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.execute_payment_command(TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, TEXT, TEXT, JSONB, BIGINT, TEXT[], TEXT, TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_effect_intents(TEXT, TEXT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.finish_effect_intent(TEXT, TEXT, TEXT, TEXT, JSONB, TEXT) TO service_role;

COMMIT;
```

**Verified 2026-09-14 in PGlite on v235–v238 + this draft (`probe8.cjs`, 48 checks; `probe9.cjs`, 6
privilege denials).** PR #60 probes 1–5 as before: same key with a fresh timestamp or a different
body → same `payment_id`; rollback mid-command leaves nothing; old `customer_paid` invoice →
`legacy_routed`, zero receivables; two Fortnox observations → two payments, repeats replay,
manual-then-provider → `no_new_money`, provider below → nothing recorded. **PR #62 R1:** after
command A (customer) the invoice row is `customer_paid`/9 500 with `paid_at`, `paid_via`,
`manual_paid_by_user_id`; after B (tax) it is `paid`/12 500 with `settled_at`; a **replay of A
after B** returns history `settled_now = ['customer']` but `projection.derived_status = 'paid'`,
`recorded_minor 1250000`, `written = false`, and the row stays `paid`/12 500. **R4:**
`no_new_money` returns both receivables, `recorded_minor`, `derived_status 'customer_paid'`
and `intents_owed 6`; `already_paid` returns the projection and the owed count. **R3:** every
claimed intent carries an `attempt_token`; finishing with the same token and status twice is
idempotent; a different status for a finished attempt → `financial_effect_attempt_finished`; a
foreign token → `financial_effect_attempt_stale`; worker one's late finish (token 1) after worker
two claimed (token 2) is rejected and the row stays `attempting/2`; nothing else is claimable
while attempt 2 runs; token 2 finishes; a late finish for an attempt marked `unknown` is
accepted with `was_unknown = true`; a `failed` effect is claimable for attempts 1–3 and never a
fourth time. Golden paths: GP36 `total − 0,50` → both settled, one rounding adjustment −50 on
tax, `paid_amount 12 499,50`; 1,00 short → settled; 1,01 → open; untouched components never
rounded; overpayment → `paid`, `paid_amount 10 100`, `unallocated 10000`. Reversal +
re-settlement → all six effects suppressed. Cross-tenant → `financial_invoice_not_found`;
`anon`, `authenticated` and `service_role` are all denied on the two projection helpers
(owner only); `authenticated` cannot execute the command RPC nor insert into the tables.
Not proven in PGlite: two connections racing on the same key, and A's delayed finish arriving
while B holds a claim, on real Postgres (invariants 14 and 17).

### Facade algorithm (kernel branch)

```text
applyInvoicePayment(opts):
  if not readKernelDispatchFlag(opts.businessId): return applyInvoicePaymentLegacy(opts)     -- frozen, zero kernel RPCs
  return applyInvoicePaymentKernel(opts)

applyInvoicePaymentKernel(opts):
  invoice := same select as legacy (customer_id, numbers for messages)  -- not found → legacy error shape; NEVER used to decide
  cmd := { key: opts.commandKey (required under the flag; throw 'financial_command_key_required' if missing),
           source, target?, amountMinor? (Money.fromLegacyNumber(opts.amount)), settledAt: opts.paidAt ?? now,
           provider/method/evidence per source, observation?: opts.providerObservation,
           roundingMaxMinor: INTERIM_SE_ROUNDING_MAX_MINOR, effects: effectSetFor(opts),
           paidVia: opts.paidVia ?? legacy default per source, markedBy: opts.markedByUserId }
  { command, projection } := kernelDb.rpc('execute_payment_command', cmd)
  if command.route == 'legacy':            return applyInvoicePaymentLegacy(opts)   -- log once per invoice: legacy_routed until C4b
  -- from here the invoice row is already projected by the RPC; the app writes nothing to `invoice`
  if command.state == 'provider_below_kernel' and not command.replayed: rapporteraTystFel(...) once
  effects := sweepIntents(businessId, invoiceId, opts)     -- ALWAYS: claim_effect_intents(3, 10) → run each → finish(id, attempt_token, status)
                                                            -- newly 'unknown' intents (claim.marked_unknown) → rapporteraTystFel once each
  effects += legacy 'skipped' rows for effects excluded by review choices, as legacy reports them
  transition := derive(command.settled_now, projection)     -- table below; 'none' for already_paid / no_new_money / provider_below_kernel
  if command.state == 'already_paid': return { ok, already_paid: true, status: 'paid', transition: 'none', paid_at, effects }
  return legacy ApplyPaymentResult { ok, status: projection.status, transition, paid_at, paid_amount: kr(projection.recorded_minor),
           remaining_rot_kr: kr(outstanding of tax component), effects }
         + kernel: { commandId, paymentId, replayed, unallocatedMinor: projection.unallocated_minor, effectsSuppressed, intentsUnknown }
```

Source → provider/evidence: `manual`/`status_patch` → `'manual'`/`'manual'`; `customer_confirmed`
→ `'manual'` with `method: 'customer_confirmed'`; `fortnox` → `'fortnox'`/`'fortnox'`.

Effect set (`p_effects`): `['pipeline','project_check','project_stage','smart_communication','payment_received_rules','portal_message']`
for an unreviewed call, plus `['invoice_paid_thanks','review_request_schedule']` when `source =
'status_patch'` (R2); for `approvalFollowUps` the same gating as legacy (`updateWorkflows` false →
drop the first three; `runAutomationRules` false → drop `payment_received_rules`; customer
messages become `portal_message` and `review_request` approval artifacts when
`prepareCustomerMessages`). Effects dropped by review are reported `skipped` in `effects[]`
exactly as legacy, without an intent row. Intent runners: one function per effect name in
`lib/financial-kernel/effects/runners.ts`, each calling the legacy code (`runPostPaymentAutomations({ only })`,
`sendPortalNotification`, `preparePaymentCustomerMessages`, `sendPaymentThanks`,
`scheduleReviewRequest`) and mapping the legacy `PaymentEffect.status` to `sent`/`failed`/`skipped`.

### Legacy transition derived from the outcome

| `command.settled_now` contains | `projection.derived_status` | Transition | Status returned |
|---|---|---|---|
| customer | `paid` | `to_paid` | `paid` |
| customer | `customer_paid` | `to_customer_paid` | `customer_paid` |
| customer, tax_authority | `paid` | `to_paid` | `paid` |
| tax_authority only | `paid` | `settled` | `paid` |
| nothing | any | `none` | `projection.status` (unchanged by the command; only `paid_amount` moved) |

`transition` is history (stable on replay, so the caller's message is stable); `status` is
current. A replay of the customer command after the tax command therefore returns
`transition 'to_customer_paid'` with `status 'paid'` — and writes nothing, fires nothing.
`customerJustSettled` for effect purposes no longer exists app-side: intents were created by
the RPC iff the customer component settled in that command.

### Scope

```text
lib/invoices/apply-payment.ts                       (dispatch + kernel branch; legacy body moved verbatim to applyInvoicePaymentLegacy;
                                                     ApplyPaymentOptions += commandKey?, providerObservation?; runPostPaymentAutomations += only?)
lib/invoices/send-invoice.ts                        (eager issuance on delivered, under flag, routing rule)
lib/invoices/sync-to-fortnox.ts                     (invoice_number immutable after issuance, under flag)
lib/fortnox/sync-payments.ts                        (providerObservation + commandKey on both applyInvoicePayment calls; nothing else)
app/api/invoices/[id]/mark-paid/route.ts            (commandKey from header/body or minted; echoed)
app/api/invoices/[id]/status/route.ts               (same, source status_patch; after-payment block → payment-thanks.ts; skipped when result.kernel)
lib/invoices/payment-thanks.ts                      (new; sendPaymentThanks + scheduleReviewRequest moved verbatim from the route)
lib/financial-kernel/effects/runners.ts             (new; one runner per effect name, maps legacy PaymentEffect.status → sent/failed/skipped)
app/api/approvals/[id]/route.ts                     (commandKey customer_confirmed:<approval_id>, target 'customer')
lib/matte/action-executor.ts                        (commandKey from the signal)
app/dashboard/invoices/page.tsx, app/dashboard/invoices/[id]/page.tsx   (Idempotency-Key header)
lib/financial-kernel/dispatch-flag.ts               (new; readKernelDispatchFlag)
lib/financial-kernel/policies/se-rounding.ts        (new; interim policy constant + function)
lib/financial-kernel/commands/service.ts            (new; executePaymentCommand, claimEffectIntents, finishEffectIntent — typed wrappers, strings for money)
lib/financial-kernel/kernel-db.ts                   (new; KernelDb adapter over the service-role client — the only place the two meet)
sql/v239_financial_payment_commands.sql             (as above)
tests/helpers/financial-receivables-database.ts     (+ invoice.status/paid_amount/paid_at/settled_at/paid_via/manual_paid_*, + v239)
tests/financial-kernel-c5-brief-probes.spec.ts      (rewritten: each probe asserts prevention; registered in test:contracts)
tests/financial-kernel-c5-v2-brief-probes.spec.ts   (rewritten the same way: R1 projection, R2 route SMS once, R3 stale finish, R4 no-op projection;
                                                     it loads the v3 SQL from this file and fails today on the two new RPC parameters — expected until rewritten)
tests/financial-kernel-facade.spec.ts               (new; PGlite + injected legacy deps; golden paths under both flag states)
tests/financial-kernel-facade-legacy-frozen.spec.ts (new; legacy source identical to main; flag-off makes no kernel RPC, also pre-v239 schema)
package.json, .github/workflows/contracts.yml, docs (handoff)
```

### Invariants (tests first)

1. **Legacy frozen:** flag off → identical results and identical `invoice` writes to `main` for
   every existing test in `apply-payment-decision.spec.ts`, `facit-invoice-customer-paid.spec.ts`,
   `fortnox-classify-payment.spec.ts`; the `KernelDb` fake is never called; the legacy function's
   source equals the pre-C5 body (facit); the dispatch read tolerates a `business_config` without
   the column (pre-v238 deploy) and answers `false`.
2. **Command identity (from Codex probes 1 and 2):** the same `commandKey` twice, with a fresh
   default `paidAt` and even with a different `amount`, yields one payment, one allocation set,
   one intent set, one `payment_received`; the second call reports `kernel.replayed = true` and
   the same transition. A different key on the resulting `customer_paid` ROT invoice records the
   tax payment with `transition 'settled'` and no intents.
3. **Atomic kernel step (from probe 3):** a fault injected after `execute_payment_command`
   returns (between intents, after an intent send) leaves the kernel and the projected invoice
   row consistent; the retried request returns the same transition and finishes only the intents
   still `pending`/`failed`; no intent is dispatched twice; a stale `attempting` intent becomes
   `unknown` and is reported once, never re-sent automatically.
4. **Fortnox observation (from probe 4):** two distinct balances produce two distinct
   observations and keys; `syncFortnoxPaymentsForBusiness` through the flagged facade on the
   classifier's fixtures produces today's counters; a second run with the same observation is a
   replay with no new payment; manual-then-provider is `no_new_money`; flag off → the legacy
   branch receives exactly today's arguments plus the ignored observation.
5. **Routing (from probe 5):** an invoice `customer_paid` with `paid_amount 9500` and no
   receivables goes to the legacy body under the flag, settles as today, and never gets receivables
   from the facade; the routing outcome is persisted on the command row.
6. **Dispatch flag (from probe 6):** flag off → zero `rpc()` calls; the C4 helper is untouched.
7. **Equivalence table:** golden paths 1, 5, 12, 30, 34, 36 → same `status`, transition sequence
   and `payment_received` count as `legacyStatus`/`legacyPaymentReceived`; 4, 7, 37 → the
   documented divergence, named as intended in the test.
8. **Rounding boundary:** 0,01 and 1,00 short → settled with a `receivable_adjusted{rounding}` of
   exactly that amount; 1,01 → open, no adjustment; ROT `total − 0,50` → customer 9 500, tax
   2 999,50 + rounding 0,50, `paid`, one `payment_received`; a component the command did not pay
   into is never rounded.
9. **Approval path:** `customer_confirmed` keeps preparing the separate approval cards; key is
   the approval id; a redelivered approval is a replay.
10. **Issuance:** first payment on a never-paid invoice issues with `issued_date = invoice_date`;
    `recordInvoiceDeliveryOutcome` success under the flag issues once and only when the routing
    rule allows; failure and flag off issue nothing.
11. **Number immutability:** under the flag with receivables present the Fortnox receipt update
    leaves `invoice_number`; otherwise as today.
12. **Marker semantics for C5b:** an intent row exists for `(customer receivable, effect)` before
    any effect runs (it is created in the RPC transaction; asserted by reading the table before the
    first runner is invoked); reversal + re-settlement yields `effects_suppressed` for all effects
    and no second thank-you.
13. **Contract test still green:** `fireEvent` only in `apply-payment.ts` and the bridge; no
    undocumented event name; no `Number(` on minor amounts in new kernel files; the rounding
    constant appears only as an RPC argument (source-scan).
14. **Postgres CI:** two connections executing the same `commandKey` concurrently → one payment,
    one outcome, both callers see the same `command_id`.
15. **R1 projection (from PR #62 test 1):** A (customer) → B (tax) → replay A: the invoice row is
    `paid`/12 500 before and after the replay; the replay returns `transition 'to_customer_paid'`
    with `status 'paid'` and `kernel.replayed = true`; the facade never writes `invoice` (spy on
    the service client: zero `from('invoice').update` calls in the kernel branch). Postgres CI:
    A and B on two connections in either order end with the row `paid`/12 500.
16. **R2 route SMS (from test 4):** the real status route with the flag on, the same
    `Idempotency-Key` twice → `sendSmsViaElks` once and one `scheduled_review_request` row; a fault
    injected after the RPC and before dispatch → zero sends, then the retry sends once; flag off →
    the route's block behaves exactly as today (same fixtures as `facit-invoice-customer-paid`).
17. **R3 attempt identity (from test 3):** worker one's finish with token 1 after worker two's
    claim is rejected with `financial_effect_attempt_stale` and the row stays `attempting/2`; the
    same finish twice with the current token is idempotent; a foreign token never mutates;
    Postgres CI: the delayed finish arrives on a second connection while the first holds the claim.
18. **R4 complete outcomes (from test 2):** through the actual facade, `no_new_money`,
    `provider_below_kernel` and `already_paid` return `status` and `paid_amount` from the
    projection, `transition 'none'`, and still sweep owed intents (a pending intent left by a
    crashed earlier command is dispatched by the no-op call).

### Acceptance (orchestration §5 C5 + §9)

All existing invoice/payment suites green unchanged; all kernel suites green including the
rewritten probes; `tsc` clean; the flag defaults false and no business has it set; the diff
outside the listed legacy files is additive; handoff states which golden paths diverge and why,
and lists every caller with its key.

### Not in this package

The consumer runner, the event-driven bridge, the periodic intent sweeper and the admin surface
for `unknown` intents (C5b). Re-projecting an invoice after a reversal reopens a component (C14). Real rounding policy and account
(C1b). Opening balances and the end of `legacy_routed` (C4b). Refund of unallocated overpayment
(C7/C14). Reconciliation of `provider_below_kernel` (C11). Supplier side (C4s). Any flag flip
for any business (C6).

### Handoff back

Orchestration §7 block under §2, same PR, including the list of behaviours that differ under
the flag and the conversion table probe → prevention test (ten probes across PR #60 and #62).
Claude reviews against §6 A, B, C, E with B as the centre.

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
`receivable_settled{customer}` → the same effects the facade runs inline, guarded by
`financial_effect_intents` (brief v2: an intent row for the receivable and effect means the
inline path owns delivery and the bridge stays silent; no row means a producer that is not the
facade — ROT decision import, PSP webhooks in C7 — and the bridge creates the intents and
dispatches them). Adds the periodic sweeper for `pending`/`failed` intents and the admin surface
for `unknown` ones. Moves the thank-you SMS out of `[id]/status/route.ts` into the bridge.
Handler gets an `AbortSignal` (C3 review).

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

### C5 v2 retry integration — Codex, 2026-09-14

PR #61 merged after green CI, incorporating #60. Four diagnostic tests execute the exact v2
DDL in isolated PGlite and, for SMS, the real status route with the prescribed facade response
and stubbed provider. All four reproduce defects; TypeScript passes. These are not C5
acceptance results. Full evidence and corrections: [v2 review](FINANCIAL_KERNEL_C5_V2_REVIEW.md).

| Sev | Finding | Required correction |
|---|---|---|
| BLOCKER R1 | A customer-command replay after the tax command returns old receivables/9500 kr; the mandated re-projection downgrades a fully paid invoice. | Separate command history from current projection; serialize or revision-guard projection writes. |
| BLOCKER R2 | Stored replay transition re-enters the unchanged route's thank-you SMS block; two sends are attempted outside the intent protocol. | Include flagged route-owned effects in durable dispatch; skipping all replays alone loses crash recovery. |
| HIGH R3 | Duplicate finish from attempt 1 can mark active attempt 2 failed, permitting attempt 3 while worker 2 sends. | Attempt token/version required by finish, stale acknowledgements rejected. |
| MEDIUM R4 | no_new_money/provider_below_kernel omit the projection fields the facade requires; already_paid skips the promised sweep. | Complete typed outcomes and recovery path for every kernel state. |

The v1 findings' accepted fixes stand. C5 application integration has not been written and
v239 has not been applied externally. Diagnostic assertions must become prevention tests
when these corrections are implemented. The §3 v2 SQL is preserved verbatim for reproduction.

**Claude response 2026-09-14 (brief v3 in §3).** All four accepted. The v2 SQL block is replaced
by v3 in §3; the v2 text stays in git history (PR #61) and in the probe spec's own quotation.

| Finding | Resolution in v3 | Proof |
|---|---|---|
| R1 | The RPC projects `invoice` from **current** kernel state under the invoice row lock, in the command transaction; replays write nothing; the app never writes `invoice` in the kernel branch. `command` (history) and `projection` (current) are separate objects in every response. | PGlite: A → B → replay A keeps the row `paid`/12 500; replay returns history `['customer']` and projection `paid`, `written = false` |
| R2 | Status route after-payment effects (thank-you SMS, scheduled review request) move verbatim to `lib/invoices/payment-thanks.ts`; flag on → intents `invoice_paid_thanks`, `review_request_schedule` for `status_patch`; flag off → the route calls them as today | Invariant 16 (route-level, needs the facade to exist) |
| R3 | `claim` mints `attempt_token`; `finish` requires it; stale/foreign → `financial_effect_attempt_stale` with no mutation; same token + same status idempotent; late finish on `unknown` accepted | PGlite: worker one's late finish after worker two's claim rejected, row stays `attempting/2`; nothing claimable meanwhile |
| R4 | Every state returns `{command, projection}`; `projection.intents_owed/unknown`; the facade sweeps on every call; `already_paid` and `no_new_money` re-project | PGlite: `no_new_money` → 2 receivables, `recorded_minor`, `derived_status`, `intents_owed 6`; `already_paid` → projection + owed count |

Findings that a review left open, or accepted with a note, so that a merge does not erase
them. BLOCKER/HIGH must be resolved before merge; MEDIUM before the feature flag; LOW is
tracked.

### C5 brief (PR #59), Codex review 2026-09-14 — correction required

PR #59 merged at `b949c7635` after all checks passed. Before changing legacy callers, six
diagnostic probes against real C4 RPCs and the real Fortnox caller reproduced contract gaps.
The probes pass by demonstrating the counterexamples, **not** C5 acceptance. Full evidence,
proposed correction boundaries and handoff: [C5 brief review](FINANCIAL_KERNEL_C5_BRIEF_REVIEW.md).

| Sev | Finding | Status |
|---|---|---|
| BLOCKER B1 | Deriving key/amount/target from current open components turns a duplicate customer payment into a distinct tax payment; fresh default timestamps also conflict on explicit-amount retries. | Stable command identity and persisted original parameters required. |
| BLOCKER B2 | Real Fortnox caller omits Balance/DocumentNumber and passes cumulative amounts; distinct provider snapshots can produce identical facade arguments. | Explicit observation and reconciliation contract needed; caller is currently outside allowed edits. |
| BLOCKER B3 | Lazy issuance loses existing legacy paid amounts; an old customer_paid invoice's tax settlement is applied to a newly opened customer component. | Opening-balance prerequisite or explicit cut-over exclusion/routing required. |
| HIGH B4 | Retry after committed allocation has no "settled now" outcome; pre-effect marker or early paid return can permanently suppress undelivered effects after a crash. | Recoverable command outcome and durable effect intent/completion contract required; do not label the proposed marker exactly-once delivery. |
| MEDIUM M1 | Existing flag helper calls a kernel RPC even when disabled; it cannot meet the proposed zero-RPC and pre-migration dispatch requirement. | Separate application dispatch flag reader, with explicit pre-migration handling. |

Only this review, package-log status and diagnostic tests are changed. No application code,
remote migration or flag activation. The §3 proposal is preserved so the contract owner can
revise the exact assumptions; it is not an approved implementation algorithm while these
findings remain open.

**Claude response 2026-09-14 (brief v2 in §3).** All five accepted. Two readings corrected:
(a) B1's "duplicate of the customer's payment command" — a second *distinct* command on a
`customer_paid` ROT invoice is, in legacy semantics, the Skatteverket payment (the mark-paid
route documents it); the fault was that a *retry* could not be told from a new command. v2
makes identity a caller-supplied key and persists the resolved parameters, so a retry replays
and a new command is a new key. (b) B4's marker — v2 has no marker separate from the
obligation: the intent row is created in the kernel transaction and is what C5b's bridge checks.

| Finding | Resolution in v2 | Proof |
|---|---|---|
| B1 | `execute_payment_command` keyed by `(business_id, command_key)`; target/amount/`settled_at` resolved once, stored, replayed | PGlite: same key with a fresh timestamp or a different body → same `payment_id`, one payment |
| B2 | `providerObservation` from the Fortnox caller; RPC records `snapshot − kernel_recorded`, stores `no_new_money`/`provider_below_kernel` | PGlite: 950000 then 1250000 → two payments; repeat → replay; manual-then-provider → nothing new |
| B3 | Persisted routing: legacy evidence + no receivables → `legacy_routed`, frozen body runs; C4b ends it | PGlite: old `customer_paid` invoice → no receivables, no payment, both commands routed legacy |
| B4 | One transaction for the kernel step; intents `pending→attempting→sent/failed/skipped/unknown`; sweep on every call; `unknown` to a human | PGlite: rollback leaves nothing; claim/finish lifecycle; stale → `unknown`; retry cap 3; reversal + re-settlement → all effects suppressed |
| M1 | `readKernelDispatchFlag` reads the column; absent → false | Invariant 1 and 6 |

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
| 2026-09-14 | C5 brief v2 after Codex review PR #60 (B1–B4, M1 accepted): command identity + atomic `execute_payment_command`, provider observation, persisted legacy routing, effect intents, dispatch flag reader; v239 draft embedded and verified in PGlite (34 checks). v1 retired to git history. Response recorded in §5. | Package C5 prep v2 |
| 2026-09-14 | C5 brief v3 after Codex review PR #62 (R1–R4 accepted): projection written by the RPC from current state under the invoice lock, `{command, projection}` on every state, attempt tokens on claim/finish, status-route effects as intents; v239 draft re-verified in PGlite (48 checks + 6 privilege denials). v2 retired to git history. Response in §5. | Package C5 prep v3 |
