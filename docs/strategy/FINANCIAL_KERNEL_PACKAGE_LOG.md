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
| C6 | Shadow payment mode (S1 per business, Level 1 comparison, kill switch) | Codex | **done 2026-09-14** (PR #73 merged after base merge `8400f720`; review §5: no BLOCKER, 3 LOW; [C6 handoff](FINANCIAL_KERNEL_C6_HANDOFF.md)) | flip itself: v239 → v240 → v242 applied, crons live, PMF gate (orchestration §2) + owner pilot decision |
| C7 | Pay provider adapter | Codex | not started | provider contract (Sprint −1), C3 |
| C8 | Ledger schema + posting engine | Claude (Codex usage exhausted 2026-09-16) | **done 2026-09-17** (PR #89 merged after two adversarial reviews; v251 applied to production and verified, [C8 brief](FINANCIAL_KERNEL_C8_BRIEF.md) §8/§9) | — |
| C9 | SE posting rules | Codex | not started | P0, C1b, named accountant (C8 done) |
| C10 | Read-only Ledger projections + SIE export | Codex | not started | — (C8 done) |
| C11 | Bank/reconciliation | Codex | not started | C4, bank access (Sprint −1) |
| C12 | Fortnox shadow verifier | Codex | not started | C6 (C8 done) |
| C13 | VAT return primitives | Codex | not started | C9, D3 (file vs produce) |
| C14 | Receivables lifecycle | Codex | not started | C4, C9 |
| R0 | Manual rulebook track: a handful of pilot companies' running bookkeeping done by hand, SIE4 of a closed year collected (roadmap §21.2, §13.1) | Owner + accounting consultant | **not started — condition, not option** | named accounting consultant |

**Deployment state (2026-09-14, evening):** `v239`, `v240`, `v242` and `v241` (+ `v243`, trigger-wrapper
EXECUTE revoke) applied to production by Claude via Supabase MCP in that order, each verified read-only
directly after: all kernel/shadow/value tables exist with RLS; every RPC is SECURITY DEFINER, service_role-only
EXECUTE, `authenticated` denied; service_role has no direct write privilege on the shadow tables or
`value_events`; `guard_financial_kernel_phase` and the four v241 producer triggers are installed; phase is `off`
for every business, the kernel work list is empty, `value_events` has 0 rows (dry-run backfill of the largest
tenant examined 192 cards, wrote nothing). No flag flipped, no backfill written, `VALUE_EVENTS_ENABLED` unset.
Supabase security advisors after the run: only pre-existing items (RLS-without-policy INFO on 30 tables incl.
`financial_event_consumers`/`_deliveries` by design, `is_business_member` and `reset_demo_tenant` WARN, `vector`
in public, leaked-password protection off); the new WARN on the v241 wrappers was closed by `v243`.

**Deployment state (2026-09-14, morning):** `v235`–`v238` are applied to the production Supabase
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

### C6 — phase control and Level 1 shadow (Codex, 2026-09-14)

Implementation, file scope, deviations, local evidence and owner gates: [C6 handoff](FINANCIAL_KERNEL_C6_HANDOFF.md). All canonical events unchanged; no production migration or business activation. Claude A/B/C/E review remains required.


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

## 3. Next package — Codex brief: C8 Ledger schema + posting engine

> 2026-09-15: C6 is done (#73). The next package is **C8**, briefed in its own file:
> [`FINANCIAL_KERNEL_C8_BRIEF.md`](FINANCIAL_KERNEL_C8_BRIEF.md) — decisions, `sql/v251_ledger_posting_engine.sql`
> drafted and proven (48 PGlite checks), scope, invariants, the two TypeScript specs, and the handoff fields.
> C8 ships no account, no series set, no rule and no flag; C9 needs the named consultant first.
> The C6 brief below is kept as the record of what #73 implemented.

### Previous package — C6 shadow payment mode (S1 for one pilot business), briefed 2026-09-14

> Goal: the first flag flip becomes a *phase* that is explicit, dated, auditable and reversible with a
> reason, and every day the kernel's view of each pilot invoice is compared with Fortnox at Level 1 and
> with the legacy columns the facade projects. Divergences are recorded, confirmed on a second sighting,
> reported, and closed only with provenance. Nothing is auto-corrected. Nothing here is a readiness
> score: S1 evidence proves the sync works, not that the kernel is right (shadow architecture §2).
> The flip itself is the owner's action, after PMF (orchestration §2); C6 builds the machinery.

Read first: `FINANCIAL_KERNEL_SHADOW_ARCHITECTURE.md` §2, §5–§9, §11, §17, §21.6 (the 2026-09-12 decision:
Level 1 only, Levels 2–4 persisted as *unsupported*), orchestration §5 C6 (S1/S2 stored per business and
shown wherever divergence metrics appear), `sql/v238`–`v240`, `lib/financial-kernel/{flags,dispatch-flag}.ts`,
`lib/fortnox/classify-payment.ts` (the payment classes Fortnox can express: `cancelled | paid | customer_paid |
overdue | unchanged`), `lib/fortnox/sync-payments.ts` (Fortnox → facade, `source:'fortnox'`, every two hours),
`lib/fortnox.ts` `getFortnoxInvoice` (`Total`, `TotalToPay`, `Balance`, `FullyPaid`, `Cancelled`, `TaxReduction`),
`financial_invoice_projection` in v239 (`receivables`, `recorded_minor`, `derived_status`), the C5b cron
`app/api/cron/financial-kernel/route.ts`, `lib/financial-kernel/admin.ts` and `FinancialKernelSection.tsx`.

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **Phase is a history table, not a column.** `financial_kernel_rollout` (append-only: `phase`, `previous_phase`, `actor`, `reason`, `changed_at`); current phase = latest row, default `off`. `set_financial_kernel_phase(business, phase, actor, reason)` is from now on the **only writer** of `business_config.financial_kernel_enabled` (`S1` → true, `off` → false, same phase → no-op). `S2` is refused (`financial_kernel_phase_reserved`) until the S2 definition exists (after two clean S1 weeks, separate amendment). | Shadow §2: per business, explicit, dated, auditable, reversible only with reason. A raw column update leaves no trace; the RPC does. |
| **Kill switch = `set_financial_kernel_phase(..., 'off', actor, reason)`.** Every caller returns to the frozen legacy body on the next call (C5 dispatch flag); projected columns stay valid (C5 invariant). Intents already owed are **not abandoned**: `list_financial_kernel_work()` returns `consume` (flag on) and `sweep` (flag on **or** owed intents) per business, and the C5b cron switches from its `business_config` query to this RPC. The RPC's response carries `owed_intents` so the operator sees what is still in flight. | Today the cron ignores flag-off businesses, so a kill switch would silently strand pending thanks-SMS. An intent is a committed obligation created while the flag was on. |
| **Level 1 only, exact, no tolerances.** Pure engine `compareInvoiceLevel1(handymate, snapshot)` → `{result, differences[]}` with `result ∈ match | divergent | reference_missing`; amounts compared in öre as strings; a 1–100 öre difference is recorded as `ROUNDING_DIVERGENCE` (severity `low`), never suppressed. Levels 2–4 are written once per run as `unsupported` with the reason `bookkeeping scope not granted` (§21.6). | Shadow §7 and §17: no monetary tolerances; unsupported is recorded, not implied. |
| **Dimensions and kinds (comparison_version 1):** (a) settlement state — `classifyFortnoxPayment` class vs `derived_status` (`paid`/`customer_paid`/`null`=open; `cancelled` vs a voided receivable) → `PAYMENT_DIVERGENCE`, `critical`; (b) amounts — Fortnox `Total` vs the sum of receivable amounts, `TotalToPay` vs the customer receivable, and for class `paid` Fortnox `Balance` = 0 vs open kernel amount 0 → `RECEIVABLE_BALANCE_DIVERGENCE`, `high` (or `ROUNDING_DIVERGENCE` when ≤ 100 öre); (c) invoice has `fortnox_document_number` but Fortnox returns 404 → `MISSING_REFERENCE_ENTRY`, `high`; no document number or fetch error → `reference_missing` (`REFERENCE_DATA_UNAVAILABLE`, `medium`); (d) invoice sent after the phase started with no kernel receivables → `MISSING_HANDYMATE_ENTRY`, `high`; (e) **Level 0, internal**: `invoice.status`/`paid_amount` vs `derived_status`/`recorded_minor` → `PROJECTION_DIVERGENCE`, `critical` (the facade broke its own invariant). Severity policy lives in one versioned TS table. | Shadow §6 Level 1 dimensions and §8 taxonomy, reduced to what the Fortnox grant can express. (e) is the C5 invariant checked against production data every day. |
| **Eventual consistency by sighting count, not by tolerance.** A divergence is `open` on first sighting, `confirmed` on the second consecutive daily sighting (`seen_count ≥ 2`), reported once through `rapporteraTystFel('financial-kernel:shadow-divergence')` when confirmed, and shown in admin as *ny* / *bekräftad*. A later `match` on the same object closes every open divergence on it with `resolution_type = superseded_by_match` and the comparison id as provenance. The run is scheduled 30 minutes after the Fortnox payment sync so lag is the exception. | Shadow §9 (retry before alarm) and §11 (no closing without provenance). A payment Fortnox saw after the last sync would otherwise page every night. |
| **Reference snapshots are append-only** (`financial_shadow_snapshots`, one row per fetch incl. `not_found`/`error`); each comparison points at the snapshot it used. | Shadow §5: a later observation never rewrites the snapshot an earlier comparison used. |
| **Nothing in `lib/financial-kernel/shadow/**` may call the facade, any kernel command RPC or write `invoice`.** The daily run reads; the only writes are the shadow tables through their RPCs. | Shadow §17: no auto-correction in either direction. |
| **Admin, not customer.** Phase control (off/S1 with a required reason), shadow status per business (phase, since when, last run, open divergences by severity, confirmed count, the *unsupported* levels listed), the divergence list with resolve (type + reason). All behind `financialKernelAdmin`. No customer-facing surface. | S1 numbers are not customer value and must not be read as kernel correctness. |

### v242 — implement as written (deviations in the handoff with reasons)

Verified in PGlite on top of `v235`–`v240` (`probe12.cjs`, 40 checks: phase default/reserved/reason/no-op/flip
and history; work list before and after a kill switch with one owed intent; run refused while off; comparisons
need a running run and non-empty differences; first sighting open, second confirmed + reportable, reported once;
`reference_missing` → one `medium` divergence; `unsupported` writes no divergence; match closes with provenance;
manual resolve requires reason and type and refuses a closed row; close/record after close refused; rollout,
snapshots, comparisons immutable; snapshot check constraint; no RPC touches `public.invoice`; every RPC
service_role-only; RLS on all six tables; member insert and member RPC denied).

```sql
-- v242_financial_kernel_shadow.sql — DRAFT for the C6 brief (Claude, 2026-09-14).
-- Verified in PGlite on top of v235–v240 (probe12.cjs). Codex implements as written; deviations in the handoff.
-- Shadow architecture §2 (S1/S2), §5 (persistence), §7 (no tolerances), §9 (eventual consistency), §11 (lifecycle), §17 (safety).
-- v241 is reserved for the Customer Value package (value_events).
BEGIN;

-- ── 1. Phase per business: explicit, dated, auditable, reversible with reason (§2, §14) ──
-- business_config.financial_kernel_enabled stays the dispatch switch and is written ONLY by set_financial_kernel_phase.
CREATE TABLE IF NOT EXISTS public.financial_kernel_rollout (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id    TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase          TEXT        NOT NULL CHECK (phase IN ('off','S1','S2')),
  previous_phase TEXT        NOT NULL CHECK (previous_phase IN ('off','S1','S2')),
  actor          TEXT        NOT NULL CHECK (actor <> ''),
  reason         TEXT        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id)
);
CREATE INDEX IF NOT EXISTS idx_financial_kernel_rollout_latest ON public.financial_kernel_rollout (business_id, changed_at DESC);

-- ── 2. Reference snapshots: append-only, versioned; a later observation never rewrites an earlier one (§5) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_snapshots (
  id             TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id    TEXT        NOT NULL REFERENCES public.business_config(business_id),
  provider       TEXT        NOT NULL CHECK (provider IN ('fortnox')),
  object_type    TEXT        NOT NULL CHECK (object_type IN ('invoice')),
  external_id    TEXT        NOT NULL,
  invoice_id     TEXT        NULL,
  fetch_status   TEXT        NOT NULL CHECK (fetch_status IN ('ok','not_found','error')),
  snapshot       JSONB       NULL,
  error          TEXT        NULL,
  schema_version INT         NOT NULL DEFAULT 1,
  observed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  CHECK ((fetch_status = 'ok') = (snapshot IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_snapshots_object ON public.financial_shadow_snapshots (business_id, object_type, external_id, observed_at DESC);

-- ── 3. Comparison runs and comparisons (§5, §6) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_runs (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase              TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  trigger_type       TEXT        NOT NULL CHECK (trigger_type IN ('cron','manual')),
  comparison_version INT         NOT NULL,
  status             TEXT        NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed')),
  counts             JSONB       NOT NULL DEFAULT '{}'::jsonb,
  started_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at       TIMESTAMPTZ NULL,
  PRIMARY KEY (business_id, id)
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_runs_latest ON public.financial_shadow_runs (business_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_shadow_comparisons (
  id                 TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id        TEXT        NOT NULL,
  run_id             TEXT        NOT NULL,
  phase              TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  level              INT         NOT NULL CHECK (level BETWEEN 1 AND 4),
  object_type        TEXT        NOT NULL CHECK (object_type IN ('invoice','ledger','aggregate','report')),
  invoice_id         TEXT        NULL,
  snapshot_id        TEXT        NULL,
  result             TEXT        NOT NULL CHECK (result IN ('match','divergent','reference_missing','unsupported')),
  comparison_version INT         NOT NULL,
  handymate          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  differences        JSONB       NOT NULL DEFAULT '[]'::jsonb,
  checked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, run_id) REFERENCES public.financial_shadow_runs(business_id, id),
  FOREIGN KEY (business_id, snapshot_id) REFERENCES public.financial_shadow_snapshots(business_id, id),
  CHECK ((result = 'divergent') = (jsonb_array_length(differences) > 0)),
  CHECK ((object_type = 'invoice') = (invoice_id IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_comparisons_run ON public.financial_shadow_comparisons (business_id, run_id);
CREATE INDEX IF NOT EXISTS idx_financial_shadow_comparisons_invoice ON public.financial_shadow_comparisons (business_id, invoice_id, checked_at DESC) WHERE invoice_id IS NOT NULL;

-- ── 4. Divergences: one OPEN row per (object, kind); sightings accumulate; closed only with provenance (§8, §11) ──
CREATE TABLE IF NOT EXISTS public.financial_shadow_divergences (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id     TEXT        NOT NULL REFERENCES public.business_config(business_id),
  phase           TEXT        NOT NULL CHECK (phase IN ('S1','S2')),
  kind            TEXT        NOT NULL CHECK (kind IN ('PAYMENT_DIVERGENCE','RECEIVABLE_BALANCE_DIVERGENCE','ROUNDING_DIVERGENCE',
                                                     'MISSING_HANDYMATE_ENTRY','MISSING_REFERENCE_ENTRY','REFERENCE_DATA_UNAVAILABLE','PROJECTION_DIVERGENCE')),
  severity        TEXT        NOT NULL CHECK (severity IN ('info','low','medium','high','critical')),
  object_type     TEXT        NOT NULL,
  invoice_id      TEXT        NULL,
  comparison_id   TEXT        NOT NULL,
  expected        JSONB       NULL,
  actual          JSONB       NULL,
  seen_count      INT         NOT NULL DEFAULT 1,
  first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmed_at    TIMESTAMPTZ NULL,
  reported_at     TIMESTAMPTZ NULL,
  status          TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','resolved')),
  root_cause_code TEXT        NULL,
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, comparison_id) REFERENCES public.financial_shadow_comparisons(business_id, id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_financial_shadow_divergence_open ON public.financial_shadow_divergences (business_id, object_type, COALESCE(invoice_id,''), kind) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_financial_shadow_divergences_open ON public.financial_shadow_divergences (business_id, severity, last_seen_at DESC) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS public.financial_shadow_resolutions (
  id              TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id     TEXT        NOT NULL,
  divergence_id   TEXT        NOT NULL,
  resolution_type TEXT        NOT NULL CHECK (resolution_type IN ('superseded_by_match','accepted','fixed','reference_error','duplicate')),
  reason          TEXT        NOT NULL CHECK (length(reason) BETWEEN 3 AND 500),
  resolved_by     TEXT        NOT NULL CHECK (resolved_by <> ''),
  fix_reference   TEXT        NULL,
  resolved_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (business_id, id),
  FOREIGN KEY (business_id, divergence_id) REFERENCES public.financial_shadow_divergences(business_id, id)
);

-- ── 5. Immutability: rollout, snapshots, comparisons and resolutions are history; runs/divergences change only via the RPCs ──
DO $do$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_comparisons','financial_shadow_resolutions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', t || '_immutable', t);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.financial_events_immutable()', t || '_immutable', t);
  END LOOP;
END $do$;

-- ── 6. RLS: members read, nobody writes through the API; service_role via RPC ──
DO $do$ DECLARE t TEXT; BEGIN
  FOREACH t IN ARRAY ARRAY['financial_kernel_rollout','financial_shadow_snapshots','financial_shadow_runs','financial_shadow_comparisons','financial_shadow_divergences','financial_shadow_resolutions'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_tenant_read', t);
    EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_business_member(business_id))', t || '_tenant_read', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $do$;

-- ── 7. Phase read + write ──
CREATE OR REPLACE FUNCTION public.financial_kernel_phase(p_business_id TEXT)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT COALESCE((SELECT phase FROM public.financial_kernel_rollout r WHERE r.business_id = p_business_id ORDER BY changed_at DESC, id DESC LIMIT 1), 'off')
$fn$;

-- The only writer of business_config.financial_kernel_enabled from now on. 'S2' is reserved until the S2 definition exists (brief: after two clean S1 weeks).
CREATE OR REPLACE FUNCTION public.set_financial_kernel_phase(p_business_id TEXT, p_phase TEXT, p_actor TEXT, p_reason TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_prev TEXT; v_owed INT; v_id TEXT;
BEGIN
  IF p_phase = 'S2' THEN RAISE EXCEPTION 'financial_kernel_phase_reserved' USING ERRCODE = 'check_violation'; END IF;
  IF p_phase NOT IN ('off','S1') THEN RAISE EXCEPTION 'financial_kernel_phase_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_actor IS NULL OR p_actor = '' OR p_reason IS NULL OR length(p_reason) < 3 THEN RAISE EXCEPTION 'financial_kernel_phase_reason_required' USING ERRCODE = 'check_violation'; END IF;
  PERFORM public.financial_lock(p_business_id);
  PERFORM 1 FROM public.business_config WHERE business_id = p_business_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'business_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  v_prev := public.financial_kernel_phase(p_business_id);
  SELECT count(*) INTO v_owed FROM public.financial_effect_intents i WHERE i.business_id = p_business_id AND i.status IN ('pending','failed','attempting','unknown');
  IF v_prev = p_phase THEN
    RETURN jsonb_build_object('phase', v_prev, 'changed', false, 'owed_intents', v_owed);
  END IF;
  INSERT INTO public.financial_kernel_rollout (business_id, phase, previous_phase, actor, reason)
    VALUES (p_business_id, p_phase, v_prev, p_actor, p_reason) RETURNING id INTO v_id;
  UPDATE public.business_config SET financial_kernel_enabled = (p_phase <> 'off') WHERE business_id = p_business_id;
  RETURN jsonb_build_object('phase', p_phase, 'previous_phase', v_prev, 'changed', true, 'rollout_id', v_id, 'owed_intents', v_owed);
END $fn$;

-- Businesses the kernel cron must visit: dispatch on (consume + sweep) OR owed intents left behind by a kill switch (sweep only).
CREATE OR REPLACE FUNCTION public.list_financial_kernel_work()
RETURNS TABLE (business_id TEXT, phase TEXT, consume BOOLEAN, sweep BOOLEAN) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT b.business_id, public.financial_kernel_phase(b.business_id), b.financial_kernel_enabled,
         b.financial_kernel_enabled OR EXISTS (SELECT 1 FROM public.financial_effect_intents i WHERE i.business_id = b.business_id AND i.status IN ('pending','failed','attempting'))
    FROM public.business_config b
   WHERE b.financial_kernel_enabled OR EXISTS (SELECT 1 FROM public.financial_effect_intents i WHERE i.business_id = b.business_id AND i.status IN ('pending','failed','attempting'))
   ORDER BY b.business_id
$fn$;

-- ── 8. Shadow run lifecycle ──
CREATE OR REPLACE FUNCTION public.open_shadow_run(p_business_id TEXT, p_trigger_type TEXT, p_comparison_version INT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_phase TEXT; v_id TEXT;
BEGIN
  v_phase := public.financial_kernel_phase(p_business_id);
  IF v_phase = 'off' THEN RAISE EXCEPTION 'financial_shadow_phase_off' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.financial_shadow_runs (business_id, phase, trigger_type, comparison_version) VALUES (p_business_id, v_phase, p_trigger_type, p_comparison_version) RETURNING id INTO v_id;
  RETURN jsonb_build_object('run_id', v_id, 'phase', v_phase);
END $fn$;

CREATE OR REPLACE FUNCTION public.close_shadow_run(p_business_id TEXT, p_run_id TEXT, p_status TEXT, p_counts JSONB)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE r public.financial_shadow_runs%ROWTYPE;
BEGIN
  IF p_status NOT IN ('completed','failed') THEN RAISE EXCEPTION 'financial_shadow_run_status_invalid' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.financial_shadow_runs SET status = p_status, counts = COALESCE(p_counts, '{}'::jsonb), completed_at = now()
    WHERE business_id = p_business_id AND id = p_run_id AND status = 'running' RETURNING * INTO r;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_shadow_run_not_running' USING ERRCODE = 'check_violation'; END IF;
  RETURN to_jsonb(r);
END $fn$;

CREATE OR REPLACE FUNCTION public.record_shadow_snapshot(p_business_id TEXT, p_provider TEXT, p_object_type TEXT, p_external_id TEXT, p_invoice_id TEXT, p_fetch_status TEXT, p_snapshot JSONB, p_error TEXT)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  INSERT INTO public.financial_shadow_snapshots (business_id, provider, object_type, external_id, invoice_id, fetch_status, snapshot, error)
    VALUES (p_business_id, p_provider, p_object_type, p_external_id, p_invoice_id, p_fetch_status, p_snapshot, p_error) RETURNING id
$fn$;

-- One comparison → its divergence sightings. A match closes every open divergence on the object with provenance (§11).
-- Severity is the engine's (versioned in TS); the RPC stores, counts, confirms on the second consecutive sighting (§9) and never edits invoice.
CREATE OR REPLACE FUNCTION public.record_shadow_comparison(
  p_business_id TEXT, p_run_id TEXT, p_level INT, p_object_type TEXT, p_invoice_id TEXT, p_snapshot_id TEXT,
  p_result TEXT, p_handymate JSONB, p_differences JSONB
) RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE run public.financial_shadow_runs%ROWTYPE; v_cmp TEXT; d JSONB; v_div public.financial_shadow_divergences%ROWTYPE; v_out JSONB := '[]'; v_closed INT := 0;
BEGIN
  SELECT * INTO run FROM public.financial_shadow_runs WHERE business_id = p_business_id AND id = p_run_id;
  IF NOT FOUND OR run.status <> 'running' THEN RAISE EXCEPTION 'financial_shadow_run_not_running' USING ERRCODE = 'check_violation'; END IF;
  IF p_result = 'divergent' AND (p_differences IS NULL OR jsonb_typeof(p_differences) <> 'array' OR jsonb_array_length(p_differences) = 0) THEN
    RAISE EXCEPTION 'financial_shadow_differences_required' USING ERRCODE = 'check_violation'; END IF;
  INSERT INTO public.financial_shadow_comparisons (business_id, run_id, phase, level, object_type, invoice_id, snapshot_id, result, comparison_version, handymate, differences)
    VALUES (p_business_id, p_run_id, run.phase, p_level, p_object_type, p_invoice_id, p_snapshot_id, p_result, run.comparison_version, COALESCE(p_handymate,'{}'::jsonb), COALESCE(p_differences,'[]'::jsonb))
    RETURNING id INTO v_cmp;
  IF p_result = 'match' THEN
    FOR v_div IN SELECT * FROM public.financial_shadow_divergences x WHERE x.business_id = p_business_id AND x.object_type = p_object_type AND COALESCE(x.invoice_id,'') = COALESCE(p_invoice_id,'') AND x.status = 'open' FOR UPDATE LOOP
      UPDATE public.financial_shadow_divergences SET status = 'resolved' WHERE business_id = p_business_id AND id = v_div.id;
      INSERT INTO public.financial_shadow_resolutions (business_id, divergence_id, resolution_type, reason, resolved_by, fix_reference)
        VALUES (p_business_id, v_div.id, 'superseded_by_match', 'Objektet stämde vid en senare jämförelse', 'shadow-run', v_cmp);
      v_closed := v_closed + 1;
    END LOOP;
    RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', v_closed);
  END IF;
  IF p_result = 'reference_missing' THEN
    p_differences := jsonb_build_array(jsonb_build_object('kind','REFERENCE_DATA_UNAVAILABLE','severity','medium','expected',NULL,'actual',NULL));
  END IF;
  IF p_result = 'unsupported' THEN RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', 0); END IF;
  FOR d IN SELECT * FROM jsonb_array_elements(p_differences) LOOP
    INSERT INTO public.financial_shadow_divergences (business_id, phase, kind, severity, object_type, invoice_id, comparison_id, expected, actual)
      VALUES (p_business_id, run.phase, d->>'kind', d->>'severity', p_object_type, p_invoice_id, v_cmp, d->'expected', d->'actual')
    ON CONFLICT (business_id, object_type, (COALESCE(invoice_id,'')), kind) WHERE status = 'open' DO UPDATE SET
      seen_count = public.financial_shadow_divergences.seen_count + 1, last_seen_at = now(), comparison_id = EXCLUDED.comparison_id,
      severity = EXCLUDED.severity, expected = EXCLUDED.expected, actual = EXCLUDED.actual, phase = EXCLUDED.phase,
      confirmed_at = COALESCE(public.financial_shadow_divergences.confirmed_at, now())
    RETURNING * INTO v_div;
    v_out := v_out || jsonb_build_object('id', v_div.id, 'kind', v_div.kind, 'severity', v_div.severity, 'seen_count', v_div.seen_count,
      'confirmed', v_div.confirmed_at IS NOT NULL, 'report', v_div.confirmed_at IS NOT NULL AND v_div.reported_at IS NULL);
  END LOOP;
  RETURN jsonb_build_object('comparison_id', v_cmp, 'divergences', v_out, 'closed', 0);
END $fn$;

CREATE OR REPLACE FUNCTION public.mark_shadow_divergences_reported(p_business_id TEXT, p_ids TEXT[])
RETURNS INT LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  WITH u AS (UPDATE public.financial_shadow_divergences SET reported_at = now() WHERE business_id = p_business_id AND id = ANY(p_ids) AND reported_at IS NULL AND confirmed_at IS NOT NULL RETURNING 1)
  SELECT count(*)::int FROM u
$fn$;

CREATE OR REPLACE FUNCTION public.resolve_shadow_divergence(p_business_id TEXT, p_divergence_id TEXT, p_resolution_type TEXT, p_reason TEXT, p_actor TEXT, p_fix_reference TEXT, p_root_cause_code TEXT)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_div public.financial_shadow_divergences%ROWTYPE; v_res TEXT;
BEGIN
  IF p_resolution_type NOT IN ('accepted','fixed','reference_error','duplicate') THEN RAISE EXCEPTION 'financial_shadow_resolution_invalid' USING ERRCODE = 'check_violation'; END IF;
  IF p_actor IS NULL OR p_actor = '' OR p_reason IS NULL OR length(p_reason) < 3 THEN RAISE EXCEPTION 'financial_shadow_reason_required' USING ERRCODE = 'check_violation'; END IF;
  SELECT * INTO v_div FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND id = p_divergence_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_shadow_divergence_not_found' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF v_div.status <> 'open' THEN RAISE EXCEPTION 'financial_shadow_divergence_not_open' USING ERRCODE = 'check_violation'; END IF;
  UPDATE public.financial_shadow_divergences SET status = 'resolved', root_cause_code = p_root_cause_code WHERE business_id = p_business_id AND id = p_divergence_id;
  INSERT INTO public.financial_shadow_resolutions (business_id, divergence_id, resolution_type, reason, resolved_by, fix_reference)
    VALUES (p_business_id, p_divergence_id, p_resolution_type, p_reason, p_actor, p_fix_reference) RETURNING id INTO v_res;
  RETURN jsonb_build_object('divergence_id', p_divergence_id, 'resolution_id', v_res, 'status', 'resolved');
END $fn$;

CREATE OR REPLACE FUNCTION public.list_shadow_divergences(p_business_id TEXT, p_status TEXT, p_limit INT)
RETURNS SETOF public.financial_shadow_divergences LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT * FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = COALESCE(p_status,'open')
   ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 WHEN 'low' THEN 3 ELSE 4 END, last_seen_at DESC
   LIMIT LEAST(GREATEST(COALESCE(p_limit,100),1),500)
$fn$;

CREATE OR REPLACE FUNCTION public.financial_shadow_status(p_business_id TEXT)
RETURNS JSONB LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
  SELECT jsonb_build_object(
    'phase', public.financial_kernel_phase(p_business_id),
    'phase_since', (SELECT changed_at FROM public.financial_kernel_rollout r WHERE r.business_id = p_business_id ORDER BY changed_at DESC, id DESC LIMIT 1),
    'last_run', (SELECT to_jsonb(r) FROM public.financial_shadow_runs r WHERE r.business_id = p_business_id ORDER BY started_at DESC LIMIT 1),
    'open', (SELECT COALESCE(jsonb_object_agg(severity, n), '{}'::jsonb) FROM (SELECT severity, count(*) n FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = 'open' GROUP BY severity) s),
    'open_confirmed', (SELECT count(*) FROM public.financial_shadow_divergences WHERE business_id = p_business_id AND status = 'open' AND confirmed_at IS NOT NULL),
    'unsupported_levels', '[2,3,4]'::jsonb)
$fn$;

-- ── 9. Privileges: service_role only, like every kernel RPC ──
DO $do$ DECLARE f TEXT; BEGIN
  FOREACH f IN ARRAY ARRAY[
    'financial_kernel_phase(TEXT)', 'set_financial_kernel_phase(TEXT,TEXT,TEXT,TEXT)', 'list_financial_kernel_work()',
    'open_shadow_run(TEXT,TEXT,INT)', 'close_shadow_run(TEXT,TEXT,TEXT,JSONB)', 'record_shadow_snapshot(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,JSONB,TEXT)',
    'record_shadow_comparison(TEXT,TEXT,INT,TEXT,TEXT,TEXT,TEXT,JSONB,JSONB)', 'mark_shadow_divergences_reported(TEXT,TEXT[])',
    'resolve_shadow_divergence(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT)', 'list_shadow_divergences(TEXT,TEXT,INT)', 'financial_shadow_status(TEXT)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $do$;

COMMIT;
```

### Runtime shape

```text
cron  /api/cron/financial-kernel-shadow        30 4 * * *   (Fortnox payment sync runs 0 */2; 04:30 compares against a state ≤ 30 min old)
      CRON_SECRET, force-dynamic, 240 s budget, business rotation as in the C5b cron
      for each business in list_financial_kernel_work() with phase ≠ off and Fortnox connected:
        run = open_shadow_run(business, 'cron', COMPARISON_VERSION)
        invoices = rows with kernel receivables ∪ rows sent after phase_since with fortnox_document_number ∪ open receivables   (cap 200 per run, least recently compared first)
        for each invoice:
          snapshot = getFortnoxInvoice(document_number) → record_shadow_snapshot(ok | not_found | error)     (no document number → no fetch, snapshot NULL)
          handymate = financial_invoice_projection + invoice columns (status, paid_amount, total, customer_pays, rot_rut_type, sent_at)
          {result, differences} = compareInvoiceLevel1(handymate, snapshot)                                 (pure; versioned severity table)
          out = record_shadow_comparison(business, run, 1, 'invoice', invoice_id, snapshot_id, result, handymate, differences)
          collect out.divergences where report = true
        record_shadow_comparison(..., level 2/3/4, object_type ledger/aggregate/report, 'unsupported', {reason})   once each per run
        rapporteraTystFel('financial-kernel:shadow-divergence', <n confirmed, worst severity>) then mark_shadow_divergences_reported(ids)
        close_shadow_run(business, run, 'completed' | 'failed', counts)

cron  /api/cron/financial-kernel               business list from list_financial_kernel_work(): consume when consume, sweep when sweep

admin GET  /api/admin/financial-kernel/shadow?business=…                 → financial_shadow_status + list_shadow_divergences('open')
      POST /api/admin/financial-kernel/phase        {business, phase, reason}          → set_financial_kernel_phase (actor = admin user id)
      POST /api/admin/financial-kernel/shadow/[id]/resolve {business, type, reason, fix_reference?, root_cause_code?}
      POST /api/admin/financial-kernel/shadow/run   {business}                        → one manual run (trigger_type 'manual'), same code path as the cron
```

### Scope

```text
sql/v242_financial_kernel_shadow.sql                       (as above)
lib/financial-kernel/phase.ts                              (readPhase, setPhase over the RPCs; typed phases 'off' | 'S1' | 'S2')
lib/financial-kernel/shadow/compare.ts                     (pure Level 1 engine + SEVERITY table + COMPARISON_VERSION = 1)
lib/financial-kernel/shadow/run.ts                         (runShadowForBusiness: fetch, snapshot, compare, record, report; injectable Fortnox reader and clock)
lib/financial-kernel/shadow/service.ts                     (typed RPC wrappers)
app/api/cron/financial-kernel-shadow/route.ts
app/api/cron/financial-kernel/route.ts                     (business list via list_financial_kernel_work; consume/sweep per flags)
app/api/admin/financial-kernel/{phase, shadow, shadow/[id]/resolve, shadow/run}/route.ts
app/admin/components/FinancialKernelSection.tsx            (phase control, shadow status, divergence list; Swedish labels: Fas, Avvikelser, Bekräftad, Ny, Ej stödd nivå)
vercel.json                                                (30 4 * * *)
tests/financial-kernel-shadow-sql.spec.ts                  (PGlite: the 40 probe checks as assertions)
tests/financial-kernel-shadow-compare.spec.ts              (fixtures: paid, customer_paid ROT, cancelled, open, 404, no document number, rounding 1–100 öre, projection mismatch, missing handymate entry)
tests/financial-kernel-shadow-run.spec.ts                  (stubbed Fortnox: budget, cap, phase filter, report-once rule, no facade/command call (spy), no invoice write)
tests/financial-kernel-admin-shadow.spec.ts                (auth, reason required, actor = user id, phase S2 refused → 400)
tests/cron-auth (+1 = 50), tests/route-auth inventory (+4), docs (handoff here, §2)
```

### Invariants (tests first)

1. `financial_kernel_phase` defaults to `off`; `set_financial_kernel_phase` refuses `S2`, an empty actor or a
   reason shorter than 3 characters; `S1` sets the flag true and appends one history row; the same phase again
   changes nothing; `off` sets the flag false, keeps the history and returns `owed_intents`.
2. No other code path writes `business_config.financial_kernel_enabled` (source scan over `lib/`, `app/`, `sql/v242`).
3. After a kill switch with owed intents, the C5b cron still sweeps that business (`sweep = true`) and no
   longer consumes (`consume = false`); the two-sweeper race and the C5b suites stay green.
4. `open_shadow_run` refuses phase `off`; `record_shadow_comparison` and `close_shadow_run` refuse a run that
   is not `running`; `divergent` requires at least one difference.
5. First sighting → `open`, `seen_count 1`, not reported; second → `confirmed_at` set, `report = true` once;
   third → `report = false`; `mark_shadow_divergences_reported` only marks confirmed rows.
6. A `match` closes every open divergence on the object with `superseded_by_match` and the comparison id;
   a manual resolve requires type and reason, records the actor, and refuses an already-resolved row.
7. `reference_missing` records exactly one `REFERENCE_DATA_UNAVAILABLE` (`medium`); `unsupported` records the
   comparison and no divergence; every run writes Levels 2–4 as `unsupported`.
8. The engine is exact: 1 öre is a `ROUNDING_DIVERGENCE`, 101 öre a `RECEIVABLE_BALANCE_DIVERGENCE`; no
   constant named tolerance/epsilon/margin exists under `lib/financial-kernel/shadow/`.
9. The engine maps every `FortnoxPaymentClass` and every `derived_status`; a class the engine does not know
   is `reference_missing` with `error`, never `match`.
10. The run never calls `applyInvoicePayment`, `execute_payment_command` or any C4 RPC, and never writes
    `invoice` (spy + source scan + the probe's `prosrc` scan).
11. Rollout, snapshots, comparisons and resolutions are immutable; every RPC is service_role-only; RLS read
    for members on all six tables; a member's insert and RPC call are denied.
12. Every status payload and every admin view carries the phase; the admin section shows *Ej stödd nivå 2–4*
    next to any divergence count, and never a percentage.
13. `tests/cron-auth` counts 50 and the route-auth inventory includes the four admin routes.

### Acceptance (orchestration §5 C6 + §9)

All C3/C4/C5/C5b suites unchanged and green; new suites green; `tsc` clean; the handoff shows one full local
run against a stubbed Fortnox with at least one confirmed divergence and one `superseded_by_match`; v242 not
applied anywhere by the PR; no business flipped.

### Not in this package

S2 definition and the S1 → S2 flip. Readiness metrics and the migration gate (C12, on Level 1 only until the
scope question is reopened). Supplier invoices/payables (C4s). Reusing the sync's own Fortnox observation as a
snapshot (queued optimisation). Any customer-facing number.

### Handoff back

Same §7 block as before, under §2. Claude reviews against orchestration §6 A + B + C + E. Owner-side before
the flip: v239 + v240 + v242 applied, the two crons live, Fortnox connected for the pilot, pilot named in the
reason.

## 4. Queued — sketch only

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

**C6 — shadow payment mode.** Briefed in §3 (2026-09-14). S2 definition follows two clean S1 weeks.

**Open-source inputs.** Before C4b, C9, C10, C11, C13 or C14 is briefed, read
`OPEN_SOURCE_ACCOUNTING_LANDSCAPE.md` §5: it names the reference data (Odoo core `l10n_se`,
LGPL), the official schemas (HUS v6, camt.053/054, SIE 4/5) and the licence rules (AGPL and
GPL code is read, never copied).

**Artiklar/ROT (utanför kärnan, rör fakturans ROT-bas).** Briefed 2026-09-16 in
[`ARTIKLAR_MALLAR_ROT_BRIEF.md`](ARTIKLAR_MALLAR_ROT_BRIEF.md): mandatory labour/material/travel split per line,
ROT base = Σ labour only, `rot_work_cost` written on every invoice path (the kernel's customer/tax_authority
split in v238 reads it), Fortnox HouseWork rows split for mixed lines. **Done 2026-09-16:** PR #86 merged
(`71c10ea9`) after two review rounds, v252 applied to production and verified (brief §8). Not a kernel package;
listed here because C9's ROT posting rule and the SKV file depend on the corrected base, which now exists.

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

### C6 — phase control and Level 1 shadow (PR #73), Claude review 2026-09-14, orchestration §6 A + B + C + E

Verified locally on `codex/financial-kernel-c6` head `9d0aa338`: 320 tests green (five C6 suites, C5b/C5/C4/C3
suites, legacy facit, cron-auth 50, route-auth inventory ≤166, kontoradering, tenant sweep, parity), `tsc` clean.
Production read-only: `business_config.fortnox_connected` exists and is the sync cron's own gate; `uq_invoice_business_invoice`
exists for the snapshot FK; 0 businesses enabled, so v242's "no flag without history" precondition passes. PGlite: the
`business_config` guard trigger fires for a role without EXECUTE and lets default-false inserts through (onboarding safe).
Handoff deviations 1–10 accepted: RPC-only writes (service_role SELECT only), monotonic rollout sequence + raw-flag guard,
one running run per business with stale expiry, replay-idempotent comparisons, confirmation on consecutive Stockholm days,
tenant-checked snapshots, `list_shadow_candidates`, reference adapter without the legacy ±1 kr tolerance, drift report with
persistence receipt, 25 s persistence reserve. C5b LOW 1–2 fixed here (per-intent finish isolation; bridge reason).
No BLOCKER, no MEDIUM. Base merge `8400f720` after #72 verified (only the merge commit since the reviewed head; 170 specs
in identical order in both lists); merged 2026-09-14.

| Sev | Finding | Status |
|---|---|---|
| LOW | A divergence kind no longer observed stays open with `seen_count 0` until a full match or manual resolve; consider kind-level `superseded_by_match`. | carry |
| LOW | Admin phase select defaults to the flip of the current phase. | carry |
| LOW | First pilot run: up to 200 sequential Fortnox GETs; confirm rate handling and read `counts.budgetExhausted`. | carry |

### C5b — intent bridge, shared sweep and human recovery (PR #71), Claude review 2026-09-14, orchestration §6 A + B + C

Verified locally on `codex/financial-kernel-c5b` head `d02f1978`: 185 tests green (bridge, sweeper,
admin-intents, effects-runners, command-concurrency incl. the two-sweeper race, C5/C4/C3 suites, legacy
apply-payment facit, cron-auth 49, route-auth inventory 161), `tsc` clean. v240 read in full: bridge is a
DB-only producer keyed by (receivable, effect) with facade-owned suppression, amount from active allocations,
reopened receivable acknowledged; admin RPCs service_role-only with actor + reason; claim bounds at the RPC
boundary. Handoff deviations 1–6 accepted as improvements. No BLOCKER, no MEDIUM. Merged the same day.

| Sev | Finding | Status |
|---|---|---|
| LOW | `sweepInvoiceIntents` calls `finishEffectIntent` outside the try/catch: one thrown finish aborts the loop and the other claimed intents on the invoice age into `unknown` (never a duplicate send; they land in the admin queue instead of the next tick). | open — carry to C6; per-intent try/catch + `rapporteraTystFel` |
| LOW | Runners use reason `Betal-markering` for `source === 'bridge'`. | open — cosmetic, next touch of `runners.ts` |
| LOW | `consumeOnce` limit 100 per business per run; a backlog after halt/resume drains over several ticks. | noted for the pilot |

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
| 2026-09-14 | C5b reviewed and merged (PR #71; review in §5, 3 LOW carried to C6). C6 brief written: phase history + `set_financial_kernel_phase` as the only flag writer, kill switch that keeps sweeping owed intents, Level 1 exact comparison with sighting-count confirmation, Levels 2–4 as `unsupported`, admin surface; v242 draft embedded and verified in PGlite (40 checks). C5b brief retired to git history. | Package C6 prep |
| 2026-09-14 | C6 implemented by Codex (PR #73) and reviewed: no BLOCKER, 3 LOW; C5b LOW 1–2 closed in #73. | C6 review |
| 2026-09-14 | C6 merged (PR #73, base merge `8400f720` verified: only the merge commit since the reviewed head, 170 specs in identical order). S2 definition after two clean S1 weeks; C12 stays sketched. | C6 merge |
| 2026-09-14 | v239, v240, v242, v241 and v243 applied to production and verified; deployment state updated in §1. Owner steps left: pilot business (S1 via `set_financial_kernel_phase`), retention decision before `VALUE_EVENTS_ENABLED`, paged backfill. | Deploy |
