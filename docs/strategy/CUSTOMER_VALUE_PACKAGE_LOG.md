# Customer Value — package log

> Companion to `FINANCIAL_KERNEL_PACKAGE_LOG.md`, same rules (§0 there): the board is truth,
> handoffs and reviews are appended, the current brief lives in §3, retired briefs live in git.
> Origin: Codex's Customer Value ROI/WOW audit (2026-09-14, verdict *partly*) and Claude's
> independent check of its load-bearing claims against the code the same day.

## 0. What this log is for

The audit's diagnosis holds: Handymate does real work and attributes money unusually well
(`lib/value/ledger.ts`, four stages that are subsets of each other, direct references only),
but (a) an older endpoint mixed estimated time with confirmed money, (b) time saved is a
constant, not a measurement, (c) most agent loops end in an approval card by design, and
(d) the value story is not one trustworthy surface. This log sequences the fix.

**Owner boundary.** No package here becomes a second source of truth about money. Money
stages (*fakturerat*, *betalt*) are derived from Financial Kernel events once a business is on
the kernel, and from the invoice projection until then. The value ledger records what the
product *identified* and *acted on*; the kernel records what was *invoiced* and *paid*.

**Honesty rules that every package inherits** (from `lib/value/ledger.ts` and
`lib/value/automation-value.ts`):
1. An estimate is never a confirmed krona. Estimates carry their basis in the payload.
2. A later stage is always a subset of the earlier one; amounts in later stages come from the
   invoice or payment, never from a card's own guess.
3. One event attributes to at most one card; one invoice is counted once.
4. Time saved is minutes with a visible basis until it is measured (V1 measures it).

## 1. Package board

| Package | What | Owner | Status | Blocked on |
|---|---|---|---|---|
| V0 | P0: `/api/automation/value` separates estimated minutes from confirmed money | Claude | **done 2026-09-14** (this PR; `tests/automation-value-honesty.spec.ts`) | — |
| V1 | Value event log: append-only `value_events` for identified / acted / dismissed, measured time, ledger reads events | Codex | **done 2026-09-14** (PR #72 merged; M1 fixed and re-verified; 5 LOW in §5; handoff [CUSTOMER_VALUE_V1_HANDOFF.md](CUSTOMER_VALUE_V1_HANDOFF.md)) | activation gate: v241 applied, retention/anonymisation decision, paged backfill + method 2/3 comparison, `VALUE_EVENTS_ENABLED` |
| V2 | Money stages from the kernel: consumer `value-ledger` on `invoice_issued` / `receivable_settled`; invoice-projection fallback for legacy-routed businesses | Codex | sketched (§4) | C6 merged 2026-09-14; blocked on the pilot flag being on (S1) |
| V3 | Handymate Impact: one surface (web + mobile) over V1+V2 with the four stages, measured time, and the weekly receipt | Codex | sketched (§4) | V1, V2 |
| — | Revenue-recovery loop closed to draft → sent → paid (audit action 2) | Codex | folded into V1 (acted) + V2 (paid); no separate package | — |
| — | Onboarding scan → work → receipt in 15 minutes (audit action 3) | Codex | product package outside this log; receipt wording must follow rule 1 (say *prepared* / *acted*, never *earned*) | — |
| — | Production proof of provider flows and the weekly receipt (audit action 4) | Codex + owner | evidence discipline shared with the kernel's R0 / shadow work | pilot business |

## 2. Handoffs

### V0 — automation value honesty (Claude, 2026-09-14)

Package / scope
: `lib/value/automation-value.ts` (pure `summariseAutomationValue`), thin `app/api/automation/value/route.ts`,
  `AutomationValueWidget` in `app/dashboard/agent/page.tsx`, facit `tests/automation-value-honesty.spec.ts`
  registered in `test:contracts` and `contracts.yml`.

Contract
: Response `{ confirmed_value, paid_value, signed_quote_value, estimated_minutes, estimate_basis, items[], pending_count, period_days, total_value }`.
  `confirmed_value = paid_value + signed_quote_value`, money only; `total_value` is a backward-compatible
  alias of it. `time_saved` items carry `minutes` and `status: 'estimated'`, never `amount`. Paid invoices
  use `paid_amount` when present (ledger method), else `total`. Quote and invoice lookups are batched and
  tenant-filtered.

Verification
: 7 facit cases (minutes never money; paid + signed separate; dedupe; pending; 7-day window; source scans
  for the old constant, the widget's wording and no minute-to-krona multiplication). `tsc` clean.

Limits
: Still a 7-day window from `v3_automation_logs`; still a constant for minutes (V1 measures). The widget
  keeps its place on the agent page; V3 replaces it.

### V1 M1 correction — Codex, 2026-09-14

Rebased #72 onto main `8577acc085a3435904171c8527771e9e11e80e0c` after #70.
`value_approval_written`, `value_automation_written` and `value_document_sent` now use
`SECURITY DEFINER SET search_path = public, pg_temp`. The member's original source-table RLS
still authorizes the write; privileged producers remain inaccessible as direct member RPCs.
The new PGlite test first reproduced `permission denied for function record_value_approval`.
It exercises authenticated insert/update paths for approvals, logs, quotes and invoices,
including source lookups the member cannot read, replay dedupe, foreign-tenant denials and
continued denial of direct producer/event writes. The honesty spec is retained in exactly the
same position in local and CI test lists. Final verification is recorded on PR #72.
No migration or activation. Claude owns re-verification and merge; the five LOW and activation
gates remain as reviewed.

## 3. Next package — Codex brief: V1 the value event log

> Goal: *identified* and *acted* become durable, append-only events with provenance, so the ledger,
> the weekly receipt and (later) Impact read one log instead of re-deriving from `pending_approvals`
> on every request. Time saved becomes a measurement where one exists, and an estimate with a basis
> where it does not. No money stage is written by V1 (V2), except through the fallback the ledger
> already uses.

Read first: `lib/value/ledger.ts` (header rules), `lib/value/recovered-revenue.ts`
(`RECOVERY_APPROVAL_TYPES`, `DIRECT_ONLY_APPROVAL_TYPES`, `mapApprovalRowToCard`, attribution windows),
`lib/value/vardekvitto.ts` (monthly receipt, method version), `lib/weekly-value.ts`, `lib/value/automation-value.ts`,
`sql/v2_pending_approvals.sql` + `sql/v15_autopilot.sql` (`pending_approvals`: `status`, `resolved_at`,
`resolved_by`, `payload`), `sql/v3_automation_logs.sql` (`status`, `approval_id`, `context`, `result`),
`lib/autonomy/earned-autonomy.ts` (the four autonomous keys), and the Financial Kernel event conventions
in `ARCHITECTURE.md` §FK.2 (ids, idempotency, tenant FKs, RLS, SECURITY DEFINER RPCs, service_role only).

### Claude decisions embedded in this brief

| Decision | Why |
|---|---|
| **One append-only table, `value_events`**, same shape discipline as `financial_events`: `id`, `business_id`, `event_type`, `occurred_at`, `subject_type` + `subject_id`, `card_id?`, `amount_minor?` (BIGINT, only for money-bearing stages), `amount_basis` (`'card_estimate' \| 'quote_total' \| 'invoice_total' \| 'payment'`), `minutes?`, `minutes_basis` (`'measured' \| 'estimate'`), `source_type` + `source_id`, `idempotency_key`, `payload`, `method_version`. Immutable (update/delete trigger), RLS read for members, writes only via `append_value_event` RPC (service_role). | Ledger rule 2 needs provenance per amount. Reusing the kernel's shape means the same review checklist and the same PGlite harness. |
| **Event types (v1):** `opportunity_identified`, `opportunity_acted`, `opportunity_dismissed`, `time_measured`, `time_estimated`. Money stages `invoice_issued` and `payment_received` are **reserved for V2** and refused by the RPC in V1. | Keeps V1 free of money truth. |
| **Producers are the existing write paths, not a scan.** `opportunity_identified` when a card of a type in `RECOVERY_APPROVAL_TYPES` is created (amount = the card's own estimate, basis `card_estimate`); `opportunity_acted` when it is approved/executed or when an autonomous action of the four earned keys succeeds (`v3_automation_logs.status = 'success'`, `approval_id` null); `opportunity_dismissed` on reject/expire. Idempotency key = `<type>:<card_id or log id>`. | Direct references are the only accepted provenance (ledger rule 3). A nightly backfill from `pending_approvals` seeds history once, marked `payload.backfilled = true`. |
| **Time is measured from timestamps, not assumed.** `time_measured` is written only where two timestamps exist for the same subject: lead received → quote sent, job completed → invoice sent, invoice due → reminder sent, and the customer-facing "did this save you time" answer when present. Everything else stays `time_estimated` with the constant in `minutes_basis`. | Audit finding (b). Measured minutes are the only ones Impact may show as fact. |
| **The ledger reads events.** `byggManadsLedger` keeps its signature; `getManadsLedger` builds its card cohort from `value_events` (`opportunity_identified` in the period) and still resolves *fakturerat/betalt* through the existing invoice facit lookups until V2. Method version bumps to 3; the old derivation stays behind a `?method=2` query for one release so the two can be compared. | No user-visible change in V1 beyond correctness; the comparison is the acceptance test. |
| **Weekly receipt and `weekly-value` keep their contracts** and gain `measured_minutes` / `estimated_minutes` fields; nothing there sums minutes into kronor. | Rule 4. |

### Scope

```text
sql/v241_value_events.sql                            (table, immutability trigger, RLS, append_value_event RPC, backfill function guarded by a dry-run flag)
lib/value/events/catalog.ts                          (VALUE_EVENT_TYPES as const, reserved V2 names listed but refused)
lib/value/events/publish.ts                          (typed appendValueEvent over the RPC; money as decimal strings)
lib/value/events/producers.ts                        (identified/acted/dismissed hooks called from approval create/resolve and from the automation executor's success path)
lib/value/time-measured.ts                           (pure: minutes from timestamp pairs; the estimate constants move here from automation-value.ts)
lib/value/ledger.ts                                  (cohort from events; method 3; method 2 kept behind a flag)
lib/weekly-value.ts, lib/value/vardekvitto.ts        (measured/estimated minute fields)
tests/value-events-sql.spec.ts                       (PGlite: immutability, RLS, idempotency, tenant, reserved types refused)
tests/value-events-producers.spec.ts                 (each producer writes exactly one event with the right basis; dedupe on retry)
tests/value-ledger-method3.spec.ts                   (method 2 and 3 agree on a fixed fixture; measured vs estimated never summed)
tests/value-time-measured.spec.ts
package.json, .github/workflows/contracts.yml, docs (handoff here, §2)
```

### Invariants (tests first)

1. `value_events` is immutable and tenant-isolated; only `service_role` can execute `append_value_event`;
   a duplicate idempotency key returns the original; `invoice_issued`/`payment_received` are refused in V1.
2. Creating a recovery-type card writes exactly one `opportunity_identified` with `amount_basis = card_estimate`;
   approving or executing it writes exactly one `opportunity_acted`; a retried resolve writes nothing new.
3. An autonomous success (earned key, no approval) writes `opportunity_acted` with `source_type = automation_log`.
4. Method 3 of the ledger equals method 2 on the existing `tests/value-ledger.spec.ts` fixtures and on a
   production-shaped fixture with backfilled events.
5. Measured minutes come only from timestamp pairs; a missing timestamp yields an estimate row, never a
   measured one; no code path adds `minutes * kr`.
6. The weekly receipt and `weekly-value` responses carry `measured_minutes` and `estimated_minutes` as
   separate fields and their money totals are unchanged.
7. Backfill is idempotent and marks rows `backfilled`; running it twice changes nothing.

### Acceptance

All existing value suites green; new suites green; `tsc` clean; the ledger page shows the same numbers
before and after (method comparison in the handoff); v241 not applied anywhere by the PR.

### Not in this package

Money stages from the kernel (V2). Any new surface (V3). Changing what agents may do autonomously.

### Handoff back

Same §7 block as the kernel log, under §2 here. Claude reviews against orchestration §6 A + B.

## 4. Queued — sketches

**V2 — money stages from the kernel.** A C3 consumer `value-ledger` (registered like
`automation-bridge`) maps `invoice_issued` → `value_events.invoice_issued` and
`receivable_settled{customer}` / `payment_settled` → `value_events.payment_received`, each carrying the
kernel event id as provenance and the card link resolved through the same direct references the ledger
uses today. Businesses not on the kernel keep the invoice-projection fallback. Blocked on C5b (the
consumer runner) and on a pilot business having the flag on (C6); until then the fallback is the only path.

**V3 — Handymate Impact.** One page (web) and one card (mobile) over V1+V2: the four stages with their
bases, measured time as fact and estimated time labelled as such, the monthly receipt, and the agent
breakdown from `weekly-value`. Replaces `AutomationValueWidget`. No new derivation: Impact renders what
the ledger and receipt already compute. Blocked on V1 and V2 so that it never launches over estimates.

**Audit action 3 (onboarding scan → work → receipt in 15 minutes)** is a product package outside this
log; its receipt copy must use *förberett* / *agerat* and may show measured minutes only.

## 5. Review record

### Web receipt and evidence links (PR #75), Claude review 2026-09-14, orchestration §6 A + B

Verified locally on `codex/customer-value-next` head `a085e9cb`: 165 tests green (customer-value-experience,
automation-value-honesty, lisa-fangar, value-ledger*, value-events-producers, vardekvitto, recovered-revenue,
parity, route-auth inventory, onboarding-wow, first-value-*, kundtext), `tsc` clean; `approval-<id>` anchors
exist on the approvals page. Accepted: one shared receipt with paid and accepted-quote amounts split from
deduplicated attributions; `invoicePaymentEvidence` shared by ledger and recovered-revenue; weekly API
owner/admin-gated, strict reads → 503 with retry; company switch aborts in-flight reads; vardekvitto method 3.

| Sev | Finding | Status |
|---|---|---|
| MEDIUM | "0 kr Registrerat betalt · 0 kr Accepterade offerter" headline when the week holds only estimated minutes, new requests or autonomous actions; the removed widget carried the rule against exactly that. Fix: money tiles only when money > 0, otherwise cold-start line plus the non-money rows; two tests. | open on #75 — fix before merge |
| LOW | `/api/automation/value` + `lib/value/automation-value.ts` have no web consumer after the widget removal; retire in V3 once native is confirmed not to read them. | carry |
| LOW | `lisa-fangar` allowlist pinned to a line number; content anchor would stop the churn. | carry |
| — | The acceptance note's V2 contract list is adopted into the V2 brief as written. | noted |

### V1 — value event log (PR #72), Claude review 2026-09-14, orchestration §6 A + B

Verified locally on `codex/customer-value-v1` head `ea9b02b4`: 96 tests green (four V1 suites, value-ledger,
vardekvitto, weekly-value, recovered-revenue, account-deletion, cron-auth), `tsc` clean. Production checked
read-only: every column the v241 triggers read exists; `invoice.sent_at` / `quotes.sent_at` nullable without
default. Handoff deviations accepted: producers as source-transaction triggers (atomic, covers every writer),
method 2 default behind `VALUE_EVENTS_ENABLED`, `profitability_warning` in producers, measured time framed as
*elapsed workflow time, not labour saved*, no time backfill (v126 synthetic dates). Handoff:
[CUSTOMER_VALUE_V1_HANDOFF.md](CUSTOMER_VALUE_V1_HANDOFF.md) (on the PR branch until merge).

| Sev | Finding | Status |
|---|---|---|
| MEDIUM (resolved on #72 `dcdebf32`) | Trigger wrappers ran as the writing role; production has `authenticated` write policies on `invoice`, `quotes`, `v3_automation_logs`, `pending_approvals`. A member's RLS-permitted write fails: `permission denied for function record_value_approval` / `for table project` (reproduced in PGlite). No browser write path exists today. Fix: the three trigger functions `SECURITY DEFINER SET search_path`, plus a member-write test. | corrected on #72 by Codex: all three wrappers SECURITY DEFINER with fixed search_path; member-write regression test added. Awaiting Claude re-verification |
| LOW | `MANADS_LEDGER_METHOD_VERSION = 3` while default is 2; weekly response carries two differently based estimates when the flag is on; PostgREST `::text` cast unproven against a real database; no `minutes * kr` source scan outside V0; one `time_estimated` row per automation success (retention). | carry |

**Activation gate (owner):** v241 not applied; retention/anonymisation decision for `value_events` (snapshots
carry card titles); backfill per business in pages; method 2/3 comparison on representative months; only then
`VALUE_EVENTS_ENABLED=true`.

## 6. Amendment log

| Date | Change | Source |
|---|---|---|
| 2026-09-14 | Created after the ROI/WOW audit: V0 done (P0 fix), V1 brief, V2/V3 sketches, owner boundary against the Financial Kernel. | Claude |
| 2026-09-14 | V1 implemented by Codex (PR #72) and reviewed: 1 MEDIUM (trigger wrappers vs member RLS writes), 5 LOW; activation gate recorded. V2 blocker updated after C5b merged. | V1 review |
| 2026-09-14 | V1 M1 fixed by Codex, re-verified and merged (PR #72). C6 merged the same day; V2 is next once the pilot flag is on. | V1 merge |
| 2026-09-14 | v241 applied to production (after v239/v240/v242) with v243 revoking API EXECUTE on the trigger wrappers. Producers are live (0 rows at apply time, dry-run backfill examined 192 cards for the largest tenant). Reading stays on method 2: `VALUE_EVENTS_ENABLED` unset; backfill and the retention decision remain owner gates. | Deploy |
| 2026-09-14 | PR #75 (shared web receipt) reviewed: 1 MEDIUM (0 kr headline on non-money weeks), 2 LOW. Companion brief `TRYGG_OVERLAMNING_BRIEF.md` (H1–H4) written for the handover work. | #75 review |
