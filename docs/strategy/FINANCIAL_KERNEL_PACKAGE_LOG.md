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
| C3 | Outbox/inbox/idempotency primitives | Codex | **ready — brief in §3** | — |
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

Parallel Claude analysis tracks (orchestration §4): **A done** (C2 brief), **B done**
(`FINANCIAL_KERNEL_CALL_SITE_MAP.md`, 2026-09-13); C, D, E, F, G not started. C and D are next;
D now has Odoo's `l10n_se` reference data to work from.

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

## 3. Next package — Codex brief: C3 outbox, inbox and consumer cursors

> The C2 brief (proposed DDL, track A decisions) is retired to git history (commit `80dcad8`);
> its outcome is the C2 handoff in §2 and the C2 review in §5. **Prerequisite met 2026-09-13:**
> PR #50 merged with the three review findings fixed (no `FORCE ROW LEVEL SECURITY`; the RPC
> returns a flat row with `seq` and `amount_minor` as TEXT; the replay comparison includes
> `correlation_id`, `source_type`, `source_id`, `causation_id`, `effective_date`). Verified on
> `main` at `45d89d2`. The migration exists on `main` but has not been applied to any environment.

Read first: `handymate-dashboard/ARCHITECTURE.md` §FK.2–FK.3 and §FK.5, blueprint §6
("Transactional outbox"), §8, §21, orchestration §5 C3, §6 A+B+C, §9; then in the repo:
`sql/v235_financial_events.sql` (the lock-order header is binding), `lib/financial-kernel/events/types.ts`,
`tests/financial-kernel-events-sql.spec.ts`, `tests/helpers/followup-database.ts` (the
two-mode harness: PGlite locally, a real Postgres service in CI via `FOLLOWUP_TEST_DATABASE_URL`),
`.github/workflows/first-value.yml` job `durable-followup-postgres`, `tasks/lessons.md`
2026-09-06 (every `.rpc('x')` needs `CREATE FUNCTION x`).

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **The events table is the outbox.** No separate outbox table. | C2 gave `seq` plus a per-business advisory lock taken *before* `nextval`, so for one business `seq` order equals commit order. A consumer that reads `seq > last_seq` in order can never skip a row. This must be **proven with two connections** (invariant 8), not argued. |
| **Cursor per (business, consumer).** `financial_event_consumers(business_id, consumer, last_seq, updated_at, halted_at, halted_event_id, halted_reason)`. | At-least-once delivery with the cursor advanced only after the handler succeeded. |
| **Inbox = delivery ledger.** `financial_event_deliveries(business_id, consumer, event_id, attempts, delivered_at, last_error, PK (business_id, consumer, event_id))`. | Makes redelivery visible and gives handlers an idempotency check that does not depend on the handler remembering. |
| **Never skip a financial event.** A handler that fails `MAX_ATTEMPTS` times **halts that consumer for that business** and raises an operational alarm. No poison-queue, no "park and continue". | Skipping one economic event silently is the failure mode the kernel exists to prevent. A halted consumer is loud and recoverable; a parked event is quiet and forgotten. |
| **One RPC call per event stays the rule in application code.** Atomic multi-event groups (C4: `payment_settled` → `payment_allocated` → `receivable_settled`) happen *inside a domain RPC* that calls `append_financial_event` several times in one transaction. `publish.ts` never batches. | Closes the C2 open question. Atomicity belongs to the domain transaction, not to the transport. |
| **No cron runner in C3.** The consumer loop is a library function; the route that schedules it arrives with the first real consumer (C5, the automation bridge). | A runner with nothing to run is dead code, and cron routes carry their own auth contract (`tests/cron-auth.spec.ts`). |
| **`bridge-automation.ts` is created empty and registered as a consumer name.** | It is the one file the contract test allows to call `fireEvent()`; creating it now pins the location. Its first mapping (`receivable_settled{customer}` → `payment_received`) is C5. |

Lock-order rule from C2 applies unchanged: business advisory lock → domain row locks →
append. `claim_financial_events` briefly locks only the cursor row (`FOR UPDATE`) to acquire a durable lease; it never
takes the business advisory lock, so a consumer cannot deadlock a writer.

### Scope

```text
handymate-dashboard/sql/v236_financial_event_consumers.sql            (new)
handymate-dashboard/lib/financial-kernel/events/publish.ts            (new)
handymate-dashboard/lib/financial-kernel/events/consume.ts            (new)
handymate-dashboard/lib/financial-kernel/events/bridge-automation.ts  (new; empty consumer)
handymate-dashboard/tests/financial-kernel-outbox-sql.spec.ts         (new; PGlite + real migration)
handymate-dashboard/tests/financial-kernel-outbox-concurrency.spec.ts (new; two connections, runs in the Postgres CI job, skips without the env var)
handymate-dashboard/package.json, .github/workflows/contracts.yml, .github/workflows/first-value.yml   (registration)
docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md                          (handoff block)
```

No caller outside `lib/financial-kernel/`. No flag. Nothing under `lib/invoices/*`,
`lib/automation-engine.ts` or `app/api/*` is touched.

### Correction 2026-09-13 — two blocking defects in the first C3 proposal (found by Codex)

Codex reviewed the first version of this brief with runnable reproductions and found two
defects that would have lost events. Both are real and both were Claude's error:

1. **A row lock cannot protect a batch handled in application code.** `claim_financial_events`
   took `FOR UPDATE SKIP LOCKED` on the cursor row, but an RPC is its own transaction: the lock
   is released when the call returns, before the handler runs. Two workers could claim the same
   batch. *Fix:* the claim is a **lease** written into the row (`lease_token`,
   `lease_expires_at`), visible state instead of a transaction lock. Ack and fail require the
   token. An expired lease can be taken over; the old worker's next ack then fails with
   `financial_consumer_lease_lost` and it stops.
2. **Ack could jump the cursor past unhandled events.** `ack_financial_event` advanced
   `last_seq` to the acked event's `seq` whenever it was higher. Acking event 3 first would
   skip 1 and 2 forever. *Fix:* the database enforces order: an ack is accepted only when no
   event of that business exists with `last_seq < seq < acked.seq`; otherwise
   `financial_consumer_ack_out_of_order`. Application discipline is no longer load-bearing.

Also added on Codex's request: `first_attempt_at`/`last_attempt_at` on deliveries, a status view
for halted consumers and backlog, and lease release. The DDL below replaces the earlier one in
full; the earlier one is in git history and must not be implemented.

### Proposed DDL (implement as written; deviations in the handoff with reasons)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_event_consumers (
  business_id       TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  consumer          TEXT        NOT NULL CHECK (consumer ~ '^[a-z][a-z0-9_-]{2,63}$'),
  last_seq          BIGINT      NOT NULL DEFAULT 0,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  lease_token       TEXT        NULL,
  lease_expires_at  TIMESTAMPTZ NULL,
  halted_at         TIMESTAMPTZ NULL,
  halted_event_id   TEXT        NULL,
  halted_reason     TEXT        NULL,
  PRIMARY KEY (business_id, consumer),
  FOREIGN KEY (business_id, halted_event_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((halted_at IS NULL) = (halted_event_id IS NULL)),
  CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL))
);

CREATE TABLE IF NOT EXISTS public.financial_event_deliveries (
  business_id       TEXT        NOT NULL,
  consumer          TEXT        NOT NULL,
  event_id          TEXT        NOT NULL,
  attempts          INTEGER     NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  first_attempt_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_attempt_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  delivered_at      TIMESTAMPTZ NULL,
  last_error        TEXT        NULL,
  PRIMARY KEY (business_id, consumer, event_id),
  FOREIGN KEY (business_id, consumer) REFERENCES public.financial_event_consumers(business_id, consumer),
  FOREIGN KEY (business_id, event_id) REFERENCES public.financial_events(business_id, id)
);

ALTER TABLE public.financial_event_consumers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_event_deliveries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.financial_event_consumers, public.financial_event_deliveries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON TABLE public.financial_event_consumers, public.financial_event_deliveries TO service_role;

-- Observability: backlog and halts per (business, consumer). Read by ops tooling as service_role.
CREATE OR REPLACE VIEW public.financial_consumer_status AS
  SELECT c.business_id, c.consumer, c.last_seq,
         (SELECT count(*) FROM public.financial_events e WHERE e.business_id = c.business_id AND e.seq > c.last_seq) AS backlog,
         c.lease_expires_at IS NOT NULL AND c.lease_expires_at > now() AS lease_active,
         c.lease_expires_at, c.halted_at, c.halted_event_id, c.halted_reason, c.updated_at
    FROM public.financial_event_consumers c;
REVOKE ALL ON public.financial_consumer_status FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.financial_consumer_status TO service_role;

-- Claim = take a lease on the cursor and return the next batch. The lease, not a row lock,
-- is what excludes other workers, because it survives the end of this call.
CREATE OR REPLACE FUNCTION public.claim_financial_events(
  p_business_id TEXT, p_consumer TEXT, p_limit INTEGER, p_lease_seconds INTEGER
) RETURNS TABLE (
  lease_token TEXT,
  id TEXT, seq TEXT, business_id TEXT, schema_version INTEGER, event_type TEXT,
  occurred_at TIMESTAMPTZ, effective_date DATE, source_type TEXT, source_id TEXT,
  correlation_id TEXT, causation_id TEXT, idempotency_key TEXT,
  currency TEXT, amount_minor TEXT, payload JSONB, actor_type TEXT, actor_id TEXT, created_at TIMESTAMPTZ
) LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE; v_token TEXT; v_count INTEGER;
BEGIN
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 500 THEN
    RAISE EXCEPTION 'financial_consumer_bad_limit' USING ERRCODE = 'check_violation';
  END IF;
  IF p_lease_seconds IS NULL OR p_lease_seconds < 5 OR p_lease_seconds > 3600 THEN
    RAISE EXCEPTION 'financial_consumer_bad_lease' USING ERRCODE = 'check_violation';
  END IF;
  INSERT INTO public.financial_event_consumers (business_id, consumer)
    VALUES (p_business_id, p_consumer) ON CONFLICT DO NOTHING;
  -- Short row lock only to serialise concurrent claim calls; released at return by design.
  SELECT * INTO cursor_row FROM public.financial_event_consumers c
    WHERE c.business_id = p_business_id AND c.consumer = p_consumer FOR UPDATE;
  IF cursor_row.halted_at IS NOT NULL THEN RETURN; END IF;
  IF cursor_row.lease_expires_at IS NOT NULL AND cursor_row.lease_expires_at > now() THEN RETURN; END IF;

  SELECT count(*) INTO v_count FROM public.financial_events e
   WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq;
  IF v_count = 0 THEN
    UPDATE public.financial_event_consumers c SET lease_token = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE c.business_id = p_business_id AND c.consumer = p_consumer;
    RETURN;
  END IF;

  v_token := gen_random_uuid()::TEXT;
  -- Alias required: RETURNS TABLE declares business_id/consumer as OUT parameters.
  UPDATE public.financial_event_consumers c
     SET lease_token = v_token, lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE c.business_id = p_business_id AND c.consumer = p_consumer;

  RETURN QUERY
    SELECT v_token, e.id, e.seq::text, e.business_id, e.schema_version, e.event_type, e.occurred_at, e.effective_date,
           e.source_type, e.source_id, e.correlation_id, e.causation_id, e.idempotency_key,
           e.currency, e.amount_minor::text, e.payload, e.actor_type, e.actor_id, e.created_at
      FROM public.financial_events e
     WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq
     ORDER BY e.seq
     LIMIT p_limit;
END $fn$;

-- Shared guard: the caller must hold the live lease.
CREATE OR REPLACE FUNCTION public.assert_financial_consumer_lease(
  p_business_id TEXT, p_consumer TEXT, p_lease_token TEXT
) RETURNS public.financial_event_consumers LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE;
BEGIN
  SELECT * INTO cursor_row FROM public.financial_event_consumers c
   WHERE c.business_id = p_business_id AND c.consumer = p_consumer FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_unknown' USING ERRCODE = 'foreign_key_violation'; END IF;
  IF p_lease_token IS NULL OR cursor_row.lease_token IS DISTINCT FROM p_lease_token
     OR cursor_row.lease_expires_at IS NULL OR cursor_row.lease_expires_at <= now() THEN
    RAISE EXCEPTION 'financial_consumer_lease_lost' USING ERRCODE = 'lock_not_available';
  END IF;
  RETURN cursor_row;
END $fn$;

-- Ack: strictly in order. The acked event must be the FIRST unacknowledged event of this
-- business; otherwise the call raises and nothing moves. Renews the lease.
CREATE OR REPLACE FUNCTION public.ack_financial_event(
  p_business_id TEXT, p_consumer TEXT, p_event_id TEXT, p_lease_token TEXT, p_lease_seconds INTEGER
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE cursor_row public.financial_event_consumers%ROWTYPE; v_seq BIGINT;
BEGIN
  cursor_row := public.assert_financial_consumer_lease(p_business_id, p_consumer, p_lease_token);
  SELECT e.seq INTO v_seq FROM public.financial_events e
   WHERE e.business_id = p_business_id AND e.id = p_event_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'financial_consumer_unknown_event' USING ERRCODE = 'foreign_key_violation'; END IF;

  INSERT INTO public.financial_event_deliveries (business_id, consumer, event_id, attempts, delivered_at)
    VALUES (p_business_id, p_consumer, p_event_id, 1, now())
    ON CONFLICT (business_id, consumer, event_id) DO UPDATE
      SET delivered_at = COALESCE(public.financial_event_deliveries.delivered_at, now()),
          attempts = public.financial_event_deliveries.attempts + 1, last_attempt_at = now();

  IF v_seq <= cursor_row.last_seq THEN RETURN false; END IF;   -- redelivery, handled idempotently
  IF EXISTS (SELECT 1 FROM public.financial_events e
              WHERE e.business_id = p_business_id AND e.seq > cursor_row.last_seq AND e.seq < v_seq) THEN
    RAISE EXCEPTION 'financial_consumer_ack_out_of_order' USING ERRCODE = 'check_violation', DETAIL = p_event_id;
  END IF;
  UPDATE public.financial_event_consumers
     SET last_seq = v_seq, lease_expires_at = now() + make_interval(secs => p_lease_seconds), updated_at = now()
   WHERE business_id = p_business_id AND consumer = p_consumer;
  RETURN true;
END $fn$;

-- Failure: count the attempt; at the threshold halt the consumer and drop the lease. Never advances.
CREATE OR REPLACE FUNCTION public.fail_financial_event(
  p_business_id TEXT, p_consumer TEXT, p_event_id TEXT, p_lease_token TEXT, p_error TEXT, p_max_attempts INTEGER
) RETURNS TABLE (attempts INTEGER, halted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE v_attempts INTEGER;
BEGIN
  PERFORM public.assert_financial_consumer_lease(p_business_id, p_consumer, p_lease_token);
  INSERT INTO public.financial_event_deliveries (business_id, consumer, event_id, attempts, last_error)
    VALUES (p_business_id, p_consumer, p_event_id, 1, left(p_error, 2000))
    ON CONFLICT (business_id, consumer, event_id) DO UPDATE
      SET attempts = public.financial_event_deliveries.attempts + 1,
          last_error = left(p_error, 2000), last_attempt_at = now()
    RETURNING public.financial_event_deliveries.attempts INTO v_attempts;
  IF v_attempts >= p_max_attempts THEN
    UPDATE public.financial_event_consumers
       SET halted_at = now(), halted_event_id = p_event_id, halted_reason = left(p_error, 2000),
           lease_token = NULL, lease_expires_at = NULL, updated_at = now()
     WHERE business_id = p_business_id AND consumer = p_consumer AND halted_at IS NULL;
    attempts := v_attempts; halted := true; RETURN NEXT; RETURN;
  END IF;
  attempts := v_attempts; halted := false; RETURN NEXT;
END $fn$;

-- Release: end of batch. Idempotent; a lost lease releases nothing and returns false.
CREATE OR REPLACE FUNCTION public.release_financial_consumer_lease(
  p_business_id TEXT, p_consumer TEXT, p_lease_token TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  UPDATE public.financial_event_consumers
     SET lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE business_id = p_business_id AND consumer = p_consumer AND lease_token = p_lease_token;
  RETURN FOUND;
END $fn$;

-- Resume: explicit, audited, privileged. Clears the halt; the halted event is redelivered first.
CREATE OR REPLACE FUNCTION public.resume_financial_consumer(
  p_business_id TEXT, p_consumer TEXT, p_actor_id TEXT, p_reason TEXT
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
BEGIN
  IF p_actor_id IS NULL OR p_reason IS NULL OR p_reason = '' THEN
    RAISE EXCEPTION 'financial_consumer_resume_requires_actor_and_reason' USING ERRCODE = 'check_violation';
  END IF;
  UPDATE public.financial_event_consumers
     SET halted_at = NULL, halted_event_id = NULL,
         halted_reason = 'resumed by ' || p_actor_id || ': ' || left(p_reason, 500),
         lease_token = NULL, lease_expires_at = NULL, updated_at = now()
   WHERE business_id = p_business_id AND consumer = p_consumer AND halted_at IS NOT NULL;
  RETURN FOUND;
END $fn$;

REVOKE ALL ON FUNCTION public.claim_financial_events(TEXT, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_financial_consumer_lease(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ack_financial_event(TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.fail_financial_event(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_financial_consumer_lease(TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resume_financial_consumer(TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_financial_events(TEXT, TEXT, INTEGER, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.ack_financial_event(TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.fail_financial_event(TEXT, TEXT, TEXT, TEXT, TEXT, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_financial_consumer_lease(TEXT, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.resume_financial_consumer(TEXT, TEXT, TEXT, TEXT) TO service_role;

COMMIT;
```

**Verified 2026-09-13 (corrected version) in PGlite on top of `v235` from `main`, 24 probes:**
worker A claims three; B's claim returns nothing while A's lease is live; acking the second
event before the first raises `financial_consumer_ack_out_of_order` and `last_seq` stays 0;
in-order acks advance; re-acking a delivered event returns `false`; after the lease is expired
(superuser test hook) B gets the same batch with a new token and A's ack and fail both raise
`financial_consumer_lease_lost`; the status view shows backlog 2 and an active lease; release
is idempotent; five failures halt the consumer and drop its lease; a halted consumer claims
nothing while business B is unaffected; resume redelivers the halted event first; a lease under
5 s is rejected; `service_role` cannot call the lease assertion but can read the status view;
`authenticated` cannot read the view. Still needing two sessions (Postgres CI job): the
commit-order proof and a genuinely concurrent claim race.

Note the deliberate asymmetry: `resume_financial_consumer` writes the actor and reason into the
row itself, because the kernel has no audit table yet (C4 `audit/`). When it exists, resume
must also append an audit record; put a `TODO(C4)` there, not a silent gap.

### TypeScript contract (fixed — internals are yours)

```ts
// publish.ts — the only application-side write path; domain RPCs (C4+) call the SQL directly.
export interface AppendFinancialEventInput<T extends FinancialEventType> {
  businessId: string; eventType: T; schemaVersion?: number   // default FINANCIAL_EVENT_SCHEMA_VERSION
  occurredAt: string; effectiveDate?: string
  source: { type: string; id: string }
  correlationId: string; causationId?: string; idempotencyKey: string
  amount?: Money; actor: { type: FinancialActorType; id?: string }
  payload: FinancialEventPayloads[T]
}
export function appendFinancialEvent<T extends FinancialEventType>(
  db: KernelDb, input: AppendFinancialEventInput<T>
): Promise<{ event: FinancialEventEnvelope<T>; inserted: boolean }>
// KernelDb is a minimal interface { rpc(name, args): Promise<{ data, error }> } so tests inject a
// PGlite-backed fake and production passes the service-role Supabase client. No client is created here.

export function correlationId(root: 'invoice' | 'supplier_invoice' | 'payment' | 'bank' | 'journal', id: string): string  // 'fin_invoice_<id>'
export function idempotencyKey(domain: string, source: string, id: string, discriminator?: string): string   // '<domain>:<source>:<id>[:<disc>]'

// consume.ts
export interface FinancialEventHandler { readonly consumer: string; handle(e: FinancialEventEnvelope, db: KernelDb): Promise<void> }
export interface ConsumeResult { claimed: number; delivered: number; failed: number; halted: boolean; leaseLost: boolean }
export async function consumeOnce(db: KernelDb, businessId: string, handler: FinancialEventHandler,
  opts?: { limit?: number; maxAttempts?: number; leaseSeconds?: number; handlerTimeoutMs?: number }): Promise<ConsumeResult>
// claim(limit, leaseSeconds) → keep the lease token; for each event IN SEQ ORDER:
//   if a delivery with delivered_at exists → ack (idempotent redelivery) and continue;
//   else handler.handle() under handlerTimeoutMs (must be well below leaseSeconds);
//   on success → ack(token) (renews lease); on throw → fail(token) and STOP the batch;
//   on financial_consumer_lease_lost from ack/fail → STOP immediately, leaseLost: true, record nothing else.
// finally release(token). A handler that writes to the database should do so in a transaction
// that also performs the ack; the RPC allows it because the lease, not a lock, is the guard.
export const MAX_ATTEMPTS_DEFAULT = 5
export const LEASE_SECONDS_DEFAULT = 60
export const HANDLER_TIMEOUT_MS_DEFAULT = 20_000

// bridge-automation.ts
export const AUTOMATION_BRIDGE_CONSUMER = 'automation-bridge'
export const automationBridge: FinancialEventHandler   // handle() is a no-op switch until C5; no fireEvent call exists yet
```

`appendFinancialEvent` maps the RPC's flat text row through `envelopeFromRow`; it never
touches `amount_minor` as a number (the C2 source-scan test pattern applies here too).

### Invariants (tests first)

1. **Lease excludes a second worker:** after worker A claims, worker B's claim returns nothing
   while the lease is live; after the lease expires (test: set `lease_expires_at` in the past
   as superuser), B's claim returns the same batch with a new token, and A's subsequent ack or
   fail raises `financial_consumer_lease_lost`. Proven in PGlite with two tokens; proven across
   two sessions in the Postgres CI job.
2. **Ack is strictly ordered:** acking the second event before the first raises
   `financial_consumer_ack_out_of_order` and `last_seq` does not move; acking in order advances;
   acking an event at or below `last_seq` returns `false` (redelivery).
3. Crash-after-handle-before-ack: after lease expiry the event is claimed again; the handler
   sees it twice; the delivery row shows the redelivery. At-least-once proof.
4. Handler failure: `attempts` increments, cursor does not move, the batch stops; at
   `maxAttempts` the consumer halts, its lease is dropped, `claim` returns nothing,
   `financial_consumer_status.halted_at` is set, and `consumeOnce` reports `halted: true`.
5. Resume requires actor and reason; after resume the halted event is redelivered first.
6. A halt or lease for business A does not affect business B, nor other consumers of A.
7. `anon`/`authenticated` cannot call any RPC nor read either table or the status view;
   `service_role` can read all three and cannot INSERT/UPDATE the tables directly;
   `assert_financial_consumer_lease` is not callable by `service_role` either.
8. **Two-connection commit-order proof** (real Postgres job): connection 1 `BEGIN`, appends
   event X for business A and holds the transaction open; connection 2 appends event Y for A —
   it must block (advisory lock) and, after 1 commits, receive a higher `seq`; a consumer
   polling throughout never observes Y before X. Skipped with a clear message when the
   database URL env var is absent, registered in the `durable-followup-postgres` CI job.
9. `appendFinancialEvent` round-trips a payload with `amount` above `2^53` through the fake
   `KernelDb` without loss; the source-scan assertion forbids `Number(` on `amount_minor`/`seq`
   in `publish.ts`/`consume.ts`.
10. The contract test still passes: `bridge-automation.ts` exists and contains no `fireEvent(`
    call yet; no event-like literal outside the catalogue.
11. `idempotencyKey` and `correlationId` reject empty segments and produce exactly the FK.2 formats.
12. `financial_consumer_status.backlog` equals the count of events above `last_seq`, and
    `lease_active` flips to false at expiry without any write.

### Acceptance (orchestration §5 C3 + §9)

Contract, Money, C2 and C3 suites green; `npx tsc --noEmit` clean; the concurrency spec green in the Postgres CI job; diff touches only the Scope files; no `.rpc(` name without a `CREATE FUNCTION` in `sql/`; no caller yet outside `lib/financial-kernel/`.

### Not in this package

The cron/runner route (C5). Any real handler mapping (C5). Audit table (C4). Backfill of any kind.

### Handoff back

Orchestration §7 block under §2, same PR. Claude reviews against §6 A, B and C.

---

## 4. Queued after C3 — sketch only, briefed when C3 merges

**C4 — receivables and allocations behind `financial_kernel_enabled`.** Needs Claude track B
(the call-site map, `FINANCIAL_KERNEL_CALL_SITE_MAP.md`) and track C's golden paths first.
Tables `receivables`, `payments`, `payment_allocations`; domain RPCs `record_payment_settlement`
and `allocate_payment` that append events inside one transaction; ROT/RUT as two receivable
components; `receivable_adjusted.reason = 'ownership_transfer'` expressible from day one.
Manual "mark paid" and Fortnox import both become `payment_initiated` + `payment_settled`
with `provider: 'manual' | 'fortnox'`. Customer-visible behaviour unchanged (flag default off).

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
| 2026-09-13 | Track B delivered as `FINANCIAL_KERNEL_CALL_SITE_MAP.md`; board updated. | Track B |
| 2026-09-13 | C3 brief written (outbox = events table, cursor per business/consumer, delivery ledger, halt-never-skip, two-connection proof). C2 brief retired to git history. C4 sketched. | Package C3 prep |
