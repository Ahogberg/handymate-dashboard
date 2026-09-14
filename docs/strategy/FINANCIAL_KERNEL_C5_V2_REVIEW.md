# C5 v2 — retry integration review

> **Resolved 2026-09-14:** brief v3 in `FINANCIAL_KERNEL_PACKAGE_LOG.md` §3 (projection written by the
> RPC from current state, `{command, projection}` on every state, attempt tokens, status-route effects as
> intents), Claude's response under §5. The four probes below become prevention tests in C5.

2026-09-14, reviewed PR #61 head `e79bfbb0f` (now merged).
The atomic command resolves the original mid-command write gap and preserves command identity.
Four further executable counterexamples prevent connecting the proposed facade as written.
No production code or database was changed by this review.

Evidence: `handymate-dashboard/tests/financial-kernel-c5-v2-brief-probes.spec.ts` executes
the exact v239 SQL block from the package log on real v235/v236/v238 in isolated PGlite.
The fourth test executes the real status route with the v2-prescribed facade response and a
stubbed SMS provider. All four diagnostic tests pass **by reproducing the defects**; they
are not C5 acceptance tests and are not registered as permanent contract gates.

## R1 — BLOCKER: immutable command outcome is not the current invoice projection

Reproduction (first test):

1. Command A settles the customer: recorded 950000, tax still open.
2. Command B settles tax: recorded 1250000, both components settled.
3. Replay A returns its stored `receivables`, `recorded_minor = '950000'` and
   `settled_now = ['customer']`.

The prescribed facade rewrites this as `customer_paid`, 9500 kr, after the invoice has been
fully settled. This is a sequential retry, not a PGlite concurrency limitation. Concurrent
app-side writes of A and B can cause the same regression even without an explicit replay.

Required correction: separate immutable command result from current projection. Project
the current kernel state under the same business/invoice lock, or use a monotonic database
revision and conditional projection writes. Merely returning fresh rows is insufficient:
an older response can still arrive/write last. Preserve command identity without replaying
obsolete business state into the legacy invoice. Test A → B → retry A and reversed arrival
of the A/B projection writes in real Postgres.

## R2 — BLOCKER: replayed transition triggers an unguarded thank-you SMS

The v2 contract explicitly returns the same `to_customer_paid` / `to_paid` on replay and
explicitly leaves the status route's thank-you SMS unchanged. That route gates the SMS only
on that transition, outside the intent dispatcher. The proposed effect set has no intent
for `invoice_paid_thanks`.

Test four proves two calls to `sendSmsViaElks` from the **real route** when the facade returns
the required replay result twice. No external message is sent by the test. The route supplies
no approval identity to the SMS gate; `relatedId` is not an idempotency command key.

Required correction: put the flagged route's thank-you SMS (and any other route-owned
after-payment effect) under the durable intent protocol. Keep the legacy branch unchanged.
Simply adding `!replayed` loses the SMS if the first request commits the command and crashes
before entering the route's SMS block. Either revise the explicit "SMS untouched" constraint
or change the replay/effect protocol to cover this actual caller. Test crash before dispatch,
ordinary replay, reversal/re-settlement and stale/unknown delivery.

## R3 — HIGH: finish has no attempt identity

Test three uses the real claim/finish RPCs in this order:

1. Worker A claims attempt 1 and finishes `failed`; its HTTP response is lost.
2. Worker B claims attempt 2 and starts sending.
3. A retries the old finish request. The RPC checks only `status = 'attempting'` and accepts it,
   marking B's active attempt failed.
4. Worker C can now claim attempt 3 while B is still sending.

This is not the intentionally accepted `unknown` policy. It is a stale acknowledgement
mutating another worker's attempt.

Required correction: claim returns a unique attempt token (or version) and finish requires
that exact token, including expiry/status checks. A repeated finish for the same completed
attempt must be idempotent or rejected without mutating a later attempt. Validate claim
limits and preserve the documented 3-attempt/10-minute bounds. Add a two-connection test
with A's delayed finish after B claims, alongside the same-command concurrency test.

## R4 — MEDIUM: no-new-money outcome cannot drive its mandated projection

Test two records a manual customer payment and observes that same cumulative provider amount.
The RPC correctly returns `state = 'no_new_money'`, but omits both `receivables` and
`recorded_minor`. The facade algorithm explicitly derives its projection from these fields.
`provider_below_kernel` has the same omission. The `already_paid` early return also skips the
invoice-wide intent sweep promised elsewhere in the brief.

Required correction: define a complete discriminated response for every state; keep current
projection separate from command history as in R1. Route every kernel response through the
owed-intent recovery step, including already-paid and no-new-money calls. Test these branches
through the actual facade, not just by checking RPC state names.

## Handoff

The original v1 findings remain accepted/resolved in the v2 design where documented. This
review does not undo those decisions. Before C5 implementation, align the projection and
route-owned effects contract (R1/R2); R3/R4 are concrete RPC corrections to carry into the
implementation with tests. No flag activation, live migration or accounting policy is needed
to correct these issues. v239 has only been executed inside the isolated test process.

The new probes deliberately characterize failures and must become prevention tests once
the corrected contract is implemented. Their green result must never be called CI evidence
that the facade is ready. Full C5 implementation and its real-Postgres concurrency gate are
still outstanding.
