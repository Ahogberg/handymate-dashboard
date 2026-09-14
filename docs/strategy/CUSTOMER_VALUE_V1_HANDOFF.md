# Customer Value V1 — Codex handoff

Status: implemented in PR #72; final CI results tracked on the PR. Not deployed; v241 has not been applied.
Base: C5b main `9d363a25`. The V1 brief and V0 code remain in PR #70; this branch does not copy
V0 or merge that branch. Attach this handoff to §2 of CUSTOMER_VALUE_PACKAGE_LOG when #70 lands.

## Scope and ownership

One append-only product-work log (`value_events`), atomic source producers, bounded dry-run historical
seed, method-3 ledger cohort, method-2 comparison, and separate event time fields in weekly/monthly
responses. No new customer surface, agent permission, provider effect, payment or accounting rule.
Implementation: `sql/v241_value_events.sql`, `lib/value/events/*`, `lib/value/time-measured.ts`,
`lib/value/ledger.ts`, `lib/value/vardekvitto.ts`, `lib/weekly-value.ts`, the two ledger routes,
autonomy-key provenance in the engine/review-request cron, four V1 suites and SQL-backed helpers.
Architecture: FK.2 envelope/atomicity, FK.4 safe defaults, Customer Value V1 contract, orchestration
§6 A/B (plus SQL/RLS tenant checks). Kernel event catalogue is untouched; V2 money names are refused.

## Decisions and deviations for Claude A/B review

1. **Atomic producers rather than post-write JavaScript calls.** Approval inserts/resolutions occur
   in many routes, crons and SQL functions, not just `skapaKort`. v241 triggers call the identity-only
   producers in the source write transaction. A failure rolls back both; retries use the same key.
   No network or delivery is triggered. TypeScript producer adapters are explicit replay entrypoints,
   not a second emission path. Applying v241 therefore affects the source transactions even while
   the read flag is off: validate in staging before production migration.
2. **Elapsed time is not saved labour.** Pairs measure workflow latency and carry
   `metric=elapsed_minutes` plus both timestamps and journey. Responses carry
   `measured_minutes_basis=elapsed_workflow_time_not_labour_saved`. V3 must never call this
   saved labour or sum it with estimated labour. Missing/invalid pairs get an estimate with a
   visible numeric basis. No customer time-feedback source exists in the scoped write paths;
   V1 does not invent one or classify a self-reported answer as an instrumented measurement.
   Invoice-due measurement starts when the due date ends at Swedish midnight (first overdue instant).
   Historical sent_at values include v126 synthetic backfills, so time history is **not** backfilled.
3. **Retain the existing cohort.** RECOVERY_APPROVAL_TYPES excludes profitability_warning while
   the ledger includes it. Producers include the union to avoid dropping identified work. The ledger
   still selects its original five types. Autonomous earned successes are work events but do not
   fabricate an identified money opportunity or enter the five-card money cohort.
4. **Approval is a decision, not delivery.** The brief counts approval as acted; that remains true.
   `opportunity_acted` therefore does not certify that a provider delivered. Later execution artifacts
   may be persisted after the approval event: method 3 reads these live links for V1's existing invoice
   facit path, using tenant + cohort IDs, never live status/estimate. Deleting a card preserves its
   identified work, but a later link absent from the snapshot can be lost; V2 should make financial
   provenance independent of mutable cards. This limitation is covered explicitly, not hidden.
5. **Historical comparison is explicit.** Defaults stay method 2 until migration and backfill have
   passed comparison; `?method=3` is available to the same owner/admin callers. No missing-table
   error is translated into an empty method-3 ledger. First identified estimate stays frozen;
   subsequent edits no longer rewrite historical potential. Expired cards become dismissed (method
   2 historically only displayed rejected cards as dismissed). These are intended differences.
6. **Deterministic attribution.** Method 2 previously used heap order to choose the winning card
   when two direct references point to the same invoice. Both I/O methods now sort by creation time,
   then ID before the unchanged pure computation. Money totals stay the same; row ownership is stable.
7. **Time compatibility.** Existing `time_minutes`/`time_hours` retain the old weekly estimate contract.
   The additive measured/estimated fields read event time when enabled; before rollout the weekly
   estimated field aliases the existing estimate, monthly event totals are empty. They are not an
   additional quantity to add to the legacy fields. V0 in #70 is untouched; its existing constants
   are also named in time-measured.ts for later consolidation after #70 merges.

## DB/RPC and security

`value_events` has immutable update/delete/truncate guards, tenant+idempotency uniqueness,
member read RLS and no direct service-role writes. `append_value_event` validates source tenant,
card tenant and subject identity; bigint amounts return as strings. Duplicate identities return
the original; a reused key for a different source/type is refused. Scoped producers only read
trusted source rows. Snapshots retain attribution fields, not message bodies or full customer data.
Historical source references are logical validated references, not deletion-cascading FKs: deleting
an operational card must not erase the append-only history. business_config remains a RESTRICT FK.

`backfill_value_events(business, dry_run=true, after_id='', limit=500)` processes a bounded page,
returns last_id and has_more, and marks historical records `payload.backfilled=true`. Repeating the
same page changes nothing. It never enables reading and never measures synthetic historical times.
The migration creates no nightly schedule: run the explicit, bounded seed once during rollout.

## Verification and rollout

- Local relevant value/attribution suites: 96 passed before the additional weekly response test.
- Method 2/3 SQL-backed comparison: same cohort, totals and row histories across pending/rejected,
  drafts, issued ÄTA, partial customer settlement, reminders, duplicate invoices and foreign refs.
- SQL tests: source/event rollback, tenant membership reads, denied direct writes/RPC execution,
  reserved stages, invalid evidence, idempotent backfill, immutable history, four earned keys,
  direct tenant-filtered timestamp pairs, more than one page of time events.
- Local TypeScript: exit 0 (8 GiB heap). Production `next build`: exit 0, compiled successfully.
  No Supabase keys were supplied to the local prerender environment.
- Two added tests pass: weekly response compatibility and exact bigint read transport;
  all six method-3 tests pass after the bigint change. Final CI is recorded on PR #72.

After review: merge code, validate v241 on staging with the source schema, dry-run/backfill each
business in pages, compare both methods for representative months, investigate intended/unintended
differences, then set server `VALUE_EVENTS_ENABLED=true` only when coverage is ready. A false/unset
flag keeps all readers on the legacy path. No SQL, backfill, flags or cron activation was performed
against production by this package. No pilot selection is assumed.

Open kernel §38 decisions remain untouched. Reverse charge/cash basis/ROT/cut-over computation is
unchanged: existing invoice facit is reused, no VAT or posting code is introduced. No new accounting
rule requires human accounting approval; Claude A/B review remains before merge.
