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
| C2 | `financial_events` schema + append RPC | Codex | **implemented — awaiting Claude A+C review** | review before merge; migration unapplied |
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

### C2 — financial event store (Codex, 2026-09-13)

```text
Package / scope
  C2 only: immutable financial_events schema, service-only append RPC, typed
  envelope/row conversion, and executable tests against the real migration.
Files changed
  handymate-dashboard/sql/v235_financial_events.sql
  handymate-dashboard/lib/financial-kernel/events/types.ts
  handymate-dashboard/tests/financial-kernel-events-sql.spec.ts
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
  No other DDL behavior was changed.
Known unresolved questions / limits of evidence
  PGlite is single-session: 200 ordered appends and lock placement are verified,
  not competing transactions' commit order. C3 must add a multi-connection Postgres
  concurrency proof before a consumer relies on seq. Sequence gaps are intentional.
  UPDATE/DELETE normally fail at the privilege boundary for service_role. The
  trigger is separately proven as owner and with test-only temporary grants.
  TRUNCATE is prevented by grants, not by a trigger against a database administrator.
  The append RPC preserves the proposal's retry semantics: event type, payload,
  amount and currency are compared; other envelope fields on a replay do not replace
  the first event. Payload-shape/business semantics are future writers' responsibility.
  Row mappers require string BIGINT transport, rejecting number input. C3 must use
  a lossless transport adapter: whole-row JSONB/PostgREST numeric serialization is
  not proof of exact BIGINT transport. Payload amounts remain the brief's number
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

Verification: 13 new C2 tests, including the eleven brief invariants; 48 tests in
the combined C2/C0/C1/schema/dead-code/CI-registration pass. TypeScript and remote
CI status are recorded on the PR. Claude review of dimensions A and C is pending.

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

## 3. Next package — Codex brief: C2 `financial_events` schema + append RPC

Read first, in this order: `handymate-dashboard/ARCHITECTURE.md` §FK.1–FK.2 (the table and
the envelope rules are the contract), `FINANCIAL_KERNEL_ARCHITECTURE.md` §6, §7, §8, §21, §26,
§36.2, orchestration §5 C2, §6 A+C, §9. Then the repo conventions this brief was derived from:
`sql/v231_sales_case.sql` (RLS shape), `sql/v97_atomic_quote_signing.sql` (RPC grants),
`sql/testbed_tenant_isolation.sql` (`is_business_member`), `tests/sprint/invoice-acceptance-sql.cjs`
and `tests/helpers/job-standard-db.ts` (PGlite harness with the real migration and an
`auth.uid()` stub), `tasks/lessons.md` 2026-09-06 (every `.rpc('x')` needs `CREATE FUNCTION x`).

### Claude track A — schema and tenant review (2026-09-13)

This is the proposed DDL. Codex implements it as written; deviations go in the handoff block
with a reason. Decisions embedded here, so they are not re-litigated in code review:

| Decision | Why |
|---|---|
| Ids are `TEXT DEFAULT gen_random_uuid()::TEXT`, `business_id TEXT` | Repo convention (145 tables). Not ULID: ordering comes from `seq`, not from the id. |
| `seq BIGSERIAL` + per-business advisory lock in the append RPC | Gives consumers a cursor whose order equals commit order **per business**. Without the lock a lower `seq` can become visible after a higher one and a cursor-based consumer skips it forever. C3 builds on this; the table is the outbox. |
| `amount_minor BIGINT` + `currency`, not `NUMERIC(20,4)` | C0 fixed payload amounts as integer minor units; the mirror column follows. Postgres returns BIGINT as a string in node-postgres: always `money(BigInt(row.amount_minor), row.currency)`, never `Number()`. This closes the C0 "known unresolved question". |
| `event_type` CHECK constraint listing the catalogue | Adding an event now requires a migration. That friction is the point of C0. The contract test already scans any migration mentioning `financial_events`. |
| Composite FK `(business_id, causation_id) → (business_id, id)` | Tenant integrity of the causation chain enforced by the database, not by application code. |
| No UPDATE/DELETE, ever: trigger + REVOKE from `service_role` too | Immutability is the invariant everything else rests on (parent §22 Ledger). Corrections are new events. |
| `business_id` FK → `business_config` **ON DELETE RESTRICT** | Räkenskapsinformation must be retained (parent §36.2). The existing deletion path `lib/account/radera.ts` will fail once a business has events. That is correct and deliberate; the retention/anonymisation design is Claude track G's question, not C2's. Do not change to CASCADE. |
| RLS: SELECT for active members via `is_business_member`; no INSERT policy for `authenticated` | Writes go only through the RPC as `service_role`. Finer `see_financials`-style permission stays application-level as today (`lib/auth/record-ownership.ts`). |
| Idempotent append returns the existing row, but a **different payload under the same key raises** `financial_event_idempotency_conflict` | Same pattern as `invoice_request_changed` in the invoice-acceptance RPC. Silent success on changed content hides a bug. |

Concurrency and deadlock rules that later RPCs must follow (write them in the migration header):

1. Lock order is always: business advisory lock (`pg_advisory_xact_lock(hashtext('financial:' || business_id))`) → domain row locks (`invoice`, `payment` …) → insert event. Every RPC in C3–C8 takes the advisory lock first through `append_financial_event`, or takes it itself before any row lock. Never the reverse.
2. `seq` is not gapless. Consumers use it as an ordering cursor only.
3. The RPC is one statement per event. Batching several events in one RPC is a C3 decision.

Migration/backfill: none. No historical events are synthesised (parent §18.4). The table starts empty for every business and stays empty until `financial_kernel_enabled` (C4).

### Scope

```text
handymate-dashboard/sql/v235_financial_events.sql                      (new)
handymate-dashboard/lib/financial-kernel/events/types.ts               (new; envelope + payload map)
handymate-dashboard/tests/financial-kernel-events-sql.spec.ts          (new; PGlite, runs the real migration)
handymate-dashboard/package.json, .github/workflows/contracts.yml      (register the test after financial-kernel-money.spec.ts)
docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md                          (handoff block)
```

No publish/consume code, no outbox worker, no caller. No flag column. Nothing under
`lib/invoices/*` is touched.

### Proposed DDL (implement as written)

```sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.financial_events (
  id               TEXT        NOT NULL DEFAULT gen_random_uuid()::TEXT,
  seq              BIGSERIAL   NOT NULL,
  business_id      TEXT        NOT NULL REFERENCES public.business_config(business_id) ON DELETE RESTRICT,
  schema_version   INTEGER     NOT NULL CHECK (schema_version >= 1),
  event_type       TEXT        NOT NULL CHECK (event_type IN (
    -- generated from lib/financial-kernel/events/catalog.ts; the contract test verifies parity
    'invoice_issued', 'invoice_credited', 'receivable_created', 'receivable_adjusted', 'receivable_settled',
    'payment_intent_created', 'payment_initiated', 'payment_authorized', 'payment_processing_started',
    'payment_settled', 'payment_failed', 'payment_cancelled', 'payment_refunded', 'payment_disputed',
    'payout_created', 'payout_settled',
    'payment_allocated', 'payment_allocation_reversed', 'bank_transaction_imported',
    'reconciliation_matched', 'reconciliation_unmatched', 'reconciliation_reversed',
    'journal_entry_posted', 'journal_entry_reversed', 'period_locked', 'period_unlocked',
    'payment_divergence_detected', 'accounting_divergence_detected',
    'supplier_invoice_approved', 'payable_created', 'supplier_payment_settled', 'payable_settled'
  )),
  occurred_at      TIMESTAMPTZ NOT NULL,
  effective_date   DATE        NULL,
  source_type      TEXT        NOT NULL CHECK (source_type <> ''),
  source_id        TEXT        NOT NULL CHECK (source_id <> ''),
  correlation_id   TEXT        NOT NULL CHECK (correlation_id LIKE 'fin\_%'),
  causation_id     TEXT        NULL,
  idempotency_key  TEXT        NOT NULL CHECK (idempotency_key <> ''),
  currency         TEXT        NULL CHECK (currency ~ '^[A-Z]{3}$'),
  amount_minor     BIGINT      NULL,
  payload          JSONB       NOT NULL DEFAULT '{}'::jsonb,
  actor_type       TEXT        NOT NULL CHECK (actor_type IN ('system','user','provider','import','agent')),
  actor_id         TEXT        NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  UNIQUE (business_id, id),
  UNIQUE (business_id, idempotency_key),
  UNIQUE (seq),
  FOREIGN KEY (business_id, causation_id) REFERENCES public.financial_events(business_id, id),
  CHECK ((currency IS NULL) = (amount_minor IS NULL)),
  CHECK (actor_type NOT IN ('user','agent') OR actor_id IS NOT NULL),
  CHECK (jsonb_typeof(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_financial_events_business_seq
  ON public.financial_events (business_id, seq);
CREATE INDEX IF NOT EXISTS idx_financial_events_correlation
  ON public.financial_events (business_id, correlation_id, seq);
CREATE INDEX IF NOT EXISTS idx_financial_events_type_time
  ON public.financial_events (business_id, event_type, occurred_at);
CREATE INDEX IF NOT EXISTS idx_financial_events_source
  ON public.financial_events (business_id, source_type, source_id);

-- Immutable. Corrections are new events; there is no second path.
CREATE OR REPLACE FUNCTION public.financial_events_immutable() RETURNS trigger
LANGUAGE plpgsql AS $fn$
BEGIN
  RAISE EXCEPTION 'financial_events_immutable' USING ERRCODE = 'restrict_violation';
END $fn$;
DROP TRIGGER IF EXISTS financial_events_no_update_delete ON public.financial_events;
CREATE TRIGGER financial_events_no_update_delete
  BEFORE UPDATE OR DELETE ON public.financial_events
  FOR EACH ROW EXECUTE FUNCTION public.financial_events_immutable();

ALTER TABLE public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.financial_events FORCE ROW LEVEL SECURITY;
CREATE POLICY financial_events_tenant_read
  ON public.financial_events FOR SELECT TO authenticated
  USING (public.is_business_member(business_id));
CREATE POLICY financial_events_service_role
  ON public.financial_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);
REVOKE ALL ON TABLE public.financial_events FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.financial_events TO authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.financial_events FROM service_role;

-- The only write path. Idempotent per (business_id, idempotency_key); a repeat with a
-- different payload is a bug and raises rather than silently succeeding.
CREATE OR REPLACE FUNCTION public.append_financial_event(
  p_business_id     TEXT,
  p_event_type      TEXT,
  p_schema_version  INTEGER,
  p_occurred_at     TIMESTAMPTZ,
  p_effective_date  DATE,
  p_source_type     TEXT,
  p_source_id       TEXT,
  p_correlation_id  TEXT,
  p_causation_id    TEXT,
  p_idempotency_key TEXT,
  p_currency        TEXT,
  p_amount_minor    BIGINT,
  p_payload         JSONB,
  p_actor_type      TEXT,
  p_actor_id        TEXT
) RETURNS TABLE (event public.financial_events, inserted BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE existing public.financial_events%ROWTYPE;
BEGIN
  IF p_business_id IS NULL OR p_business_id = '' THEN
    RAISE EXCEPTION 'financial_event_business_required' USING ERRCODE = 'check_violation';
  END IF;
  -- Lock order rule 1: business lock before anything else.
  PERFORM pg_advisory_xact_lock(hashtext('financial:' || p_business_id));

  SELECT * INTO existing FROM public.financial_events
   WHERE business_id = p_business_id AND idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF existing.event_type <> p_event_type OR existing.payload <> COALESCE(p_payload, '{}'::jsonb)
       OR existing.amount_minor IS DISTINCT FROM p_amount_minor
       OR existing.currency IS DISTINCT FROM p_currency THEN
      RAISE EXCEPTION 'financial_event_idempotency_conflict' USING ERRCODE = 'unique_violation',
        DETAIL = existing.id;
    END IF;
    event := existing; inserted := false; RETURN NEXT; RETURN;
  END IF;

  INSERT INTO public.financial_events (
    business_id, schema_version, event_type, occurred_at, effective_date, source_type, source_id,
    correlation_id, causation_id, idempotency_key, currency, amount_minor, payload, actor_type, actor_id
  ) VALUES (
    p_business_id, p_schema_version, p_event_type, p_occurred_at, p_effective_date, p_source_type, p_source_id,
    p_correlation_id, p_causation_id, p_idempotency_key, p_currency, p_amount_minor,
    COALESCE(p_payload, '{}'::jsonb), p_actor_type, p_actor_id
  ) RETURNING * INTO event;
  inserted := true; RETURN NEXT;
END $fn$;

REVOKE ALL ON FUNCTION public.append_financial_event(
  TEXT, TEXT, INTEGER, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_financial_event(
  TEXT, TEXT, INTEGER, TIMESTAMPTZ, DATE, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BIGINT, JSONB, TEXT, TEXT
) TO service_role;

COMMIT;
```

**Verified 2026-09-13 before briefing:** the DDL above was executed verbatim in PGlite with a
`business_config`/`business_users`/`is_business_member`/`auth.uid()` stub, and probed: same key
twice → one row and `inserted=false`; changed payload → `financial_event_idempotency_conflict`;
event type outside the catalogue, `correlation_id` without prefix, currency without amount → check
violations; cross-tenant `causation_id` → FK violation, same-tenant accepted; UPDATE/DELETE →
`financial_events_immutable` even as `service_role`; TRUNCATE denied; `anon`/`authenticated`
denied on the RPC and on direct INSERT; a member sees only its own business, a non-member
nothing; `amount_minor` above `MAX_SAFE_INTEGER` round-trips as a string. With the file placed
as `sql/v235_financial_events.sql` the event-contract gate passes. Failed inserts consume `seq`
values (gaps are expected, rule 2).

The `correlation_id LIKE 'fin\_%'` check enforces the prefix rule from §FK.2. A cross-tenant
`causation_id` fails the composite FK; a `causation_id` for an event that does not exist fails
the same FK. Both are the intended behaviour: the RPC does not pre-validate them, the
constraint does.

### `types.ts` (contract fixed — internals are yours)

```ts
import type { FinancialEventType } from './catalog'

export type FinancialActorType = 'system' | 'user' | 'provider' | 'import' | 'agent'

export interface FinancialEventEnvelope<T extends FinancialEventType = FinancialEventType> {
  readonly eventId: string
  readonly seq: bigint
  readonly schemaVersion: number
  readonly eventType: T
  readonly businessId: string
  readonly occurredAt: string          // ISO 8601 with offset
  readonly effectiveDate?: string      // YYYY-MM-DD
  readonly source: { readonly type: string; readonly id: string }
  readonly correlationId: string       // 'fin_…'
  readonly causationId?: string
  readonly idempotencyKey: string
  readonly amount?: Money              // from money.ts; built with money(BigInt(row.amount_minor), row.currency)
  readonly actor: { readonly type: FinancialActorType; readonly id?: string }
  readonly payload: FinancialEventPayloads[T]
  readonly createdAt: string
}

export interface FinancialEventPayloads {
  // Typed now: the events C4 will emit first, fields per ARCHITECTURE.md §FK.1.
  invoice_issued: { invoice_id: string; invoice_number: string; customer_id: string; project_id?: string;
    currency: string; total_minor: number; vat_regime: 'standard' | 'reverse_charge_construction';
    accounting_method: 'accrual' | 'cash'; issued_date: string; due_date: string; tax_reduction?: 'rot' | 'rut' }
  invoice_credited: { … }
  receivable_created: { … }
  receivable_adjusted: { … }
  receivable_settled: { … }
  payment_initiated: { … }
  payment_settled: { … }
  payment_allocated: { … }
  payment_allocation_reversed: { … }
  // Typed by the owning package when it is briefed. `never` makes an early caller fail to compile.
  payment_intent_created: never
  …
}

export type FinancialEventRow = { /* one field per column, snake_case, amount_minor: string */ }
export function envelopeFromRow(row: FinancialEventRow): FinancialEventEnvelope
export function rowFromEnvelope(e: Omit<FinancialEventEnvelope, 'eventId' | 'seq' | 'createdAt'>): Omit<FinancialEventRow, 'id' | 'seq' | 'created_at'>
```

Payload field lists come from §FK.1 verbatim; amounts in payloads are `number` minor units
(JSON-safe, see C0 handoff) and the envelope's `amount` is a `Money`. Do not add fields that
are not in §FK.1; if one is missing, add it to §FK.1 first in the same PR.

### Invariants (write them as tests before the migration)

Harness: PGlite with the pattern in `tests/helpers/job-standard-db.ts` (roles + `auth.uid()`
stub via `current_setting('request.jwt.claim.sub', true)`), executing `sql/v235_financial_events.sql`
verbatim. A minimal `business_config(business_id TEXT PRIMARY KEY)` and `business_users`
fixture, plus `is_business_member` from `sql/testbed_tenant_isolation.sql`.

1. Same key twice → one row, second call returns `inserted = false` and the same `id`.
2. Same key, different payload → raises `financial_event_idempotency_conflict`; row count unchanged.
3. `event_type` not in the catalogue → check violation. The contract test additionally proves the CHECK list equals `catalog.ts`.
4. `causation_id` of another business's event → FK violation. Same business → accepted, and the chain is walkable by `correlation_id`.
5. `UPDATE` and `DELETE` raise `financial_events_immutable` even as `service_role`; `TRUNCATE` is denied.
6. `anon` and `authenticated` cannot call `append_financial_event` (permission denied) and cannot `INSERT` directly.
7. With `auth.uid()` set to a member of business A: `SELECT` sees A's events and none of B's. A non-member sees nothing.
8. `currency` without `amount_minor` (or vice versa) → check violation; `actor_type = 'agent'` without `actor_id` → check violation; `correlation_id` without `fin_` prefix → check violation.
9. `seq` strictly increases in call order for one business across 200 appends.
10. `amount_minor` round-trips through `money(BigInt(row.amount_minor), currency)` for a value above `Number.MAX_SAFE_INTEGER`, proving no `Number()` in the read path.
11. `envelopeFromRow(rowFromEnvelope(e))` round-trips for every typed event with a fixture payload.

### Acceptance (orchestration §5 C2 + §9)

- The five contract tests and the Money tests still pass; the event-contract test's migration scan finds only catalogue names in `v235`.
- `npx tsc --noEmit` clean; the new spec green in the browserless CI list.
- Diff touches only the files under Scope.
- `.rpc('append_financial_event')` is **not** called anywhere yet (C3), so the lessons.md rule about unmigrated RPCs is satisfied trivially; note in the handoff that the migration has not been applied to any environment.
- No comparison tolerance; no `Number()` on `amount_minor`; no UPDATE path.

### Not in this package

Publish/consume/outbox worker and consumer cursors (C3). Any caller (C4). The flag column
`financial_kernel_enabled` (C4). Retention/anonymisation on account deletion (Claude track G
question; the RESTRICT FK makes it visible, it does not solve it).

### Handoff back

Fill in the orchestration §7 block under §2 of this file in the same PR, including any
deviation from the DDL above and why. Claude reviews against §6 A and C before merge.

---

## 4. Queued after C2 — sketch only, briefed when C2 merges

**C3 — outbox/inbox/idempotency primitives.** `lib/financial-kernel/events/publish.ts`
(TS wrapper over `append_financial_event`, returning the envelope), `consume.ts` with a
per-consumer cursor table `financial_event_consumers (business_id, consumer, last_seq,
updated_at)` and at-least-once delivery, and `bridge-automation.ts` as the one permitted
`fireEvent()` call site (empty until C5; the contract test already polices it). Acceptance
includes duplicate delivery and crash-after-commit. Whether one RPC may append several events
atomically is C3's first decision; the advisory lock in C2 makes either answer safe.

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

---

## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-13 | Created with C0 handoff and C1 brief. | Package C0 |
| 2026-09-13 | Folded in the 2026-09-12 decisions (shadow Level 1, obligation boundary, R0 manual rulebook track); noted PR #12 as C4 input; added §5 review record with the C1 review. | PR #47, C1 review |
| 2026-09-13 | C1 marked done (PR #49). Claude track A delivered as the C2 brief: proposed DDL, RLS, immutability, append RPC, lock order, migration risk. C3 sketched. The C1 brief is retired to git history; its handoff and review stand in §2 and §5. | Package C2 prep |
