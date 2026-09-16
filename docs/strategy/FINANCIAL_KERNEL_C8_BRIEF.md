# Financial Kernel C8 — ledger posting engine

## 1. Provenance and scope

Reconstructed on 2026-09-16 from the agreed C8 requirements and the actual SQL draft at
`9f60d63c1994bcab30b5fe77fc5a8527a2eb34a3` (`codex/financial-kernel-c8`).
The previously referenced brief and its original §6 checklist were absent from the fetched
repository history. The 48 probes below are a new, explicit acceptance mapping, **not a claim
to have recovered or reproduced an unavailable historical checklist**.

C8 provides tenant-scoped accounts with human confirmation provenance, twelve monthly
periods per fiscal year, explicitly configured voucher series, transactional gapless number
allocation, immutable vouchers and lines, reversal chains, ordered period locking with
audited unlocking, and an initially empty consumer of Financial Kernel events.

## 2. Policy boundary

No BAS account, standard series, VAT rule, feature flag or production configuration is
seeded. Test-only account codes and rules are explicit fixture inputs, rolled back after
each probe. No live database migration or application rollout is part of this change.

## 3. SQL and authority

`sql/v251_ledger_posting_engine.sql` builds on the existing C2–C5 event/receivables kernel.
Commands acquire the existing `financial:<business>` transaction lock before domain rows
and append their kernel event within the same transaction. A failure rolls back counters,
vouchers, lines, period state, audit rows and events together.

The eight ledger tables enable RLS. Authenticated members have tenant-scoped reads.
Service-role callers have command RPC access and reads, but no direct table writes or
access to internal posting helpers. Migration-owner update/delete attempts on posted
vouchers, lines and audit rows are rejected by immutable triggers. As elsewhere in the
kernel, privileged database owners remain trusted; the command boundary is the supported
write interface.

## 4. Identity and provenance

Identical account/year/series requests return their existing identity; changed configuration
under the same identity conflicts. Voucher replay compares normalized lines and monetary,
date, series and source identity, preserves the original actor, and allocates no new number.

A reversal is a new voucher with opposite sides, an immediate `reverses_voucher_id` and
the original `reversal_root_id`. Reversing a reversal continues that root. Its kernel event
uses the preceding voucher event as `causation_id` and retains the correlation ID.
Rule-generated postings similarly use the source event as their cause and retain its
correlation ID. These event links correct the draft's two missing provenance cases.

## 5. Verification model and limits

`tests/financial-kernel-c8-ledger.spec.ts` runs real migrations and SQL in PGlite, reusing
the existing kernel database fixture and real tenant-membership function. Migrations run
as the non-superuser deployer; ordinary commands run as `service_role`. Each test gets an
independent transaction which is rolled back. Intentional SQL errors use savepoints;
event failures are injected with database triggers rather than mocked append functions.

PGlite does not prove separate-session PostgreSQL lock contention or production deployment.
The suite proves transaction rollback, isolation/privileges, sequential allocation and
the existing lock-based command behavior in this engine. Multi-session load validation
remains separate from these 48 acceptance probes.

## 6. Executable acceptance mapping — 48 probes

Each ID is the exact test-name prefix in `financial-kernel-c8-ledger.spec.ts`.

| ID | SQL behavior verified |
| --- | --- |
| C8-01 | Migration creates no account, year, series, voucher or rule defaults. |
| C8-02 | Account confirmation identity and timestamp are persisted. |
| C8-03 | Null/empty/whitespace confirmation is rejected without inserting. |
| C8-04 | Identical account creation replays one record. |
| C8-05 | Changed account name or confirmer conflicts. |
| C8-06 | Account codes are tenant-scoped; malformed codes fail. |
| C8-07 | Fiscal year produces twelve contiguous monthly periods. |
| C8-08 | Shifted year includes leap February correctly. |
| C8-09 | Non-month-boundary fiscal start is rejected atomically. |
| C8-10 | Overlapping years fail; adjacent years succeed. |
| C8-11 | Year replay preserves periods and rejects changed labels. |
| C8-12 | Series requires an explicit positive first number and starts there. |
| C8-13 | Series replay preserves its counter and rejects changed configuration. |
| C8-14 | Series cannot reference another tenant's fiscal year. |
| C8-15 | Balanced posting persists exact lines and one matching kernel event. |
| C8-16 | Successful postings use consecutive numbers per explicit series. |
| C8-17 | Voucher replay preserves actor and adds no lines/events/number. |
| C8-18 | Changed monetary/date/series/source identity conflicts under one key. |
| C8-19 | Line normalization permits semantically identical replay. |
| C8-20 | Lines must be an array with at least two objects. |
| C8-21 | Each line must have exactly one positive side. |
| C8-22 | Unbalanced totals fail without consuming a number. |
| C8-23 | Negative, fractional, nonnumeric and overflowing amounts fail atomically. |
| C8-24 | Amounts above JavaScript's safe integer retain exact decimal strings. |
| C8-25 | Missing/foreign-tenant accounts cannot be posted. |
| C8-26 | Posting series must belong to the correct tenant and fiscal year. |
| C8-27 | Dates outside configured years cannot be posted. |
| C8-28 | Injected event failure rolls back voucher, lines, event and number. |
| C8-29 | Caller rollback also returns the allocated number. |
| C8-30 | Owner cannot update/delete posted vouchers. |
| C8-31 | Owner cannot update/delete posted lines. |
| C8-32 | Reversal creates a new opposite voucher without changing the original. |
| C8-33 | Reversal replays exactly; a distinct second reversal fails. |
| C8-34 | Reversal-of-reversal retains root and chained event provenance. |
| C8-35 | Reversal target must exist within the tenant. |
| C8-36 | Period locks follow date order across fiscal years. |
| C8-37 | Locked periods reject new postings/reversals but permit exact replay. |
| C8-38 | Unlock requires a reason and records actor, audit and kernel event. |
| C8-39 | Unlock follows reverse date order, including across years. |
| C8-40 | Repeated lock/unlock adds no audit/event; foreign period access fails. |
| C8-41 | Audit is immutable; failed unlock event rolls back period state and audit. |
| C8-42 | Runtime roles lack direct writes/private helpers; command is service-only. |
| C8-43 | Membership isolates all eight tables; anonymous reads are denied. |
| C8-44 | Empty engine returns `no_rule` without posting or allocating a number. |
| C8-45 | Explicit rule posts once, replays, and retains source-event provenance. |
| C8-46 | Ambiguous enabled rules fail; disabled rules are ignored. |
| C8-47 | Nonpostable events and missing explicit series fail. |
| C8-48 | Consumer is tenant-scoped; locked-period failure is atomic and retryable after unlock. |

## 7. Running the gate

From `handymate-dashboard/`:

```sh
npx playwright test tests/outbound-promise.spec.ts --no-deps --project=chromium --workers=1 --reporter=line
npx playwright test tests/financial-kernel-c8-ledger.spec.ts --no-deps --project=chromium --workers=1 --reporter=line
npx tsc --noEmit
npm run test:contracts
```

The C8 spec is explicitly included in both `package.json`'s `test:contracts` and
`.github/workflows/contracts.yml`. Initial draft execution produced 46 passes and two
provenance failures (C8-34/C8-45); the corrected SQL produced 48 passes with no skips.
