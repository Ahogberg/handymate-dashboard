# C5 brief review — counterexamples before integration

> **Resolved 2026-09-14:** brief v2 in `FINANCIAL_KERNEL_PACKAGE_LOG.md` §3 (command identity,
> atomic `execute_payment_command`, provider observation, persisted legacy routing, effect intents,
> dispatch flag reader), Claude's response under §5. The probes below become prevention tests in C5.

Reviewed against main `b949c7635` (PR #59 merged), 2026-09-14.
This is a review of the proposed algorithm, **not a completed C5 implementation**.
No application code, migration, feature flag or external environment was changed.

Update after the review: Claude's documentation commit `6d93a1b24` reports production
v235–v238 applied, v237 backfill complete and zero enabled businesses. That commit was
pushed to the source branch after #59 had already merged and is now incorporated into
this local review branch. These production observations are attributed to that report,
not to a new database inspection by this review. They supersede the earlier deployment
assumption, but do not resolve B1–B4. The two helper search_path pins are now C5 requirements.

The six executable probes in
`handymate-dashboard/tests/financial-kernel-c5-brief-probes.spec.ts` pass because they
**reproduce the faults**, not because C5 acceptance is satisfied. They exercise the real
C4 migration/RPCs and compile the real Fortnox sync with injected dependencies. Proposed
facade steps are explicitly labelled; there is no claim to have tested a facade that does
not yet exist. These diagnostic probes are intentionally not registered as permanent
contract gates; replace their counterexample assertions with prevention assertions in C5.

## B1 — BLOCKER: command identity changes when the command changes state

The brief derives an omitted amount from the next open component and puts both amount and
component in the idempotency key. On a 12,500 kr ROT invoice (customer 9,500, tax 3,000):

1. First manual call with no amount creates `...:950000:customer` and settles the customer.
2. The same call, in the same minute, now creates `...:300000:tax_authority`.
3. Both RPCs succeed. Two payments exist and both receivables are settled, although the
   second invocation was a duplicate of the customer's payment command.

Probe 1 reproduces this with real issuance, settlement and allocation RPCs. It also applies
to an approval key if the target component is appended as the brief prescribes. The early
`invoice.status === 'paid'` return does not help: after step 1 a ROT invoice is customer_paid.

Probe 2 proves a second identity problem: for explicit partial amounts, the minute key stays
the same, but regenerating the default settledAt one second later causes C4's
`financial_payment_idempotency_conflict`. C4 correctly compares the command timestamp.

**Required contract correction:** persist a stable command identity before deriving its
amount/target; replay must reuse the original amount, target and timestamp. Specify how a
new tax payment is distinguished from a retry of the preceding customer payment. A server
timestamp bucket or the current outstanding balance cannot express that distinction.
This needs an explicit caller/request contract or persisted command protocol; do not weaken
C4's payload-conflict checks to make retries pass.

## B2 — BLOCKER: the Fortnox evidence required by the key is not passed

`syncFortnoxPaymentsForBusiness` does not pass Balance or DocumentNumber to the facade.
For an already customer_paid invoice it passes `amount: undefined` for both Balance 0 and
Balance -100. Probe 4 executes the real caller twice and proves the argument objects are
identical. The required keys (and overpayment amounts) are different, so no deterministic
facade can recover them from those arguments alone. Re-reading the provider would be a
new integration with its own snapshot/race semantics, absent from the proposed algorithm.

The customer_paid branch also passes cumulative `Total - Balance`, whereas the proposed
settlement RPC call treats amount as a new payment. The contract must distinguish a provider
snapshot from a delta and reconcile prior manual/provider evidence; a new source key alone
does not prove new money arrived.

**Required contract correction:** include a narrowly scoped change to the Fortnox caller
to carry an explicit observation (document identity, total, balance, stable observation
identity), and specify snapshot-to-delta/reconciliation rules. Preserve the flag-off call
shape/behavior. Test repeated observations, partial-to-full progression, overpayment and
manual-then-provider observation. The brief currently explicitly forbids changing this file.

## B3 — BLOCKER: lazy issuance cannot migrate an existing part-paid invoice

For an invoice already customer_paid before kernel activation, C4 lazily issues both
receivables **fully open**. No prior legacy allocation is imported. The real Fortnox caller
passes no amount on the next tax settlement. Following the proposed next-open rule records
9,500 kr against the customer instead of the actual remaining 3,000 kr tax payment.
The tax receivable stays open and the customer can be thanked again.

Probe 5 combines the real Fortnox caller with real C4 RPCs to demonstrate this result. C4 is
behaving correctly: it was never told about an opening balance. GP34 replay with the first
payment already in the kernel does not prove cut-over of historical legacy payments.

**Required contract correction:** either make C4b opening balances a prerequisite for these
invoices, or explicitly exclude previously paid/part-paid documents from C5 activation and
define a consistent invoice-level routing rule. Simply marking a receivable settled from
legacy status would invent kernel payment evidence and bypass the deferred cut-over policy.
Do not silently choose that policy while implementing C5.

## B4 — HIGH: committed payment steps and inline effects have no recovery protocol

Probe 3 commits an allocation, then models a crash before invoice projection/marker/effects.
On retry, C4 correctly returns the payment with zero unallocated money and an already settled
customer receivable. The proposed allocation loop does nothing. There is no "settled now"
result to drive the prescribed transition table and inline effects.

Separately, the proposed order is projection → marker → effects. A crash after projection
can hit the early `paid` return on retry. A crash after marker but before dispatch leaves a
marker that C5b is explicitly instructed to treat as delivered. Some effect failures are
caught and returned by `runPostPaymentAutomations`, so a persisted marker can also suppress
retry after a reported failure. This second observation is **code/algorithm analysis**, not
a runtime probe of v239 (which does not exist).

This conflicts with the existing §4 / `bridge-automation.ts` requirement that a marker must
not suppress a notification that was never sent. Non-atomic invoice projection was accepted
in the brief; lost command recovery and permanently lost effects were not solved by that
acceptance. C6's drift alarm is not a retry protocol.

**Required contract correction:** give the command a recoverable outcome and persist effect
intents separately from delivery completion. Keep inline attempt if desired, but define
per-effect retries and provider idempotency rather than claiming exactly-once external
delivery from a single pre-send marker. Include fault injection after each committed step
and between individual effects; prove both no duplicate and no permanently lost dispatch.
Align the C5/C5b split with that requirement before implementation.

## M1 — MEDIUM: the existing flag reader contradicts zero kernel RPCs when off

Probe 6 proves `isFinancialKernelEnabled(db, businessId)` calls `financial_kernel_flags` even
when false. The brief names a different one-argument signature and allows no change to the
existing helper. Also account for deploy before v238: the RPC/column is not installed yet.

**Implementation clarification:** allow a separate safe application dispatch flag reader,
with absent schema treated as disabled and unexpected errors handled explicitly. Retain
the C4 helper for kernel callers. Verify flag-off with the RPC fake never called, including
the pre-migration state. This is routine once explicitly separated from the kernel RPC;
it is not an accounting decision or a reason to enable migrations early.

## Handoff / resumption

- #59 is merged; this review does not revert its documents.
- C5 is not implemented or merge-ready. Correct B1–B3 and the B4 delivery/recovery contract
  before adding the facade. No unrelated feature work is included.
- Convert these probes into C5 prevention tests. Add real Postgres competing-command proofs
  for any new persisted command/claim protocol; PGlite does not establish concurrency.
- Preserve the frozen legacy body, default-off flags and the intended non-ROT partial-payment
  divergence. Those decisions are not challenged here.
- R0, P0 and external provider/accounting decisions remain with their existing owners.
- SQL v235–v239 was not applied to any external environment by this review. v239 is only a
  proposal. No historical payment/backfill decision was made.

Validation: six diagnostic probes passed locally against the real C4 migrations; 29 existing
C4/replay/event-contract tests passed; TypeScript passed. The subsequent integration of
`6d93a1b24` changes documentation only.
