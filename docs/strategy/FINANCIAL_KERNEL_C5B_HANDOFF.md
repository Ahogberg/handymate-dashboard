# C5b implementation handoff

Status: implemented for review; CI validation in progress. Not merged or enabled.
Base: `bd1072bb15c592eed925f90a1edd68bc01baca88` (C5 on main).
Brief: PR #70 at `26ea610bbf5317db6321847fe9c66dae76d873c7`. PR #70 subsequently acquired unrelated Customer Value changes; its moving head is not the implementation base.

## Scope and canonical owners

The automation bridge is a DB-only producer through `ensure_effect_intents`.
Both the existing payment facade and the new ten-minute cron use `effects/sweep.ts`.
Claim/attempt-token/finish semantics remain C5's; stale attempts become unknown,
exhausted failures are not automatically retried. The cron reads only flagged
businesses, stops beginning work at 240 seconds, rotates its first business between
runs, and reports its counts and skipped businesses. Already claimed effects finish
through the same dispatcher; a process killed while sending leaves an attempt for
manual inspection rather than silently resending it.

Superadmins can inspect unresolved intents and paused automation-bridge consumers
under Admin → Support & drift → Ekonomikärnan. The server verifies the user through
Auth `getUser`, then applies `isSuperAdmin`. Every route requires an explicit
business. Resolution requires a reason and uses the verified actor, ignoring any
actor supplied by a client. Retry means pending for the next sweep, not delivered.
The existing C3 resume RPC preserves actor/reason in its operational halt reason.

Four carried C5 LOW areas: malformed payment keys return 400; a failed issued-number
read omits that number and reports while allowing the Fortnox receipt to continue;
number preservation emits NOTICE and claim bounds are checked in v240; real thanks
and review scheduling runners execute in tests with the SMS provider stubbed.

## Deliberate deviations from the proposed v240

1. **Consent ownership includes omitted intents.** A reviewed facade command may select
   zero follow-ups. The original draft recreated all six unreviewed bridge intents.
   Reproduced against the draft in PGlite. The producer now checks the committed
   customer-settling facade command, not merely individual intent conflicts. Tests
   cover zero, one and six originally selected effects. This preserves C5's existing
   approval decision and avoids bypassing customer consent.
2. **Historical event after reversal.** A valid customer settlement whose receivable
   is now open is acknowledged without new intents. Throwing on that historical
   event halted the ordered consumer indefinitely. Wrong tenant/source/type still
   raises an error. Cancellation of already-created obligations remains C14 scope.
3. **Payment attribution.** A direct C4 payment need not use `fin_invoice_*` correlation.
   The original draft could claim the invoice was paid with zero money in the bridge
   message. Bridge context now sums active allocations to that invoice. It excludes
   reversed allocations and unapplied overpayment, and does not invent cash movement
   from a receivable adjustment. Facade context and its amount semantics are unchanged.
4. Work-list ordering occurs before LIMIT, with invoice ID as tie-breaker.
5. Resolution rejects NULL operation and invalid attempt bounds at the RPC boundary.
6. Consumer has an optional stop predicate so the cron budget is checked between events.

## DB, events, flags and regimes

`sql/v240_financial_bridge_intents.sql` adds bridge origin/context/resolution fields,
producer/list/resolve RPCs and the claim/number-guard refinements. New RPCs revoke
PUBLIC/anon/authenticated execution; only service_role executes them. Tenant composite
foreign keys and the XOR origin check remain intact. No table is opened to clients.

Canonical event consumed: `receivable_settled` for `customer`. No new event name.
No journal writes, VAT computation, provider contract, rounding policy or cash-basis
accounting changes. Existing ROT customer/tax split and legacy frozen-body tests apply.
Reverse charge, cash basis and cut-over receive no new implementation in this package.
R0, P0, C1b, C4b, C6 pilot selection and Skatteverket partner API remain open with their
existing owners. No human accounting decision was selected by this implementation.

No production SQL run. No business flag changed. Cron is registered in code only,
and ignores all flag-off businesses. v239/v240 rollout and C6 remain separate.

## Reports and verification

Report keys: `financial-kernel:effect-unknown`, `financial-kernel:effect-exhausted`,
`financial-kernel:consumer-halted`, `financial-kernel:runner-failed`,
`financial-kernel:issued-number-read-failed`. Existing facade key
`financial-kernel:provider-below-kernel` is unchanged. Unknown/exhausted reports are
emitted on transition; the admin list is the durable source for outstanding decisions.
A halted consumer is reported once per cron run and never resumed automatically.

New suites: bridge (real consumeOnce + SQL, including lease takeover), sweeper
(real claim/finish + cron), admin intents (real auth gate + tenant-scoped resolution),
and real effect runners. Existing C5 suites remain unchanged. PostgreSQL CI gains
a two-session claim race. Final CI result is recorded in the PR.

Claude review requested: orchestration §6 A, B and C, with B central. Architecture
references: FK.3, blueprint §18.6/§20, orchestration §5 C5b/§6/§9.
