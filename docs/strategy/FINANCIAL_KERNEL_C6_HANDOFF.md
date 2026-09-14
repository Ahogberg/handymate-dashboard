# C6 implementation handoff

C6 implements phase control and Level 1 observation for a future named pilot. It neither enables a business nor changes the system of record. Claude review A/B/C/E and all CI gates remain required before merge. v242 has not been applied remotely.

## Scope and architecture

- `sql/v242_financial_kernel_shadow.sql`: six tenant-scoped evidence tables, twelve service-only RPCs, guarded phase control and bounded candidate reader.
- `phase.ts`, `shadow/{compare,service,run,admin}.ts`, `fortnox/shadow-adapter.ts`: exact normalized reference comparison, persistence and daily orchestration.
- New authenticated shadow cron at 04:30 UTC, four verified-superadmin routes and a Swedish admin section. Existing kernel cron reads consume/sweep decisions from the authoritative RPC.
- C5b LOW fixes: a lost finish acknowledgement is reported per intent and does not stop the other claims; bridge runner reason now names the settled customer receivable. The 100-event per-tick backlog cap remains explicit pilot operating guidance (10-minute ticks; halted consumers resume manually).
- Retention inventory, route/auth inventory, test registration and architecture FK.4 updated. No canonical event names added. No journal, VAT, rounding policy, payment command or invoice correction is performed by shadow code.

Relies on architecture FK.0–FK.6; shadow architecture §§2–11,17,21.6; orchestration §§5 C6,6,7,9; package-log §3.

## Deviations from the embedded v242 draft

The original draft was executed first. Five of six initial adversarial SQL tests failed: service-role direct writes, same-day confirmation, overlapping runs, foreign-tenant invoice snapshots and whitespace actor/reason validation. These failures are evidence for correction, not acceptance results.

1. RPC-only writes are enforced with `REVOKE ALL` then SELECT-only grants, including inherited service defaults. The draft's GRANT ALL would allow bypassing its audit lifecycle. History tables retain immutable triggers.
2. A monotonic rollout sequence orders changes, including several changes in one transaction; UUID ordering with transaction-stable timestamps could select the wrong phase. INSERT/UPDATE flag guards reject dispatch changes inconsistent with audited history. Migration refuses pre-existing enabled businesses with no history instead of inventing an actor or pilot decision.
3. Phase/run/resolve inputs reject null and whitespace. Business-level advisory locking serializes run, comparison, phase and resolution changes. Only one running comparison per business; a subsequent open expires a run older than ten minutes as failed, allowing recovery from a terminated worker without parallel live 240-second runs.
4. A comparison retry for the same run/object is idempotent and rejects changed arguments. Multiple dimensions of one kind count as one sighting. Confirmation requires consecutive Stockholm calendar dates; same-day/manual repeats do not confirm, gaps or an intervening absence reset the streak. A match still closes with comparison provenance; absence of a kind does not invent a resolution.
5. Snapshot invoice FKs and comparison validation reject foreign-tenant or different-invoice evidence. Every numeric legacy field crossing JSON is a decimal string.
6. `list_shadow_candidates` implements the otherwise missing candidate query, selects least-recently-compared first, caps at 200, and includes all post-phase sent invoices, including those without a Fortnox reference. Requiring a reference would hide missing kernel entries. `list_financial_kernel_work` additionally returns owed_intents as promised by the prose.
7. Exact reference normalization lives in `lib/fortnox/shadow-adapter.ts` per the parent boundary. It maps the same economic classes but cannot reuse the legacy classifier's ±1 kr tolerance or local-customer-paid short circuit. Unknown classes/amounts never match. A proven internal projection difference is retained even when reference data is missing.
8. Drift reporting now exposes a storage receipt through a new helper; the existing void helper preserves behavior for other callers. Reported markers are written only after successful persistence. Reporting and marking remain two commits: a crash between them can repeat a diagnostic report (at-least-once), never an economic effect. Active-run serialization prevents ordinary concurrent reports.
9. Runtime reserves 25 seconds within its 240-second budget for persistence after the existing bounded Fortnox GET. Partial runs record counts and budget exhaustion; no unexamined object is counted as a match.
10. FK.4 now records the approved history-table design instead of the superseded proposed phase columns. The old C5b cron tests update only their work-list fixture to the new RPC boundary; dispatch and auth assertions remain.

## Evidence

New SQL, exact comparison, run, admin and full integration suites are registered identically in local contracts and CI. The full SQL-backed Fortnox stub scenario records a one-öre mismatch, a next-day confirmed sighting and one report, an unreported same-day repeat, then an exact match with `superseded_by_match` pointing to its comparison; four immutable snapshots and twelve unsupported-level rows remain. Separate integration tests prove kill-switch sweep without consume and lost-finish isolation without re-send. The initial new/C5b sweep batch has 56 passing tests. Final TypeScript, build and complete CI results are recorded on the PR's current head.

## Limits and owner gates

No production SQL, phase flip, new external sends or pilot choice occurred. Before activation: apply v239, v240 and v242 in order, verify both crons and the pilot's Fortnox connection, meet the PMF gate and record the owner's named pilot/reason. v241/V1 is independent. S2 remains refused. S1 matches prove sync mechanics only. Levels 2–4 are explicitly unsupported (`bookkeeping scope not granted`).

R0, P0, C1b, C4b, Skatteverket partner API and retention/anonymisation decisions remain open. No named accounting reviewer is needed for these observation mechanics; Swedish reverse-charge/cash-basis/VAT correctness is not evidenced by this comparison, and ROT component fixtures do not replace accountant review. No pre-phase historical invoice replay or opening balances are introduced.
