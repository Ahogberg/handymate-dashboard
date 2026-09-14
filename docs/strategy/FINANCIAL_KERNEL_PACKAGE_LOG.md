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
| C5 | `applyInvoicePayment()` compatibility facade | Codex | **done 2026-09-14** (PR #66 merged; Claude review A/B/C/E: no BLOCKER, 3 MEDIUM resolved and re-verified; 4 LOW carried into C5b) | — |
| C5b | Consumer bridge, shared sweep and human recovery | Codex | **done 2026-09-14** (PR #71 merged; review §5, 3 LOW carried to C6; see [C5b handoff](FINANCIAL_KERNEL_C5B_HANDOFF.md)) | — |
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
  TypeScript passes with an 8 GiB Node heap (the default heap was exhausted). The local
  production build passes; this checkout has no live integration credentials, so its
  prerender logs include missing Supabase configuration. This is compilation/build evidence,
  not an authenticated integration test. Final current-head CI is recorded on #66.

Contract / remaining work
: No event, SQL/RPC definition, feature flag or accounting policy change. Relies on FK.3,
  blueprint §18 and orchestration §9. ROT and legacy cut-over paths are covered; no VAT
  computation or posting rule is introduced. No new accounting approval is required.
  Claude's four LOW groups remain tracked in the review / PR #67. C5b is not implemented.
  R0/P0/C1b and owner decisions remain unchanged. **No v239 in production and no feature
  flag activation before C5 merge and the owner's C6 pilot selection.**

## 3. Next package — Codex brief: C5b the consumer runner, the event bridge, the sweeper and the human loop

> **Written 2026-09-14 after C5 merged (PR #66).** The C5 v3 brief is retired to git history
> (outcome: C5 handoff in §2, review in §5). C5b closes the fundament: the C3 consumer gets a
> runner, the bridge becomes a real producer of effect intents for payments that do not pass
> through the facade, the sweeper finishes what a crashed request owed, and a human gets a
> surface for `unknown` intents and halted consumers. It also carries the four LOW findings from
> the C5 review. **No flag flip for any business** (C6). v240 is proposed and verified in PGlite;
> not applied anywhere.

Read first: orchestration §5 C5b, §6 A+B+C, §9; blueprint §18.6, §20; `ARCHITECTURE.md` §FK.3;
C3 handoff and review (§2, §5: lease model, ordered ack, halt-never-skip, `AbortSignal` ask);
C4 review (§5: marker per `receivable_id`); C5 handoff (§2) and review (§5: the four LOW);
`lib/financial-kernel/events/consume.ts`, `bridge-automation.ts` (placeholder + TODO),
`lib/financial-kernel/commands/facade.ts` (the sweep block), `lib/financial-kernel/effects/runners.ts`,
`sql/v236`, `sql/v239`; cron pattern `app/api/cron/fortnox-sync/route.ts` + `lib/cron/verify-secret.ts`;
admin gate `lib/auth/superadmin.ts` (`isSuperAdmin`) as used by `app/api/admin/*`.

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **The bridge handler is database-only.** On `receivable_settled` with `payload.component = 'customer'` it calls `ensure_effect_intents(receivable_id, event_id, effects, context)`; every other event type returns. It never dispatches an effect. | C3: a handler may not outlive its lease and a timeout cannot cancel a send. Creating intents is idempotent per `(receivable_id, effect)`, so at-least-once delivery of the event is harmless. C4 review: one marker per receivable, ever. |
| **Dispatch happens in exactly two places:** the facade's inline sweep (C5) and the cron sweeper (C5b). Both use one shared `sweepInvoiceIntents()` extracted from the facade. | One code path for claim → run → finish, one place for the `unknown`/`exhausted` reports. |
| **Facade-owned intents win.** The bridge's `ensure_effect_intents` is `ON CONFLICT DO NOTHING`; for a facade payment every effect comes back `suppressed`. For a non-facade producer (C7 PSP webhook, ROT decision import, a C4 RPC called by anything else) the bridge creates them with `context.source = 'bridge'`. | Brief v2/v3 marker semantics, now executable. |
| **Bridge effect set = the unreviewed six** (`pipeline`, `project_check`, `project_stage`, `smart_communication`, `payment_received_rules`, `portal_message`). Not `invoice_paid_thanks`/`review_request_schedule`: those belong to the status-route flow in legacy and stay `status_patch`-only. | Legacy parity. C7 decides whether a PSP payment earns the thank-you SMS. |
| **The consumer runs from a cron route**, `GET /api/cron/financial-kernel`, `verifyCronSecret`, `dynamic = 'force-dynamic'`, `maxDuration = 300`, every 10 minutes in `vercel.json`. Per business with `financial_kernel_enabled = true`: `consumeOnce(automation-bridge, { limit: 100 })`, then the sweep over `list_owed_effect_intents(3, 10, 50)`. A wall-clock budget of 240 s stops the loop; the next run continues. | Repo cron contract. Flag-off businesses cost one `business_config` read per run and nothing else. |
| **Halted consumer = a human's.** A run that finds `halted_at` set reports once via `rapporteraTystFel('financial-kernel:consumer-halted', …)`; `resume_financial_consumer` (C3, actor + reason) is exposed on the admin API, never called automatically. | C3 halt-never-skip. |
| **`unknown` and exhausted intents get a human surface**: `list_unresolved_effect_intents` and `resolve_effect_intent(delivered | abandon | retry, actor, reason)`. `retry` resets attempts and returns the intent to `pending` for the next sweep; `delivered` → `sent`; `abandon` → `skipped`. Every resolution is appended to the row's `resolution` log. | C5 brief: never auto-resend an unknown. The decision is recorded with who and why. |
| **Sweeper concurrency:** two sweepers on the same business are serialised by `financial_lock` inside `claim_effect_intents`; the second sees nothing claimable. Proven in Postgres CI. | Same lock discipline as every kernel RPC. |
| **The four C5 LOWs are in scope:** 400 on a malformed `Idempotency-Key`; the Fortnox receipt path never throws (omit `invoice_number`, report); the number trigger `RAISE NOTICE`s when it reverts (v240); claim bounds validated (v240); a runner test that executes the real `invoice_paid_thanks` / `review_request_schedule` paths with `sendSmsViaElks` stubbed. | Carried from the C5 review. |
| **Legacy path untouched.** The status route's thank-you block for flag-off businesses stays as it is; under the flag it is already intents (C5). The v1 idea "move the SMS into the bridge" is superseded. | Frozen legacy. |

### v240 — implement as written (deviations in the handoff with reasons)

```sql
-- v240_financial_bridge_intents.sql — DRAFT for the C5b brief (Claude, 2026-09-14).
-- Verified in PGlite on top of v235–v239 (probe11.cjs). Codex implements as written; deviations in the handoff.
BEGIN;

-- ── Intents can now be owed by a producer that is not the facade (bridge on receivable_settled{customer}) ──
ALTER TABLE public.financial_effect_intents ALTER COLUMN command_id DROP NOT NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS source_event_id TEXT NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS context JSONB NULL;
ALTER TABLE public.financial_effect_intents ADD COLUMN IF NOT EXISTS resolution JSONB NULL;
ALTER TABLE public.financial_effect_intents DROP CONSTRAINT IF EXISTS financial_effect_intents_origin_check;
ALTER TABLE public.financial_effect_intents ADD CONSTRAINT financial_effect_intents_origin_check
  CHECK ((command_id IS NOT NULL) <> (source_event_id IS NOT NULL));
ALTER TABLE public.financial_effect_intents DROP CONSTRAINT IF EXISTS financial_effect_intents_source_event_fk;
ALTER TABLE public.financial_effect_intents ADD CONSTRAINT financial_effect_intents_source_event_fk
  FOREIGN KEY (business_id, source_event_id) REFERENCES public.financial_events(business_id, id);
CREATE INDEX IF NOT EXISTS idx_financial_effect_intents_unknown ON public.financial_effect_intents (business_id, finished_at) WHERE status = 'unknown';

-- ── RPC: the bridge's producer. Idempotent per (receivable, effect); silent when the facade already owns delivery. ──
CREATE OR REPLACE FUNCTION public.ensure_effect_intents(
  p_business_id TEXT, p_receivable_id TEXT, p_source_event_id TEXT, p_effects TEXT[], p_context JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE rec public.financial_receivables%ROWTYPE; v_effect TEXT; v_id TEXT; v_created JSONB := '[]'; v_suppressed TEXT[] := '{}'; v_recorded BIGINT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  SELECT * INTO rec FROM public.financial_receivables x WHERE x.business_id = p_business_id AND x.id = p_receivable_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_receivable_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF rec.component <> 'customer' OR rec.status <> 'settled' THEN RAISE EXCEPTION 'financial_intent_receivable_not_settled_customer' USING ERRCODE = 'check_violation'; END IF;
  PERFORM 1 FROM public.financial_events e WHERE e.business_id = p_business_id AND e.id = p_source_event_id AND e.event_type = 'receivable_settled'
    AND e.source_type = 'receivable' AND e.source_id = p_receivable_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_intent_source_event_invalid' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p_effects IS NULL OR array_length(p_effects, 1) IS NULL THEN RAISE EXCEPTION 'financial_intent_effects_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT COALESCE(sum(p.amount_minor), 0) INTO v_recorded FROM public.financial_payments p
    WHERE p.business_id = p_business_id AND p.correlation_id = 'fin_invoice_' || rec.invoice_id AND p.status = 'settled' AND p.direction = 'inbound';
  FOREACH v_effect IN ARRAY p_effects LOOP
    v_id := NULL;
    INSERT INTO public.financial_effect_intents (business_id, source_event_id, invoice_id, receivable_id, effect, status, context)
      VALUES (p_business_id, p_source_event_id, rec.invoice_id, rec.id, v_effect, 'pending',
        COALESCE(p_context, '{}'::jsonb) || jsonb_build_object('source', 'bridge', 'paidAmountMinor', v_recorded::text, 'sourceEventId', p_source_event_id))
      ON CONFLICT (business_id, receivable_id, effect) DO NOTHING RETURNING id INTO v_id;
    IF v_id IS NULL THEN v_suppressed := v_suppressed || v_effect;
    ELSE v_created := v_created || jsonb_build_object('id', v_id, 'effect', v_effect); END IF;
  END LOOP;
  RETURN jsonb_build_object('receivable_id', rec.id, 'invoice_id', rec.invoice_id, 'created', v_created, 'suppressed', to_jsonb(v_suppressed));
END $fn$;

-- ── RPC: claim, now with C5-review LOW fix (validated bounds) and per-intent context for bridge-owed intents ──
CREATE OR REPLACE FUNCTION public.claim_effect_intents(p_business_id TEXT, p_invoice_id TEXT, p_max_attempts INT, p_stale_minutes INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_unknown INT; v_claimed JSONB; v_unknown_ids JSONB;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_max_attempts IS NULL OR p_max_attempts NOT BETWEEN 1 AND 10 OR p_stale_minutes IS NULL OR p_stale_minutes NOT BETWEEN 1 AND 60 THEN
    RAISE EXCEPTION 'financial_effect_claim_limits_invalid' USING ERRCODE = 'check_violation';
  END IF;
  WITH expired AS (UPDATE public.financial_effect_intents SET status = 'unknown', finished_at = clock_timestamp(),
      last_error = 'attempt did not finish within ' || p_stale_minutes || ' min; delivery unknown, needs a human'
    WHERE business_id = p_business_id AND invoice_id = p_invoice_id AND status = 'attempting'
      AND claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes) RETURNING id)
  SELECT count(*), COALESCE(jsonb_agg(id), '[]'::jsonb) INTO v_unknown, v_unknown_ids FROM expired;
  WITH c AS (
    UPDATE public.financial_effect_intents SET status = 'attempting', attempts = attempts + 1, attempt_token = gen_random_uuid()::text,
        claimed_at = clock_timestamp(), finished_at = NULL
      WHERE business_id = p_business_id AND invoice_id = p_invoice_id
        AND (status = 'pending' OR (status = 'failed' AND attempts < p_max_attempts))
      RETURNING id, command_id, receivable_id, effect, attempts, attempt_token, context)
  SELECT COALESCE(jsonb_agg((to_jsonb(c) - 'context') || jsonb_build_object('context', COALESCE(c.context, cmd.effect_context)) ORDER BY c.effect), '[]'::jsonb)
    INTO v_claimed FROM c LEFT JOIN public.financial_payment_commands cmd ON cmd.business_id = p_business_id AND cmd.id = c.command_id;
  RETURN jsonb_build_object('claimed', v_claimed, 'marked_unknown', v_unknown, 'unknown_ids', v_unknown_ids);
END $fn$;

-- ── RPC: the sweeper's work list. One row per invoice with something owed; stale attempts are counted so the sweeper claims them into 'unknown'. ──
CREATE OR REPLACE FUNCTION public.list_owed_effect_intents(p_business_id TEXT, p_max_attempts INT, p_stale_minutes INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('invoice_id', x.invoice_id, 'owed', x.owed, 'stale', x.stale) ORDER BY x.oldest), '[]'::jsonb)
  FROM (
    SELECT i.invoice_id,
           count(*) FILTER (WHERE i.status = 'pending' OR (i.status = 'failed' AND i.attempts < p_max_attempts)) AS owed,
           count(*) FILTER (WHERE i.status = 'attempting' AND i.claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes)) AS stale,
           min(i.created_at) AS oldest
      FROM public.financial_effect_intents i
     WHERE i.business_id = p_business_id AND i.status IN ('pending', 'failed', 'attempting')
     GROUP BY i.invoice_id
    HAVING count(*) FILTER (WHERE i.status = 'pending' OR (i.status = 'failed' AND i.attempts < p_max_attempts)
                              OR (i.status = 'attempting' AND i.claimed_at < clock_timestamp() - make_interval(mins => p_stale_minutes))) > 0
     LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 500)
  ) x
$fn$;

-- ── RPC: a human resolves an 'unknown' (or exhausted 'failed') intent. Actor and reason are mandatory and persisted. ──
CREATE OR REPLACE FUNCTION public.resolve_effect_intent(
  p_business_id TEXT, p_intent_id TEXT, p_resolution TEXT, p_actor_id TEXT, p_reason TEXT, p_max_attempts INT
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE i public.financial_effect_intents%ROWTYPE; v_status TEXT;
BEGIN
  PERFORM public.financial_lock(p_business_id);
  IF p_resolution NOT IN ('delivered', 'abandon', 'retry') THEN RAISE EXCEPTION 'financial_effect_resolution_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF nullif(btrim(p_actor_id), '') IS NULL OR nullif(btrim(p_reason), '') IS NULL THEN RAISE EXCEPTION 'financial_effect_resolution_requires_actor_and_reason' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO i FROM public.financial_effect_intents x WHERE x.business_id = p_business_id AND x.id = p_intent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_effect_intent_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF NOT (i.status = 'unknown' OR (i.status = 'failed' AND i.attempts >= p_max_attempts)) THEN
    RAISE EXCEPTION 'financial_effect_intent_not_resolvable' USING ERRCODE = 'check_violation', DETAIL = i.status;
  END IF;
  v_status := CASE p_resolution WHEN 'delivered' THEN 'sent' WHEN 'abandon' THEN 'skipped' ELSE 'pending' END;
  UPDATE public.financial_effect_intents SET status = v_status,
      finished_at = CASE WHEN v_status = 'pending' THEN NULL ELSE clock_timestamp() END,
      attempt_token = CASE WHEN v_status = 'pending' THEN NULL ELSE attempt_token END,
      claimed_at = CASE WHEN v_status = 'pending' THEN NULL ELSE claimed_at END,
      attempts = CASE WHEN v_status = 'pending' THEN 0 ELSE attempts END,
      resolution = COALESCE(resolution, '[]'::jsonb) || jsonb_build_object('at', clock_timestamp(), 'by', p_actor_id, 'from', i.status, 'to', v_status, 'reason', p_reason)
    WHERE business_id = p_business_id AND id = p_intent_id;
  RETURN jsonb_build_object('id', i.id, 'from', i.status, 'to', v_status);
END $fn$;

-- ── RPC: what a human sees. Unknown and exhausted intents per business, with the command/event that owed them. ──
CREATE OR REPLACE FUNCTION public.list_unresolved_effect_intents(p_business_id TEXT, p_max_attempts INT, p_limit INT)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE(jsonb_agg(jsonb_build_object('id', i.id, 'invoice_id', i.invoice_id, 'receivable_id', i.receivable_id, 'effect', i.effect,
           'status', i.status, 'attempts', i.attempts, 'claimed_at', i.claimed_at, 'finished_at', i.finished_at, 'last_error', i.last_error,
           'command_id', i.command_id, 'source_event_id', i.source_event_id, 'resolution', i.resolution) ORDER BY i.finished_at NULLS LAST, i.created_at), '[]'::jsonb)
  FROM (SELECT * FROM public.financial_effect_intents i WHERE i.business_id = p_business_id
          AND (i.status = 'unknown' OR (i.status = 'failed' AND i.attempts >= p_max_attempts))
        ORDER BY i.finished_at NULLS LAST, i.created_at LIMIT LEAST(GREATEST(COALESCE(p_limit, 100), 1), 500)) i
$fn$;

-- ── C5-review LOW: the issued-number guard says so when it reverts ──
CREATE OR REPLACE FUNCTION public.financial_preserve_issued_number()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
 IF NEW.invoice_number IS DISTINCT FROM OLD.invoice_number
 AND EXISTS(SELECT 1 FROM public.business_config WHERE business_id=NEW.business_id AND financial_kernel_enabled)
 AND EXISTS(SELECT 1 FROM public.financial_receivables WHERE business_id=NEW.business_id AND invoice_id=NEW.invoice_id) THEN
   RAISE NOTICE 'financial_preserve_issued_number: invoice % keeps number % (attempted %)', NEW.invoice_id, OLD.invoice_number, NEW.invoice_number;
   NEW.invoice_number := OLD.invoice_number;
 END IF;
 RETURN NEW;
END $fn$;

REVOKE ALL ON FUNCTION public.ensure_effect_intents(TEXT, TEXT, TEXT, TEXT[], JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_owed_effect_intents(TEXT, INT, INT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_effect_intent(TEXT, TEXT, TEXT, TEXT, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_unresolved_effect_intents(TEXT, INT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_effect_intents(TEXT, TEXT, TEXT, TEXT[], JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_owed_effect_intents(TEXT, INT, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_effect_intent(TEXT, TEXT, TEXT, TEXT, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_unresolved_effect_intents(TEXT, INT, INT) TO service_role;

COMMIT;
```

**Verified 2026-09-14 in PGlite on v235–v239 (`main` after #66) + this draft (`probe11.cjs`, 24 checks):**
after a facade payment the bridge's `ensure_effect_intents` creates nothing and suppresses all six;
for a C7-style producer (C4 RPCs called directly, `receivable_settled` appended) it creates six
intents with `source_event_id`, `context.source = 'bridge'`, `paidAmountMinor` from the invoice's
settled payments, and a second call suppresses all six; an event of another type, an event of
another receivable, and an open or tax receivable are all rejected; `claim` returns the intent's
own context for bridge intents and the command's for facade intents; `list_owed_effect_intents`
lists nothing while attempts are fresh and lists the invoice with `stale 6` after backdating;
claim bounds accept stale 5 and reject 0 and max 11; `resolve` requires actor and reason,
`delivered` → `sent`, `retry` → `pending` with attempts 0 and no token, `abandon` → `skipped`,
a resolved intent cannot be resolved again, an exhausted `failed` intent is listed and can be
retried and then shows as owed again; the resolution log carries from/to/by/reason; all four new
RPCs are executable by `service_role` only. Twelve intents in total, six by command and six by
event. Not proven in PGlite: two sweepers racing (Postgres CI, invariant 12) and the consumer
loop itself (covered by C3's suites; C5b adds the bridge through `consumeOnce`).

### Runtime shape

```text
GET /api/cron/financial-kernel                       (verifyCronSecret; 401 otherwise)
  for business in business_config where financial_kernel_enabled:
    consumeOnce(kernelDb, business, automationBridge, { limit: 100 })   -- handler: receivable_settled{customer} → ensure_effect_intents
      if result.halted: rapporteraTystFel('financial-kernel:consumer-halted') once per run
    for row in list_owed_effect_intents(business, 3, 10, 50):
      sweepInvoiceIntents(business, row.invoice_id)                     -- claim → runPaymentEffect → finish; unknown/exhausted reported
    stop when 240 s elapsed; return { businesses, consumed, swept, halted, unknown }

automationBridge.handle(event, db):
  if event.eventType !== 'receivable_settled' or event.payload.component !== 'customer': return
  ensure_effect_intents(business, event.payload.receivable_id, event.eventId, BRIDGE_EFFECTS, { source: 'bridge' })

sweepInvoiceIntents(business, invoiceId):                                -- extracted from facade.ts, used by facade + cron
  claims := claim_effect_intents(business, invoiceId, 3, 10)
  report each claims.unknown_ids once ('financial-kernel:effect-unknown')
  for intent in claims.claimed: result := runPaymentEffect(...); finish_effect_intent(id, attempt_token, status)
    if failed and attempts >= 3: report 'financial-kernel:effect-exhausted'
  return effects[]

GET  /api/admin/financial-kernel/intents?business_id=…        (isSuperAdmin) → list_unresolved_effect_intents
POST /api/admin/financial-kernel/intents/{id}/resolve         { resolution, reason } → resolve_effect_intent(actor = admin user id)
GET  /api/admin/financial-kernel/consumers?business_id=…      → get_financial_consumer_status
POST /api/admin/financial-kernel/consumers/resume             { business_id, consumer, reason } → resume_financial_consumer
```

Admin UI: one section on the existing admin page, "Ekonomikärnan — utskick som kräver beslut",
listing unresolved intents (invoice, effect, status, attempts, last error) with three buttons
(Levererat, Avbryt, Försök igen) that require a reason, and halted consumers with Återuppta.
No design work beyond the page's existing components.

### Scope

```text
sql/v240_financial_bridge_intents.sql               (as above)
lib/financial-kernel/events/bridge-automation.ts    (real handler; DB-only; BRIDGE_EFFECTS constant)
lib/financial-kernel/effects/sweep.ts               (new; sweepInvoiceIntents extracted from facade.ts, facade calls it)
lib/financial-kernel/commands/service.ts            (+ ensureEffectIntents, listOwedEffectIntents, listUnresolvedEffectIntents, resolveEffectIntent wrappers)
app/api/cron/financial-kernel/route.ts              (new; consumer + sweeper per flagged business; time budget)
vercel.json                                         (+ cron every 10 min)
app/api/admin/financial-kernel/intents/route.ts, …/intents/[id]/resolve/route.ts, …/consumers/route.ts, …/consumers/resume/route.ts (new; isSuperAdmin)
app/admin/page.tsx                                  (section "Ekonomikärnan — utskick som kräver beslut")
lib/invoices/payment-command-key.ts + both routes   (LOW: malformed key → 400)
lib/invoices/sync-to-fortnox.ts                     (LOW: read error → omit invoice_number + rapporteraTystFel, never throw)
tests/financial-kernel-bridge.spec.ts               (new; PGlite: consumeOnce + real handler + real RPCs; non-facade producer, facade producer, foreign event types, replay, lease expiry mid-handler with a second worker)
tests/financial-kernel-sweeper.spec.ts              (new; PGlite: cron route auth, per-business loop, dispatch once, unknown/exhausted reports, time budget)
tests/financial-kernel-admin-intents.spec.ts        (new; admin auth, resolve semantics, resume requires reason)
tests/financial-kernel-effects-runners.spec.ts      (new; real runPaymentEffect for invoice_paid_thanks and review_request_schedule with sendSmsViaElks stubbed — C5 LOW)
tests/financial-kernel-command-concurrency.spec.ts  (+ two sweepers racing on one business)
tests/helpers/financial-receivables-database.ts     (+ v240)
package.json, .github/workflows/contracts.yml, tests/fixtures/production-schema-columns.json if needed, docs (handoff)
```

### Invariants (tests first)

1. **Bridge is a producer only.** Through the real `consumeOnce`: a `receivable_settled{customer}`
   from a non-facade payment yields six `pending` intents with `source_event_id` and no external
   call; the same event delivered twice (replay) yields no new rows; `receivable_settled{tax_authority}`,
   `payment_settled`, `invoice_issued` create nothing; the handler never imports a runner.
2. **Facade-owned intents stay facade-owned.** A facade payment followed by the consumer run
   produces `suppressed` for all six and no second row per `(receivable, effect)`.
3. **Lease expiry mid-handler (C3 requirement):** worker A claims the batch, its lease expires
   inside the handler, worker B claims and completes; the receivable ends with exactly one
   intent per effect and the sweeper later dispatches each exactly once.
4. **Sweep is the only dispatcher.** `sweepInvoiceIntents` is the single import of
   `runPaymentEffect` besides its own test; the facade uses the extracted function and its C5
   tests stay green unchanged.
5. **Cron contract:** no/incorrect secret → 401 with nothing executed; flag-off businesses are
   never touched (zero kernel RPCs); the 240 s budget stops the loop and the response says how
   many businesses were skipped.
6. **Unknown and exhausted are reported once and never auto-resent:** a stale attempt becomes
   `unknown` on the first sweep and is not claimed on later sweeps; three failures exhaust the
   intent; each is reported exactly once via `rapporteraTystFel`.
7. **Human resolution:** `delivered`, `abandon`, `retry` behave as verified; actor and reason are
   required and logged; a retried intent is dispatched on the next sweep; resolving anything not
   `unknown`/exhausted is refused.
8. **Halted consumer:** a handler failure five times halts the consumer (C3), the cron reports it
   once per run and continues with the next business; `resume` from the admin route requires a
   reason and records the actor.
9. **Admin routes** refuse non-superadmins (same gate as the other admin routes) and act only on
   the named business.
10. **LOWs:** malformed `Idempotency-Key` → 400; Fortnox receipt path with a failing receivables
    read omits `invoice_number`, reports, and completes the receipt; the number trigger emits a
    notice when it reverts; claim bounds reject 0 and 11.
11. **Runner paths are real:** `runPaymentEffect` for `invoice_paid_thanks` calls the stubbed
    `sendSmsViaElks` once and maps success/failure; `review_request_schedule` inserts one
    `scheduled_review_request` row or skips within the 180-day guard.
12. **Postgres CI:** two sweepers on the same business at once → one claims all owed intents, the
    other claims none, no intent is dispatched twice.
13. **Contract test still green:** no new event names; `fireEvent` still only in the two allowed
    files; no `Number(` on minor amounts in new kernel files.

### Acceptance (orchestration §5 C5b + §9)

All C5 suites green unchanged; all new suites green; Postgres CI green; `tsc` clean; the flag is
still false for every business; the cron is registered but does nothing for flag-off businesses;
handoff lists every report key (`financial-kernel:*`) the package emits and where a human sees it.

### Not in this package

Flag flip and shadow comparison (C6). PSP webhooks (C7). Opening balances and the end of
`legacy_routed` (C4b). Real rounding policy (C1b). Any accounting posting (C8/C9). Admin UI
beyond the one section. Supplier side (C4s).

### Handoff back

Orchestration §7 block under §2, same PR. Claude reviews against §6 A, B, C with B as the centre.

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

**C6 — shadow payment mode (S1/S2 per business).** The first flag flip, for one pilot business
the owner names. S1: kernel enabled, projection written, effects via intents, Fortnox still the
truth for bookkeeping; a daily comparison job compares the kernel projection with Fortnox's
invoice balances (Level 1 per shadow architecture §21.6) and reports drift through `rapporteraTystFel`
with a per-business kill switch (flag off returns every caller to the frozen legacy body; the
projected columns stay valid). S2 is defined after two clean weeks of S1. Needs: v239 + v240
applied in production, the C5b cron live, and the owner's pilot decision.

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

### C5 — compatibility facade (PR #66), Claude review 2026-09-14, orchestration §6 A + B + C + E

Verified locally on `codex/financial-kernel-c5-implementation` head `e88b7d31`: 163 tests green
(C5 facade/frozen/probes, kernel SQL suites, golden paths, replay, schema contract,
payment-decision, classifier, side doors, Bolagsverket), `tsc` clean. Legacy body byte-identical
to `main` by an independent AST comparison. Production checked read-only: v238's
`uq_invoice_business_invoice` exists, so v239's composite FK applies. Six probes against the
implemented v239 (approval target + amount, invoice-level allocation, legacy-routed replay,
number trigger flagged/unflagged). Handoff deviations accepted as improvements. No BLOCKER.

| Sev | Finding | Status |
|---|---|---|
| MEDIUM | Approval caller forces `target:'customer'` with `reviewed.amount`: full-amount confirmation on a ROT invoice leaves tax open and 3 000 unallocated where legacy gives `paid`; a second confirmation on `customer_paid` raises `financial_command_target_not_open` out of the facade. | resolved in #66 (`83856c7c`): target only without amount; `target_not_open` → current-projection no-op. Verified by Claude with the real approval executor against v239 |
| MEDIUM | Legacy-routed replay re-runs the legacy body (`route==='legacy'` ignores `replayed`), so B1 survives on invoices C4b has not migrated. | resolved in #66: replayed legacy-routed command returns current status + `kernel.replayed`; legacy body invoked once (spy). Residual: no crash recovery on legacy-routed invoices until C4b |
| MEDIUM | Eager issuance throws after the invoice was delivered (`applyInvoiceDeliveryOutcome`), inviting a resend. | resolved in #66: try/catch → `results.errors` + `rapporteraTystFel('financial-kernel:eager-issuance-failed')`, `delivered:true` kept; three failure modes tested |
| LOW | Malformed `Idempotency-Key` → 500 instead of 400; `sync-to-fortnox` receipt path throws on read error; number trigger reverts silently; `p_stale_minutes` must equal 10; real thanks/review runner paths only under stubbed runners. | open — not merge-blocking; carry into C5b |


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
| 2026-09-14 | C5 implementation reviewed (PR #66): no BLOCKER, 3 MEDIUM (approval target + amount, legacy-routed replay, eager-issuance throw after delivery), 4 LOW. Same day: the three MEDIUM resolved on #66 and re-verified; board row left to #66. | C5 review |
| 2026-09-14 | C5 merged (PR #66) and the review log (PR #67). C5b brief written: DB-only bridge producing intents via `ensure_effect_intents`, cron consumer + sweeper, human resolution of `unknown`/exhausted intents, admin surface, the four C5 LOWs; v240 draft embedded and verified in PGlite (24 checks). C5 v3 brief retired to git history. C6 sketched in §4. | Package C5b prep |
