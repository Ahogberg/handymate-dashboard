# C8 — Ledger schema + posting engine

> Claude brief, 2026-09-15. Orchestration §5 C8; blueprint §13 (Ledger domain model), §14 (Posting Engine),
> §22 (Ledger invariants), §26 (dates), §36 (statutory voucher rules); ARCHITECTURE.md FK.1 rows
> `journal_entry_posted` / `journal_entry_reversed` / `period_locked` / `period_unlocked`, FK.5 (`lib/ledger/`).
> Blockers C2 and C3 are merged, so this package is free. C9, C10, C12 and C13 all wait on it
> ([capability matrix](../roadmap/FORTNOX_CAPABILITY_MATRIX.md) §Beroenden).
> Same rules as every other package: handoff block back under §9, Claude reviews against orchestration §6 A–E.

## 0. What C8 is, and what it is not

C8 turns the kernel's events into vouchers. It is the country-neutral core of the Ledger: accounts, fiscal years,
monthly periods, journals (voucher series), entries and lines, an atomic posting RPC that allocates a gapless
voucher number and appends `journal_entry_posted` in the same transaction, a reversal primitive, and period
lock/unlock with an audit event. It also ships the TypeScript posting engine: a kernel consumer that maps an
event through a registered rule to a balanced draft and posts it idempotently.

It does **not** decide a single BAS account, a series letter, a VAT treatment or an accounting-method rule.
Those are C9 and a named consultant (§36.6; SE review Q1, Q15, Q16). The rule registry ships **empty**. No
flag is introduced (`auto_post_accounting_enabled` is C9's, `handymate_ledger_enabled` is C10's), the engine
is not wired to any cron, and production behaviour is unchanged after merge. The migration is `v251`
(v249 is H3b, v250 is applied).

## 1. Claude decisions

| Decision | Why |
|---|---|
| **Minor units, `BIGINT`, strings across JSON.** Lines carry `debit_minor` / `credit_minor`; the RPC accepts and returns decimal strings. Not `NUMERIC(20,4)` as blueprint §5 sketched. | C1/C2 decided minor units and lossless strings for the kernel; the Ledger is a projection of the same events and must not introduce a second numeric model. Check 26 proves values beyond JavaScript's safe range round-trip exactly. |
| **The voucher number is allocated inside the posting transaction**, from `ledger_voucher_counters (journal, fiscal_year)`, after every validation has passed. A raise anywhere undoes the number with the entry. | §36.1: gapless per series and year, never allocated in JavaScript, never consumed by a failed posting (check 15). |
| **Series are text per business, created by `ensure_ledger_journal`; no fixed set.** C9 creates the SE set; tests use `A` and `B`. | SE review Q15 (one `A` series or per-source series) is the consultant's. Hard-coding `F/B/L/M` here would be a model deciding an accounting convention. |
| **Fiscal year starts on the 1st of a month, ends on a month end, 1–18 months, no overlap; periods are calendar months generated with the year.** | Swedish practice (broken first year up to 18 months). Month periods are what lock, VAT and SIE all key on. A period is looked up from `effective_date` (§26), never from receipt time. |
| **Periods lock in date order and unlock in reverse; unlock demands actor and reason; both append an event.** Who may unlock is enforced in TypeScript (superadmin until Q16 is answered). | §22 "no posting into a locked period unless privileged"; §36.2 processing history. An unlocked February behind a locked March is how gaps in a lock date appear. |
| **A reversal is a new entry in the same series with the sides swapped, `journal_type = 'reversal'`, rule `reversal` v1, source event = the original's `journal_entry_posted`.** The original gets `status = 'reversed'` and `reversed_by_entry_id`, nothing else ever changes. One reversal per entry; a reversal is not reversed; dated on or after the original; into a locked period refused. | Blueprint §13, SE review §4. "Dated in the first open period" is a policy for C9/C10 to apply in TS with a note on the entry; the RPC only refuses. |
| **A manual voucher is rule `manual` version 0, requires `actor_type = 'user'` with an id, carries no source event and gets its own `fin_ledger_<id>` correlation.** It is the only path where a human supplies lines. | Blueprint §14: product modules never supply arbitrary lines; a privileged accounting tool may. C10 builds the surface (matrix row C8 "Manuella verifikat"); C8 only makes it possible and audited. |
| **Provenance is four columns and one event:** `source_event_id` (FK to `financial_events`), `posting_rule_id`, `posting_rule_version`, `posted_event_id`; `journal_entry_posted` is appended **first**, inside the posting transaction, with the source event as causation and its correlation inherited. | §14 provenance, §36.2 processing history, FK.2 correlation. A voucher that cannot explain itself is the failure the whole architecture exists to prevent. |
| **Balance and immutability live in the tables, not only in the RPC.** A deferred constraint trigger checks `sum(debit) = sum(credit) = total_minor` and ≥ 2 lines at commit; triggers refuse every UPDATE/DELETE on lines and every UPDATE on an entry except the reversal marking. | Blueprint §13 "prefer database-level validation". Check 30 inserts a line behind the RPC as the table owner and is still refused at commit. |
| **No account rows are shipped.** `ledger_accounts.confirmed_by` / `confirmed_at` record the named person; `source ∈ proposal / sie_import / manual`. | Review protocol §6 D becomes a data question. C9 may refuse automatic posting to an unconfirmed account; C4b imports the customer's own chart. |
| **Tenant read for `authenticated` via `is_business_member`, exactly like `financial_events`; every write through an RPC; the posting core `ledger_post` is executable by no role.** | The books belong to the customer and C10's screens read them. The consultant role (matrix C4) extends the policy later, it does not change the shape. |
| **Same lock namespace as the kernel: `financial_lock(business)` first, row locks second, append last.** | Posting *is* kernel work on the same events; a separate namespace would let a posting race an allocation. (Contrast H3b, which deliberately took its own.) |
| **The TypeScript engine is a `financial_event_consumers` consumer, `ledger-posting`, driving pure rules.** A rule is `(event, ctx) → JournalDraft \| null`; `ctx` carries the account map and nothing that varies between runs. Idempotency key `ledger:<event_id>:<rule_id>:v<version>`. Registry empty; not wired to the cron. | §14 "same event + same rule version = same posting". C9 registers rules and wires the consumer behind its flag; C8 proves the mechanics with a test rule. |
| **Retention: all seven tables are `BEHALLS` with `ON DELETE RESTRICT`.** | §36.2: räkenskapsinformation outlives the subscription. Same bricks as C2. |

## 2. Read first

`sql/v235_financial_events.sql` (envelope, immutability, the lock-order header), `sql/v238_financial_receivables.sql`
(`financial_lock`, `financial_append`, the RPC shape with idempotent replay and `_json` projections),
`sql/v236_financial_event_consumers.sql` + `lib/financial-kernel/events/consume.ts` (leases, ordered ack — the
engine rides this), `lib/financial-kernel/events/{catalog,types}.ts` (the four reserved event names whose payloads
are still `never`), `tests/financial-kernel/golden-paths.ts` (every `vouchers[]` entry is a C8 fixture),
`docs/strategy/FINANCIAL_KERNEL_SE_LEDGER_REVIEW.md` §4–§7 (what the reversal, period and provenance rules must
allow the consultant to decide later), `lib/account/radera.ts` (`BEHALLS`).

## 3. The migration — `sql/v251_ledger_posting_engine.sql`

Drafted and proven in PGlite (§6, 48/48). Codex may change it; every change to the balance rule, the numbering,
the immutability triggers or the provenance columns needs a line in the handoff saying why.

Tables (all `business_id` → `business_config` `ON DELETE RESTRICT`, all `UNIQUE (business_id, id)` for
tenant-scoped FKs):

| Table | Holds | Key constraints |
|---|---|---|
| `ledger_accounts` | number (text), name, type ∈ asset/liability/equity/revenue/expense, active, source, `confirmed_by`/`confirmed_at` | `UNIQUE (business_id, number)`; confirmed pair set together |
| `ledger_fiscal_years` | `starts_on`, `ends_on`, status open/closed | starts on day 1, ends on a month end, ≤ 18 months; overlap refused in the RPC |
| `ledger_periods` | one per calendar month of the year; status open/locked, `locked_at`, `locked_by`, `lock_event_id` → `financial_events` | `(status='locked') = (lock_event_id IS NOT NULL)` |
| `ledger_journals` | series `^[A-Z][A-Z0-9]{0,5}$`, name | `UNIQUE (business_id, series)` |
| `ledger_voucher_counters` | `next_number` per (journal, fiscal year) | written only by the posting core |
| `ledger_entries` | series/year/period, `voucher_number`, `journal_type`, `effective_date`, `posted_at`, currency, `total_minor`, description, `source_event_id`, `correlation_id`, `posting_rule_id`/`_version`, `reversal_of_entry_id`, `reversed_by_entry_id`, status, `idempotency_key`, `request_hash`, `posted_event_id`, actor | `UNIQUE (business_id, journal_id, fiscal_year_id, voucher_number)`; `UNIQUE (business_id, idempotency_key)`; `source_event_id IS NOT NULL OR (rule='manual' AND actor='user')`; `(reversal_of IS NULL) = (journal_type <> 'reversal')` |
| `ledger_entry_lines` | `line_no`, `account_id`, `debit_minor`, `credit_minor`, `vat_code`, `project_id`, `customer_id`, `supplier_id`, metadata | `(debit > 0) <> (credit > 0)`; deferred balance trigger; immutable |

RPCs (all `SECURITY DEFINER`, `search_path` pinned, EXECUTE for `service_role` only):

| RPC | Does |
|---|---|
| `open_ledger_fiscal_year(business, starts_on, ends_on)` | Creates the year and its monthly periods; idempotent on `starts_on`; overlap → `ledger_fiscal_year_overlap`. |
| `ensure_ledger_journal(business, series, name)` | Idempotent per series; keeps the first name. |
| `upsert_ledger_account(business, number, name, type, source, confirmed_by?, active?)` | Idempotent per number; a blank `confirmed_by` is null; type frozen once the account has lines. |
| `post_journal_entry(business, series, journal_type, effective_date, description, lines, source_event_id, rule_id, rule_version, idempotency_key, actor_type, actor_id, currency='SEK')` | Validates every line, the balance, the period (open) and the year (open), the source event (same business) or the manual conditions; allocates the number; appends `journal_entry_posted`; inserts entry and lines. Replay with the same key returns the same entry; a replay whose `request_hash` differs raises `ledger_idempotency_conflict`. Refuses `journal_type`/rule `reversal`. |
| `reverse_journal_entry(business, entry_id, effective_date, reason, idempotency_key, actor_type, actor_id)` | New entry through the internal core with sides swapped and `reversal_of_entry_id`; marks the original; appends `journal_entry_reversed` with the reason, caused by the reversal's posted event. |
| `lock_ledger_period(business, period_id, actor_id)` | In date order; appends `period_locked{period_id, fiscal_year_id, locked_by}`; already locked → `changed:false`, no event. |
| `unlock_ledger_period(business, period_id, actor_id, reason)` | Reverse order; actor and reason mandatory; appends `period_unlocked{…, unlocked_by, reason}` caused by the lock event. |
| `read_ledger_entry(business, entry_id)` | The entry with its lines, minor units as strings, account numbers resolved. Projections are C10. |

Internal, executable by no role: `ledger_post` (the core both public RPCs call), `ledger_entry_json`,
`ledger_period_for`, `ledger_lines_normalized`, `ledger_request_hash`.

Grants: RLS on all seven tables; `REVOKE ALL` from PUBLIC/anon/authenticated/service_role; `SELECT` to
`service_role`; `SELECT` to `authenticated` under `is_business_member(business_id)` on everything except the
counters.

## 4. Scope

```text
sql/v251_ledger_posting_engine.sql             (drafted; §3 and the file)
lib/ledger/service.ts                          (openFiscalYear, ensureJournal, upsertAccount, postJournalEntry, reverseJournalEntry,
                                                 lockPeriod, unlockPeriod, readEntry — thin wrappers over the RPCs on KernelDb,
                                                 minor units typed as strings, same shape as lib/financial-kernel/receivables/service.ts)
lib/ledger/posting-engine.ts                   (PostingRule { id, version, eventTypes, draft(event, ctx) }, JournalDraft, RuleRegistry,
                                                 ledgerPostingHandler(registry): FinancialEventHandler with consumer 'ledger-posting';
                                                 per event: rules for its type → draft → postJournalEntry with key ledger:<event_id>:<rule_id>:v<n>;
                                                 a rule that names an account missing from ctx throws → the consumer halts, nothing partial is posted)
lib/financial-kernel/events/types.ts           (payloads for journal_entry_posted, journal_entry_reversed, period_locked, period_unlocked per FK.1; no more `never`)
handymate-dashboard/ARCHITECTURE.md            (FK.1: the four rows ✅ with "C8"; FK.4 unchanged — no flag in this package)
lib/account/radera.ts                          (seven ledger_* tables into BEHALLS; kontoradering.spec must stay green)
tests/ledger-sql.spec.ts                       (the 48 checks in §6 as PGlite cases; fixture = v235 + financial_lock/financial_append from v238 + v251)
tests/ledger-golden-path-vouchers.spec.ts      (every vouchers[] entry in tests/financial-kernel/golden-paths.ts posts through post_journal_entry
                                                 with PROPOSED_ACCOUNTS loaded as source='proposal', unconfirmed; the replayed entry's lines equal the fixture
                                                 line for line; numbers run per series in fixture order)
tests/ledger-posting-engine.spec.ts            (the handler against real consume.ts and PGlite: one test rule; redelivery posts once; same event twice → one
                                                 entry; a rule with a missing account halts the consumer with no entry; determinism: two runs, byte-equal drafts)
.github/workflows/contracts.yml, package.json  (register the three specs, one YAML line each)
docs/strategy/FINANCIAL_KERNEL_PACKAGE_LOG.md  (C8 handoff block, §9 fields)
```

Not touched: `app/api/cron/financial-kernel/route.ts` (no consumer wiring), every flag, every Pay path, every
invoice column.

## 5. Invariants

1. For every posted entry `sum(debit_minor) = sum(credit_minor) = total_minor`, at least two lines, each line on
   exactly one side. Enforced by the RPC before any write and by the deferred trigger at commit.
2. Voucher numbers are gapless per (journal, fiscal year), allocated in the posting transaction; a refused
   posting consumes no number.
3. An entry and its lines never change after commit. The one permitted update is `status → reversed` with
   `reversed_by_entry_id`, made by `reverse_journal_entry`.
4. A posting into a locked period, a closed year, or a date with no period is refused. Lock is in date order,
   unlock in reverse; every lock and unlock is a `financial_events` row with an actor; unlock has a reason.
5. Every rule-driven entry names a source event of the same business; `journal_entry_posted` is appended in the
   same transaction with that event as causation and its correlation. A manual voucher names a user instead.
6. A reversal is a new entry referencing the original; the original is reversed at most once; a reversal is
   never reversed; the reversal's source event is the original's posted event; `journal_entry_reversed`
   carries the reason.
7. `post_journal_entry` and `reverse_journal_entry` are idempotent per `(business_id, idempotency_key)`; a
   replay with different content raises.
8. Every table and RPC is tenant-scoped: another business's series, period, entry or event is "not found",
   never a silent no-op.
9. `anon` reads nothing and executes nothing; `authenticated` reads only its own business and executes
   nothing; `service_role` reads everything and writes only through the eight RPCs; no role can call
   `ledger_post` or write a counter.
10. No account number, series letter, VAT code or method rule is decided by this package; the rule registry is
    empty; `confirmed_by` is null on every account a test creates.
11. No comparison tolerance anywhere in `lib/ledger/` or v251 (FK.0 rule 3).
12. Same event + same rule version → byte-identical draft. The engine reads no clock and no table the rule
    context did not hand it.

## 6. Acceptance — the 48 checks, all green in PGlite on the drafted DDL

Claude ran these against the real migration (fixture: v235, `financial_lock`/`financial_append` from v238, v251;
48 passed / 0 failed). Codex converts them into `tests/ledger-sql.spec.ts`; a check that has to be weakened needs
a line in the handoff.

- **Fiscal years and periods (5):** a calendar year opens with twelve open monthly periods; opening it again is
  idempotent; an overlapping year is refused; a year not starting on the 1st is refused; an 18-month first year
  has 18 periods and 19 months is refused.
- **Journals and accounts (4):** a journal is idempotent per series and keeps its first name; a lower-case or
  seven-character series is refused; an account is unconfirmed until a named person confirms it and stays
  confirmed after; a blank `confirmed_by` is null and the type set is closed.
- **Posting (18):** a balanced entry posts as A1 with string minor units, ordered lines and the March period;
  `journal_entry_posted` is appended in the same transaction with the FK.1 payload, the source event as
  causation and its correlation, amount = total; numbers run per series (A2, then B1); numbers restart per
  fiscal year; an unbalanced entry leaves no row and no event; a failed posting consumes no number; both sides /
  neither side / a lone line refused; decimal or negative amounts refused; unknown or inactive account refused;
  same key → same entry, no second event; same key with other lines or date → conflict; a date outside every
  year has no period; a rule-driven entry needs a source event of the same business (missing and foreign both
  refused); a manual voucher needs a named user and version 0 and gets `fin_ledger_…`; a manual voucher may not
  carry a source event; `post_journal_entry` refuses to pose as a reversal; amounts beyond 2⁵³ round-trip exactly;
  golden path 36 posts with the rounding line and balances exactly.
- **Immutability (4):** an entry cannot be edited or deleted even by the owner; a line cannot be edited or
  deleted; a line inserted behind the RPC is refused at commit by the deferred trigger; the account type is
  frozen once it has lines.
- **Reversal (6):** a reversal is a new entry in the same series with the sides swapped and the original marked
  and otherwise untouched; provenance chains (reversal source = original posted event; `journal_entry_reversed`
  names both entries and the reason and is caused by the reversal's posted event); reversed at most once and a
  reversal is not reversed; replaying the reversal key returns the same reversal; reason required and not before
  the original; another tenant can neither reverse nor read.
- **Period lock (7):** lock is audited with the actor and blocks posting into that period but not the next;
  periods lock in date order; locking a locked period changes nothing and appends nothing; unlock needs actor
  and reason and runs in reverse order; unlock is audited with reason and actor, caused by the lock event, and
  posting works again; a reversal into a locked period is refused; another tenant can neither lock nor unlock.
- **Roles (4):** anon can neither read nor post; authenticated reads only its own business and cannot post or
  lock; service_role reads but cannot insert an entry, update a counter or a period; service_role cannot call
  `ledger_post` but can call `post_journal_entry`.

Plus the two TypeScript specs in §4: **every golden-path voucher replays through the RPC unchanged** (this is
what makes the golden paths executable from C8 on, and it demonstrates regime neutrality for §6 E: standard,
reverse-charge, ROT and cash-basis vouchers all go through one code path that never inspects the regime), and
**the engine posts once per event, halts on a missing account, and is deterministic**.

## 7. Not in this package

Any posting rule (C9). Any account row, series set or VAT code (C9 + consultant). Ledger, balance, P&L, voucher
list and SIE (C10). Wiring the consumer to the cron and `auto_post_accounting_enabled` (C9). Period *close*,
year-end vouchers, `ledger_fiscal_years.status = 'closed'` transitions (C10). Opening balances (C4b). Any UI.
The "dated in the first open period" reversal policy (C9/C10, in TypeScript, with a note on the entry).

## 8. Activation

Nothing to activate. After review and merge, v251 is applied like v235–v240 (schema only; no row is written
until C9 registers a rule and the owner flips its flag). Verify after apply: seven tables, eight RPCs callable
by service_role, `ledger_post` callable by none, zero rows.

## 9. Handoff

_Codex fills this in, with the orchestration §7 fields: package/scope, files, architecture sections relied on,
canonical events touched (the four, payloads now typed), DB/RPC changes, flags (none), golden paths
added/updated, invariants affected, unresolved questions, open decisions encountered (§38) and left alone,
Swedish regime coverage (via the golden-path replay), and "human accounting review required" — no for the
mechanics in this package, yes before C9 by a named person. Claude reviews against orchestration §6 A–E._
