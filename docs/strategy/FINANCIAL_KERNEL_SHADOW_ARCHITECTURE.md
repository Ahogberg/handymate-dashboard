# Handymate Financial Kernel — Automated Shadow Verification Architecture

> Status: **Normative architecture companion**
> Date: 2026-09-12
> Parent contract: `docs/strategy/FINANCIAL_KERNEL_ARCHITECTURE.md`, especially §20
> Scope: Automated Fortnox shadow verification, divergence lifecycle, migration-readiness gates and the permanent Financial Integrity Engine.
>
> **Implementation rule:** this document is part of the Financial Kernel architecture contract. Any agent implementing Sprint 6 / Fortnox shadow verification must read this document together with the parent architecture. It does not replace §20.1's S1/S2 rule; it makes the implementation shape explicit.

## 1. Why this subsystem exists

Shadow Accounting must not be a collection of manual comparisons or one-off scripts.

It is an automated validation subsystem whose job is to answer, continuously and explainably:

> **Did Handymate independently derive the same economically relevant result as the trusted external reference — and, later, does Handymate's own financial state agree with itself?**

The initial external reference is Fortnox. Fortnox is temporary validation infrastructure, not permanent architecture.

The target shape is:

```text
Handymate Financial Kernel
        |
        | canonical events / derived state
        v
Handymate Snapshot Builder
        |
        +---------------------------+
                                    |
Fortnox Reference Adapter          |
        |                           |
        v                           v
Reference Snapshots          Handymate Snapshots
        |                           |
        +-------------+-------------+
                      v
               Comparison Engine
                      |
          +-----------+-----------+
          |                       |
          v                       v
        MATCH                 DIVERGENCE
                                  |
                                  v
                         Exception / Review Queue
                                  |
                                  v
                        Regression + Resolution
                                  |
                                  v
                         Readiness / Integrity
```

**Binding:** human reviewers handle exceptions and accounting judgement. Routine import, normalization, comparison, retry, classification, metrics and readiness calculation are automated.

---

## 2. S1 and S2 remain distinct evidence classes

The parent architecture §20.1 is binding.

### S1 — Fortnox-fed shadow

```text
Fortnox -> Handymate state
Fortnox -> reference snapshot
Handymate -> comparison
```

S1 proves adapter correctness, import/sync mechanics, snapshot normalization, comparison-engine behavior and some posting/projection plumbing.

S1 **does not prove independent financial correctness** because the compared Handymate state may have been derived from Fortnox itself.

### S2 — independent shadow

```text
Handymate invoice / source document / bank / PSP / explicit manual command
        |
        v
Financial Kernel computes Handymate truth independently

Fortnox
        |
        v
reference snapshot only

Independent Handymate truth <-> Fortnox reference
```

S2 is the evidence used for migration readiness.

**Binding:** every comparison run, metric and dashboard summary must carry its evidence phase (`S1` or `S2`). S1 matches must never be included in an S2 readiness percentage or presented as independent validation.

The S1 -> S2 flip is per business, explicit, dated, auditable and reversible only through an explicit rollout action with reason.

---

## 3. Reference-adapter boundary

The comparison engine must not understand Fortnox-specific response shapes.

Create a reference-adapter boundary conceptually like:

```text
lib/financial-kernel/shadow/
  snapshots/
  compare/
  divergence/
  readiness/
  integrity/

lib/fortnox/
  shadow-adapter.ts
```

The Fortnox adapter fetches supported reference data, retains external identifiers and source timestamps, normalizes into canonical shadow snapshot schemas, persists immutable/versioned reference snapshots, and never writes canonical Handymate financial truth in S2.

Provider-specific fields may be retained for audit/debugging, but comparison rules operate on canonical normalized structures.

---

## 4. Canonical snapshot model

Snapshots are immutable observations of relevant state at a point/effective period.

Minimum snapshot families:

```text
invoice / receivable
supplier invoice / payable
payment / allocation
journal voucher
account balance
customer AR balance
supplier AP balance
bank / clearing balance
VAT period / VAT return boxes
period totals
```

A normalized receivable snapshot may conceptually contain:

```ts
interface ShadowReceivableSnapshot {
  businessId: string
  canonicalObjectId?: string
  externalReference?: string
  invoiceNumber?: string
  currency: string
  grossAmount: string
  paidAmount: string
  outstandingAmount: string
  vatAmount: string
  settlementState: string
  effectiveDate?: string
}
```

A normalized journal snapshot may conceptually contain:

```ts
interface ShadowJournalSnapshot {
  businessId: string
  voucherReference: string
  effectiveDate: string
  lines: Array<{
    account: string
    debit: string
    credit: string
    vatCode?: string
    counterpartyRef?: string
    sourceDocumentRef?: string
  }>
}
```

Ordering differences that are semantically irrelevant must be normalized before comparison. Economic differences must never be normalized away.

---

## 5. Required persistence model

Names can follow repository conventions, but the subsystem needs durable concepts equivalent to:

```text
shadow_reference_snapshots
shadow_comparison_runs
shadow_comparisons
shadow_divergences
shadow_resolutions
shadow_readiness_metrics
```

### `shadow_reference_snapshots`

Conceptual fields:

```text
id
business_id
reference_provider
object_type
external_id
external_version nullable
effective_at nullable
source_updated_at nullable
snapshot_schema_version
snapshot JSONB
imported_at
```

Snapshots are append/version oriented. A later Fortnox observation does not silently rewrite the historical snapshot used by a previous comparison.

### `shadow_comparison_runs`

```text
id
business_id
phase
trigger_type
started_at
completed_at
comparison_version
status
counts JSONB
```

### `shadow_comparisons`

```text
id
comparison_run_id
business_id
phase
object_type
canonical_object_id nullable
reference_snapshot_id nullable
result
comparison_version
differences JSONB
checked_at
```

### `shadow_divergences`

```text
id
business_id
comparison_id
phase
kind
severity
object_type
canonical_object_id nullable
reference_snapshot_id nullable
handymate_snapshot JSONB
reference_snapshot JSONB
difference JSONB
first_seen_at
last_seen_at
status
root_cause_code nullable
```

### `shadow_resolutions`

```text
id
divergence_id
resolution_type
reason
resolved_by
resolved_at
fix_reference nullable
regression_test_reference nullable
replay_reference nullable
```

### `shadow_readiness_metrics`

Persist daily/periodic readiness evidence so migration decisions are auditable rather than recomputed from today's database and presented as if they had always been true.

---

## 6. Comparison levels

A robust shadow system compares at multiple levels because one level can hide another level's failure.

### Level 1 — object equality

Compare individual economic objects: invoice/receivable, supplier invoice/payable, payment, customer balance and supplier balance.

Dimensions include gross amount, VAT amount/regime, paid amount, outstanding amount, effective date, settlement state and linkage.

### Level 2 — ledger equality

Compare journal meaning, not only header totals:

```text
effective date
account
exact debit
exact credit
VAT code
counterparty
source document
```

If both vouchers balance but use economically different accounts or VAT treatment, that is a divergence.

### Level 3 — aggregate equality

Compare independently aggregated period/business state:

```text
AR total
AP total
bank balances
clearing balances
output VAT
input VAT
revenue
cost
period result
```

### Level 4 — statutory/report outcome

For Sweden, compare relevant period outcomes such as VAT return boxes / VAT payable-receivable, trial balance dimensions and period totals.

Where Fortnox cannot expose an exact comparable dimension, record the dimension as unsupported/pending rather than fabricating equality.

**Binding:** migration readiness cannot be based solely on object-level matches.

---

## 7. Exact comparison and difference policy

Financial comparison is exact under the Money and rounding rules in the parent architecture §5.

There is no generic tolerance such as:

```text
abs(handymate - fortnox) <= 1 kr => match
```

A real permitted rounding difference must already be represented economically by an explicit Handymate posting/rule. A residual difference is a divergence or pending-reference condition — never silently absorbed by the shadow engine.

---

## 8. Divergence taxonomy

Minimum taxonomy should include concepts equivalent to:

```text
PAYMENT_DIVERGENCE
RECEIVABLE_BALANCE_DIVERGENCE
PAYABLE_BALANCE_DIVERGENCE
AR_AGGREGATE_DIVERGENCE
AP_AGGREGATE_DIVERGENCE
VAT_DIVERGENCE
POSTING_ACCOUNT_DIVERGENCE
POSTING_AMOUNT_DIVERGENCE
POSTING_DATE_DIVERGENCE
ROUNDING_DIVERGENCE
MISSING_HANDYMATE_ENTRY
MISSING_REFERENCE_ENTRY
DUPLICATE_POSTING
BANK_BALANCE_DIVERGENCE
CLEARING_BALANCE_DIVERGENCE
UNMATCHED_SOURCE_DOCUMENT
REFERENCE_DATA_UNAVAILABLE
```

Severity is separate from kind. Suggested conceptual severity:

```text
info
low
medium
high
critical
```

Severity policy must be deterministic/versioned and reviewed by the accounting/domain owner for accounting-sensitive cases.

---

## 9. Event-driven verification and eventual consistency

Shadow checks should happen near the economic event, but external systems can lag.

```text
canonical financial event
        |
        v
schedule targeted shadow verification
        |
        v
fetch/refresh reference snapshot
        |
        v
compare
```

Reference lag must not generate false alarms.

Conceptual retry policy:

```text
T+0 / soon after event     initial check
T+5 minutes                retry if reference missing/stale
T+30 minutes               retry
T+2 hours                  retry / expected sync horizon
later                      escalate according to reference SLA/policy
```

Exact timings are operational configuration, not hard-coded architecture constants.

Comparison states must distinguish:

```text
MATCH
PENDING_REFERENCE
DIVERGENCE
REFERENCE_UNAVAILABLE
```

A `PENDING_REFERENCE` becomes a divergence only after the defined reference-lag policy says the external state should have caught up.

Retries are idempotent. A retry must not create duplicate divergence records for the same unresolved economic difference.

---

## 10. Nightly full reconciliation

Event-driven checks are necessary but insufficient.

Run a scheduled full verification for each shadow-enabled business, conceptually nightly:

```text
1. pull all changed/supported Fortnox reference objects
2. persist normalized reference snapshots
3. rebuild/obtain Handymate comparison snapshots
4. run object comparisons
5. run ledger comparisons
6. run aggregate comparisons
7. run VAT/report comparisons where supported
8. run Financial Kernel integrity invariants
9. update divergences
10. persist readiness metrics
```

The job reports exceptions; it never silently rewrites posted Handymate history from Fortnox.

---

## 11. Divergence lifecycle

A real divergence follows an auditable lifecycle:

```text
detected
  -> classified
  -> investigated
  -> root cause identified
  -> regression scenario/test created where applicable
  -> rule/code/data correction performed through valid correction mechanics
  -> affected event/state replayed or reprocessed safely
  -> comparison rerun
  -> verified match
  -> resolved
```

**Binding:** do not close a financial divergence merely because a developer manually made the two displayed numbers equal.

Where the reference is wrong or intentionally differs, use an explicit accepted-exception/reference-error resolution with documented reason and professional approval where required.

Every newly discovered domain edge case should become a regression test when reproducible.

---

## 12. Automated readiness metrics

Each pilot business gets an automated shadow-readiness view.

Example internal summary:

```text
ACCOUNTING SHADOW — Example Business

Independent S2 period:          31 days
Comparisons:                    2,481
Matches:                        2,477
Pending reference:              0
Open critical divergences:      0
Open high divergences:          0
Resolved divergences:           4

AR                           100%
AP                           100%
VAT                          100%
Bank/Clearing                100%
Journal comparison           99.98%

Migration readiness:         GREEN
```

Do not collapse all correctness into one vanity percentage. Metrics must exclude S1 from independent S2 evidence.

---

## 13. Accounting migration-readiness gate

No user, agent or engineer may switch a pilot business to Handymate-only accounting merely because the UI "looks right".

The transition must be protected by a machine-evaluated gate plus explicit human/professional approval.

Initial target gate:

```text
Independent S2 shadow period      >= 30 consecutive days
Open critical divergences         = 0
Open high divergences             = 0
AR reconciliation                 = 100%
AP reconciliation                 = 100% where AP is in pilot scope
VAT/report comparison             = 100% for at least one relevant completed reporting period
Bank / clearing reconciliation    = 100% for in-scope accounts
Opening balances                  verified
SIE export                        verified
Required statutory artifacts      verified
Professional accounting review    approved
```

The 30-day target is an initial architecture recommendation, not a substitute for a formal pilot policy. If the accounting reviewer requires a longer evidence window, the stricter requirement wins.

A readiness result is persisted with calculation version, evidence window, dimensions checked, unsupported dimensions, outstanding accepted exceptions, approver(s) and timestamp.

**Binding:** an agent cannot override a red readiness gate.

---

## 14. Readiness is per business, not a global feature flag

A release can have:

```text
Business A: S1
Business B: S2 / RED
Business C: S2 / GREEN
Business D: Handymate canonical + Fortnox shadow
```

Readiness should also record which regimes were exercised, e.g. accounting method, reverse construction VAT, ROT/RUT, supplier AP and bank reconciliation. This prevents a trivial pilot from being used as evidence that unexercised regimes are production-proven.

---

## 15. Internal UX and role-specific presentation

Engineering/support gets detailed evidence. Accounting professionals get unresolved divergences, voucher/source-document linkage, account/VAT differences, period reconciliation, resolution workflow and readiness evidence. Business owners get outcome/exception language. Karin consumes the same canonical divergence/readiness state and does not infer a separate status from ad hoc queries.

---

## 16. From temporary shadow mode to permanent Financial Integrity Engine

The shadow subsystem must **not** be deleted when Fortnox is removed.

Fortnox comparison is the first external validation use case for a more general permanent capability:

> **Handymate Financial Integrity Engine**

After cut-over, the comparison graph becomes broader:

```text
Ledger
  <-> Bank
  <-> Payments / PSP settlements
  <-> Receivables / Payables
  <-> VAT/report state
  <-> Source documents
  <-> Opening/period balances
```

Permanent integrity checks answer whether settled receivables have explainable money movement, bank payouts clear provider balances including fees, AR/AP equal open subledgers, VAT reports reconcile to ledger accounts, every voucher has provenance and locked periods remain intact.

Fortnox becomes optional rather than the reason the subsystem exists.

---

## 17. Failure and safety rules

Do not:

- auto-correct Handymate from Fortnox when a comparison fails;
- auto-correct Fortnox from Handymate merely to make shadow green;
- use monetary tolerances to suppress differences;
- count S1 comparisons as S2 evidence;
- treat missing/stale reference data as a true match;
- mutate posted journal history to resolve a divergence;
- close a divergence without resolution provenance;
- allow an AI agent to mark an accounting-sensitive divergence as accepted without required review;
- use one aggregate accuracy score to hide a critical VAT/AR/AP failure;
- switch system of record without the readiness gate and explicit approval;
- delete shadow history after migration.

---

## 18. Required tests

Add subsystem tests covering at least:

1. identical canonical/reference snapshots -> match;
2. exact amount mismatch -> divergence;
3. wrong account with equal voucher total -> posting-account divergence;
4. reference not yet available -> pending, not divergence;
5. pending reference later arrives and matches;
6. pending reference exceeds configured lag -> divergence;
7. repeated comparison retry is idempotent;
8. repeated same mismatch updates one divergence lifecycle;
9. S1 result is excluded from S2 readiness metrics;
10. phase flip is dated/auditable per business;
11. nightly reconciliation finds an object missed by event-driven verification;
12. aggregate AR detects a missing invoice even if linked compared invoices match;
13. VAT period mismatch blocks readiness;
14. critical divergence blocks migration action;
15. resolved divergence retains immutable history and regression reference;
16. accepted reference-system exception requires reason/permission;
17. readiness evidence is versioned and persisted;
18. after Fortnox removal, internal Financial Integrity checks continue operating.

---

## 19. Implementation ownership

This subsystem belongs to the Financial Kernel / accounting reliability architecture, not to the Fortnox integration itself.

Fortnox owns only the reference adapter.

```text
Financial Kernel
  shadow snapshot schemas
  comparison engine
  divergence lifecycle
  readiness engine
  integrity engine

Fortnox integration
  fetch external state
  normalize into reference snapshots
  preserve external provenance
```

---

## 20. Definition of done — automated shadow platform

Shadow Accounting is not considered implemented merely because a script can print two balances.

Minimum definition of done:

- canonical versioned reference snapshots;
- S1/S2 evidence separation;
- deterministic multi-level comparison engine;
- no silent monetary tolerances;
- durable comparison runs/results;
- divergence taxonomy + severity;
- auditable divergence lifecycle/resolution;
- event-triggered checks;
- eventual-consistency retry policy;
- scheduled full reconciliation;
- AR/AP/VAT/ledger/bank aggregate checks for enabled scope;
- automated per-business readiness metrics;
- migration-readiness gate;
- professional approval workflow/evidence;
- regression conversion for discovered real-world edge cases;
- continued operation as Financial Integrity Engine after Fortnox cut-over.

> **Final rule:** Shadow Accounting is an automated evidence system, not a confidence ritual. Handymate earns the right to become system of record by independently deriving financial truth, continuously comparing it, explaining every difference and proving readiness with persisted evidence.

---

## 21. External dependencies — what the comparison ladder actually needs

> Added 2026-09-12 after checking this document against the Fortnox integration as it
> exists in the tree. Nothing below changes the architecture. It records which parts are
> reachable today, which are not, and what it would cost to reach them — so that Sprint 6
> does not discover it.

### 21.1 The comparison ladder is scope-gated, and only Level 1 is reachable

`app/api/integrations/fortnox/connect/route.ts` requests exactly four OAuth scopes:

```text
FORTNOX_SCOPES = 'invoice customer companyinformation supplierinvoice'
```

Mapping that against §6:

| Level | Needs | Status today |
|---|---|---|
| 1 — object equality | `invoice`, `supplierinvoice` | **reachable** |
| 2 — ledger equality (vouchers, accounts, VAT codes) | `bookkeeping` | **not granted** |
| 3 — aggregate equality (AR/AP/bank/clearing/VAT/result) | `bookkeeping` | **not granted** |
| 4 — statutory/report outcome (VAT return, trial balance) | `bookkeeping` | **not granted** |

The `bookkeeping` scope was **deliberately removed on 2026-06-03**. The reason is recorded
in the same file and it is commercial, not technical:

> *"9 av 12 scopes var oanvända; slimning sparar Christoffer licens-pengar (Fortnox kräver
> 'Offert & order' / 'Tidredovisning'-licenser för respektive scope)"*

and the strategy line above it reads:

> *"Handymate äger arbetet, Fortnox äger bokföringen."*

That is the opposite premise from Levels 2–4, which require reading Fortnox's bookkeeping.
`lib/fortnox.ts` carries the consequence as two `@deprecated` functions —
`bookFortnoxInvoice` (needs `bookkeeping`) and `registerFortnoxPayment` (needs `payment`) —
both annotated *"Lägg tillbaka scope + kräv re-OAuth innan användning."*

In practice the integration today calls `POST /invoices`, `GET /invoices/{id}` for the
`Balance` field, the customer endpoints, `/invoicepayments` and the supplier-invoice pull.
Nothing voucher- or account-level.

### 21.2 Re-adding the scope is a customer migration, not a code change

Precedent is in the tree. `supplierinvoice` was added on 2026-08-19, and
`app/api/integrations/fortnox/connect/route.ts` records what followed:

> *"REDAN ANSLUTNA konton saknar detta scope på sin nuvarande token och måste ÅTERANSLUTA
> (göra om OAuth)."*

A missing scope surfaces as a bare 403 (`lib/fortnox/import-supplier-invoices.ts`), which
the sync cron now reports explicitly. So adding `bookkeeping` means every connected pilot
business re-authorises, and until they do, their shadow comparison silently caps at Level 1.

### 21.3 Three different things are called "licens" here

An earlier draft of this section ran them together. They are separate, and only one of them
is an open blocker.

| | What it is | Status |
|---|---|---|
| Developer registration | Lets Handymate build the integration and run OAuth at all | **Held.** Not a constraint. |
| Customer Fortnox modules | `connect/route.ts` notes that *"Fortnox kräver 'Offert & order' / 'Tidredovisning'-licenser för respektive scope"* — modules the **customer** subscribes to. A customer without "Offert & order" cannot grant the `offer` scope regardless of what Handymate holds. | Real, and the stated reason the June slimming *"sparar Christoffer licens-pengar"*. |
| Fortnox partner status | `tasks/fortnox-license-blocker.md`: *"Externt blockerande: Fortnox-konto/partner-status hos oss"*, with action item *"Fråga vilket licens/partner-program vi behöver"* | **Open since 2026-05-30.** |

**Whether `bookkeeping` carries a customer module cost is unknown.** The comment's examples
are `offer` and time reporting; bookkeeping is Fortnox's core product and plausibly sits in
every plan. Do not assume either way — it is exactly action item 4 in the blocker file,
*"Identifiera vilka scopes som specifikt kräver licens"*, and it should be answered before
option 1 is costed.

What is certain about `bookkeeping` is the re-OAuth requirement above. The partner-status
blocker is separate from the scope question and blocks Fortnox connections for new
customers regardless of which shadow option is chosen.

### 21.4 Bank and clearing data exists on neither side

§6 Level 3 and §13's gate both require bank and clearing reconciliation. There is no bank
integration and no `bank_accounts` / `bank_transactions` table in the schema, and the
slimmed Fortnox grant exposes no bank data either. Those dimensions are unsupported on both
sides of the comparison until the kernel's own bank/reconciliation work (parent §17,
orchestration Package C11) exists.

### 21.5 Consequence for §13's readiness gate

The gate as written requires `VAT/report comparison = 100%` and
`Bank / clearing reconciliation = 100%`, and §6 makes it **binding** that readiness cannot
rest on object-level matches alone. With the current grant, none of those three can be
satisfied. **The gate therefore cannot go green today** — not because a business is
unready, but because the evidence is unobtainable.

That is the right failure direction: a gate that cannot be satisfied blocks migration,
which is safer than one that passes on thin evidence. But it must be a known state rather
than a surprise, because the predictable failure mode is that someone loosens the gate
under schedule pressure.

Three ways forward, and the choice is the owner's, not an implementer's:

1. **Re-add `bookkeeping` and run the re-OAuth migration.** Full ladder, at the cost of a
   customer-facing reauthorisation and the licence question from §21.2.
2. **Ship S2 at Level 1 only, with the gate explicitly reduced and the reduction recorded**
   as an accepted limitation with the dimensions marked unsupported per §6 — using the
   mechanism §14 already provides for recording which regimes were exercised.
3. **Defer S2 until the kernel's own integrity engine can substitute for the external
   reference** at Levels 2–4 (§16), comparing Handymate against itself rather than against
   Fortnox.

Option 2 is the only one that is reachable without external dependencies, and it is
compatible with this document provided the reduction is written down rather than assumed.

### 21.6 Decision 2026-09-12 — option 2, with the VAT gap covered elsewhere

**Chosen: run S2 at Level 1, with §13's gate explicitly reduced and the unsupported
dimensions recorded per §6 and §14.** Option 3 is the direction of travel; option 1 only if
a pilot business or its accountant requires voucher-level evidence, and not while the
Fortnox licence blocker is open.

What that means concretely:

- Level 1 comparison runs on real pilot traffic: invoice, supplier invoice, payment,
  customer balance, supplier balance. That is reachable with the current grant and touches
  no customer connection.
- `bookkeeping` is **not** requested. No re-OAuth, no added licence cost for pilot
  businesses.
- Levels 2, 3 and 4 are persisted as `unsupported` with the reason, not as absent or as
  passing. §13's gate is reduced to the dimensions actually obtainable, and the reduction
  is recorded as an accepted limitation with an owner and a date — never inferred from a
  green Level 1 run.

**The known weakness, stated plainly:** VAT and voucher-level accounting get the least
external evidence under this option, and that is exactly where the two segment-blocking
gaps sit — reverse-charge construction VAT and cash-basis accounting
(`FINANCIAL_KERNEL_ARCHITECTURE.md` §15.1, §15.2). Shadow Level 1 cannot cover them.

The compensating measure is therefore **not optional** under this decision: the manual
rulebook track in `../HANDYMATE_ACCOUNTING_ROADMAP.md` §21.2 — taking a handful of pilot
companies' running bookkeeping by hand — is what produces the VAT evidence the shadow
cannot. Choosing option 2 without running that track leaves the highest-risk area with no
verification at all.

### 21.7 Loose end

`tasks/fortnox-scope-audit.md` is cited by three separate code comments as the authority
for the scope decision. **The file is not in the repository.** The reasoning behind the
current grant therefore exists only in those comments. Worth restoring or replacing before
anyone revisits the scope question.

---
