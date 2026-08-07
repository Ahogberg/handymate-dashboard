# Handymate Architecture Council — Priority Proposal (Codex)

**Round 1: Independent Product & Engineering Priority Review**  
**Date:** 2026-08-07  
**Reviewer:** Principal Engineering Reviewer (Codex)  
**Scope:** Repository and strategy review only. No product or production-code changes were made.

## Review basis and confidence

This proposal treats the checked-out `main` branch as the source of truth for what is built, while distinguishing four different claims:

- **Present:** a table, route, component, or helper exists.
- **Wired:** a real runtime path calls it.
- **Verified:** the path has automated or manual evidence that it works.
- **Live:** it is confirmed in production with real customer use.

Those are not interchangeable in this repository. Several internal documents correctly warn that “deployed” has repeatedly not meant “working.” Where production state cannot be observed from the repository, this review says so.

Primary material inspected included `CLAUDE.md`, `README.md`, `ARCHITECTURE.md`, the Handymate Claude skill references, `handymate_full_kartlaggning_och_genomforandeplan.md`, `handymate_moat_strategy_and_innovation_roadmap.md`, recent commit history, current dirty-worktree state, relevant `tasks/` plans, all major application and library domains named in the council brief, SQL migrations, cron configuration, and test/package configuration. The most relevant recent commits are Karin V1 (`665f5907`, `25d57d62`, `fcb24232`), AI decision metadata (`9daf9170`), and nightly missed-revenue detection (`e3b1cef6`). Karin V1 is treated as in progress.

---

## 1. Executive conclusion

### What Handymate should focus on after Karin V1

Handymate should not build the next large named moat immediately. It should spend the next 90 days closing a **Money Loop Reliability** program:

1. make money-critical lifecycle transitions durable and traceable;
2. turn the existing missed-revenue detector into an approved, measurable path from finding to paid invoice;
3. connect existing project evidence to invoice readiness;
4. make Offer-to-Reality data reliable enough to improve future quotes; and
5. converge existing approval, automation, and AI metadata into a thin action/outcome record rather than adding another disconnected agent system.

This is not infrastructure for infrastructure’s sake. It directly supports the commercial promise a Swedish trade-business owner understands: **find work already performed, get it invoiced correctly, and show when the money was paid.** It also creates the minimum trustworthy data Handymate needs before Project Autopilot, Decision Replay, Economic Copilot, or Outcome Graph can be more than attractive UI over uncertain facts.

The repository already contains more of the visible product than the strategy documents imply: a broad golden path, six agent personas, approval-gated actions, earned autonomy for four low-risk action types, project economics, outcome freezing, quote feedback, scheduling assistance, payment reconciliation paths, evidence capture, and three missed-revenue rules. The next problem is not feature absence. It is that the same business event is represented differently across routes, some transitions are best-effort, core entity lineage is incomplete, and “pending approval” is serving simultaneously as approval queue, notification feed, reminder store, report inbox, and agent-action envelope.

Two current defects illustrate the risk:

- project completion marks signed ÄTA rows `status = 'invoiced'` without setting `invoice_id` or `invoiced_at`, while missed-revenue detection treats a null `invoiced_at` as not invoiced; this can create false recovery alerts;
- auto-send creates an invoice with status `sent` before delivery is confirmed, does not require a customer email, and does not check the internal send response. The system can therefore state “sent” when no send occurred.

Those are not edge cases around a future moat. They corrupt the facts on which Revenue Recovery, Karin, project economics, autonomy, and customer trust depend.

The recommended architectural move is deliberately small: a **durable lifecycle journal plus outbox for a limited set of money-critical transitions**, canonical entity references, and an evolutionary action/outcome record built around existing systems. Do not build Kafka, a generic event platform, a graph database, a policy DSL, or a duplicate blob store.

Karin should eventually become Handymate’s economic controller: a trusted view of obligations, cash, receivables, project margins, recurring costs, and proposed actions. Karin should feed Today/Jarvis, Revenue Recovery, owner notifications, project economics, and earned-autonomy policies. But Karin cannot safely become that controller until financial sources have provenance, obligation fulfillment is distinct from acknowledgement, and invoice/payment transitions are reliable. Fortnox is a valuable future source, but the current integration remains license/scope blocked and is not yet a dependable supplier-invoice, tax, or bookkeeping feed.

The council should therefore approve a customer-facing money loop, not another umbrella concept:

> **Completed or evidenced work → invoice-ready finding → human-approved action → sent invoice → reconciled payment → measured recovered revenue.**

That sequence creates 90-day value and the first credible substrate for the longer-term moat.

---

## 2. Current-state reality check

### 2.1 Repository shape

The application is a large Next.js 14/Supabase monolith with roughly 750 tracked `app/` files, 300+ `lib/` files, 230+ SQL files, about 100 components, 15 agent-domain files/directories, and 108 Playwright spec files. The SQL history declares approximately 169 distinct table names. This breadth is a strength for product coverage and a warning for schema and runtime coherence.

The repository has no tracked GitHub Actions workflow. `package.json` exposes `dev`, `build`, `start`, and a stale `next lint` command, but no `test` or `typecheck` script. The project has many facit tests, yet the repository does not itself enforce a repeatable CI gate. SQL migrations are conventionally run manually. Consequently, code in `main`, production schema, and actual runtime can diverge.

`vercel.json` currently declares 36 cron schedules, including multiple 15-minute and two-hour jobs. `CLAUDE.md` warns that sub-daily crons fail on Vercel Hobby. The actual Vercel plan is not visible in the repository, so this is a material deployment uncertainty rather than a definite production defect.

### 2.2 What actually exists by domain

| Domain | Repository reality | Principal-engineering assessment |
|---|---|---|
| Agents | Matte plus Karin, Daniel, Lars, Hanna and Lisa; shared tool router/definitions; runs, threads, handoffs, memories, observations, kill switch and cost controls | Broad and genuinely wired, but not six independent autonomous workers. Model calls and decision metadata remain fragmented. |
| Projects | Project creation from lead, quote and booking; stages, health, time, materials, photos, forms, changes/ÄTA, work orders, completion, reports and economics | Feature-rich. Completion side effects differ by route and are not transactional. |
| Customers | CRM, contacts, portal, documents, communications, warranties, reactivation, LTV and quiet-customer logic | Substantial substrate for retention and a future homeowner/property view, but no canonical property/twin entity. |
| Quotes | Unified document experience, templates/product bank, AI/photo assistance, tracking, signing, follow-up, price feedback and quote-to-project paths | One of the strongest product areas. Production golden-path verification is still weaker than code breadth. |
| Invoices and payments | Invoice creation/edit/send, ROT/RUT, reminders, claim-paid confirmation, manual and Fortnox payment application, auto-invoice on completion | Commercially central, but status semantics and delivery confirmation need hardening before autonomy. |
| Fortnox | OAuth, customer/open-invoice import, invoice/customer sync, payment polling, API logs and two overlapping route namespaces | Built but externally license/scope blocked for the pilot. Tokens are stored in `business_config`; API-log retention is documented but no cleanup implementation was found. Not yet a trusted full financial feed. |
| Financial data | Invoice/quote metrics, overdue data, cash radar, profitability, project economics, monthly review, recurring-cost-adjacent settings and Karin calendar profile | Useful derived views, not an accounting ledger. Supplier invoices, tax amounts, bank cash and recurring obligations are not unified. |
| Lifecycle events | `fireEvent()` and rule matching for lead, quote, project, invoice, payment, communication and ÄTA events | Runtime dispatcher, not a registry. Events are not durably recorded, versioned, replayable or delivered through an outbox. Names already drift (`lead_received` and `lead_created`). |
| Notifications | Push subscriptions, approval pushes, portal email notifications, SMS and Today/Jarvis surfaces | Real and broad. Delivery/audit semantics differ per channel. Informational items are often stored as pending approvals. |
| Audit logs | `v3_automation_logs`, `agent_runs`, approval payload execution outcomes, automation activity, customer activity, Fortnox logs and domain histories | Many partial logs; no universal actor/action/evidence/result/outcome chain. Auditability is fragmented by execution path. |
| AI actions | Tool definitions/router, action executor, approval handlers, risk levels, four-type earned autonomy, partial `_decision` metadata | Strong gating foundation. `_decision` currently covers only a few paths and is not Decision Replay. |
| Scheduling | Booking and schedule-entry union, availability, time off, skills/specialties, certificates, conflicts, capacity and suggestions | Valuable assistant, not a constraint solver. Warnings are non-blocking; location is approximate; travel, dependencies, materials, vehicles, rest rules and weather are absent. |
| Project economics | Canonical `computeProjectEconomics`, quote/actual hours and materials, ÄTA, invoice totals, completeness, `project_outcome`, pricing feedback | Strong early Offer-to-Reality loop. Outcome freezing is best-effort and can silently fail; lineage and completeness limit trust. |
| Company Model | `business_config`, preferences, pricing/product bank, learned preferences, agent context, schedule settings, company profile, automation settings and historical outcomes | The facts exist, but as fragments with different provenance and freshness. There is no canonical Company Model contract. |

### 2.3 Important strengths to preserve

1. **Swedish trade depth is real.** ROT/RUT, ÄTA, Fortnox paths, project economics, product/pricing data, tax-calendar rules, evidence and customer communication are more defensible than generic agent personas.
2. **Human approval is already a first-class interaction.** The queue, execution routes, risk labels, routing, push notifications and earned autonomy are a meaningful base.
3. **Offer-to-Reality is more than a concept.** `project_outcome` freezes quoted and actual hours/materials/ÄTA/invoice/margin measures, and pricing analysis consumes historical outcomes.
4. **Revenue Recovery has a credible starting wedge.** The nightly sweep detects signed-but-uninvoiced ÄTA, uninvoiced materials on completed projects, and completed projects without invoices. Existing outbound attribution can associate some accepted quotes, payments and bookings with prior actions.
5. **Karin V1 uses a deterministic rules engine.** Rules include version, legal basis, source URL and confidence, and the calendar fails closed on missing profile facts. The repository includes substantial date/rule tests.

### 2.4 Material risks found

| Risk | Evidence in current code | Why it matters |
|---|---|---|
| False missed-revenue findings | `lib/projects/auto-invoice-on-complete.ts` updates only ÄTA `status`; `lib/value/missed-revenue.ts` checks `invoiced_at` | Destroys trust in the highest-value near-term feature and can encourage duplicate billing. |
| Invoice delivery state can lie | Auto-invoice creates `sent` before the send call, skips sending without email, swallows fetch errors and does not inspect `response.ok` | Revenue, reminders, customer communication and outcomes operate on a false state. |
| Completion is not one atomic business transition | Project and booking completion routes fire different side effects and order them differently; key writes are best-effort | Lost or duplicated invoice/outcome/automation work is difficult to detect and replay. |
| Cross-tenant manual report path | `POST /api/cron/monthly-review` accepts authenticated `body.business_id` and uses service-role access without checking it equals the caller’s business | A concrete tenant-isolation vulnerability; service-role architecture makes route checks the security boundary. |
| Cron authentication is inconsistent | `/api/cron/fortnox-sync` authenticates only when `CRON_SECRET` is set; other routes implement their own checks | A missing environment variable can make privileged work fail open. |
| Core lineage is incomplete | Some quote/deal and booking/project FKs exist; invoice `project_id` was added without a FK; deal/customer migration status is uncertain | Outcome Graph, dedupe, deletion, backfills and reliable joins all depend on stable lineage. |
| Approval semantics are overloaded | Reports, reminders, alerts, proposed actions and executable actions share `pending_approvals` and `status = pending` | Approval rates, autonomy, routing and audit interpretation become ambiguous. |
| Decision records are sparse | `_decision` stores model, prompt key/version, input hash and timestamp in only a few paths | Useful freshness metadata, but insufficient for evidence, policy, approval, replay or outcome attribution. |
| Fortnox is not production-proven as a broad finance source | License blocker, limited scopes, duplicate route families, manual migration history | Karin cannot infer cash, supplier obligations or taxes from Fortnox reliably yet. |
| Release truth is manual | No tracked CI, no test/typecheck scripts, manual SQL migrations, documented “built not live” gaps | Every new autonomous path multiplies undetected regression and schema-drift risk. |

### 2.5 “Exists” versus “works” conclusion

The architecture is not missing an agent framework, dashboard framework, CRM, quote engine, scheduling UI or analytics surface. It is missing a reliable shared account of **what happened, to which entities, because of which approved action, with what evidence, and whether money resulted**. That is the limiting factor for the next generation.

---

## 3. Strategic-document reconciliation

### 3.1 Already done or materially delivered

The following strategy items should no longer be described as greenfield:

- **Offer-to-Reality foundation:** project outcomes, quote-versus-actual measures, completeness and pricing feedback exist.
- **Basic project profitability:** revenue/cost/margin calculations and warnings exist, though input completeness varies.
- **Approval-gated autonomous operations:** actions, risk levels, routing, execution and four-type earned autonomy exist.
- **Revenue Recovery detection:** three nightly missed-revenue rules now exist.
- **Outbound outcome attribution:** some prior quote-nudge/SMS actions can be attributed to later accepted quotes, paid invoices or bookings.
- **Project Autopilot components:** project health, next actions, stage automation, dispatch suggestions, checklists and an `autopilot_package` approval type exist. They are not one dependable autopilot.
- **Evidence capture:** project photos, field-report photos, form photos/signatures, documents, customer messages, time entries and materials exist in multiple stores.
- **Computer-vision quality control:** self-inspection photo assessment against checklist points is wired into the queue.
- **Company context:** preferences, agent context, learned patterns, pricing/product data and company profile already influence behavior.
- **Swedish economic foundation:** invoice reminders, ROT/RUT, overdue monitoring, monthly review and Karin’s company-calendar rules exist.

### 3.2 Partially implemented

| Strategy concept | Partial implementation | Missing before the strategic claim is credible |
|---|---|---|
| Decision Replay | `_decision` metadata with model, prompt key/version, input hash and timestamp | Actual input/evidence references, rendered prompt/version snapshot, policy, user response, execution result, final outcome and replay tooling. |
| Common AI/model gateway | Several shared callers and a central model selector coexist with direct Anthropic calls in roughly 35 application/library files | One instrumented path for consequential calls, common timeout/retry/cost/decision metadata and evaluation hooks. Migrate incrementally with Action Ledger; do not stop feature delivery for a big-bang rewrite. |
| Company Model | Business config/profile, preferences, agent context, learned preferences, pricing, automation and outcome fragments | Fact-level source, confidence, effective time, freshness, ownership, version history and one read contract. |
| Evidence-to-Payment | Evidence capture plus invoices/project links | Evidence index, scope/line linkage, invoice-readiness rules, approved bundle and immutable invoice reference. |
| Economic Copilot | Karin, cash radar, monthly review, invoice reminders, profitability and project economics | Trusted cash/source data, obligations with amounts and fulfillment proof, supplier invoices, forecasts and action-outcome learning. |
| Constraint-aware scheduling | Skills, conflicts, absence, capacity, certificates and rough proximity | Hard/soft constraint model, travel times, dependencies, materials, vehicle/tool constraints, labor rules and explainable optimization. |
| Margin/risk intelligence | Profitability warnings, outcome deltas and price analysis | Sufficient complete historical observations, calibrated risk models and clear separation from regulated insurance claims. |
| Trade Packs | Industry-specific article/product defaults, forms and rules | Versioned installable pack contract, upgrade behavior, outcome evidence and enough customers to validate transferability. |

### 3.3 Obsolete or superseded roadmap wording

- **“Build a generic agent framework” is obsolete.** A framework and shared tool router exist. The work is to make actions and decisions consistent and testable.
- **“Build project economics” is superseded by “make economics complete and reliable.”** Another calculator would create drift.
- **“Build Revenue Recovery detection” is superseded by “close and measure the loop.”** Detection alone creates cards, not cash.
- **“Build an event bus now” is too broad.** A small durable journal/outbox for high-value lifecycle transitions is sufficient at current scale.
- **“Build a separate evidence store” is misleading.** Blobs and domain records already exist; Handymate needs a metadata index and links, not duplicate storage.
- **“Launch more autonomous agents” is premature.** More personas would increase policy, audit, cost and consistency surface without fixing the shared substrate.
- **“Outcome Graph next” is superseded by “canonical lineage and outcome facts first.”** A graph UI or graph database cannot repair missing IDs or unreliable transitions.
- **“Karin as a generic financial chatbot” should be rejected.** Deterministic obligations and auditable money actions are the defensible direction.

### 3.4 Still valid

- Put measurable customer outcomes ahead of generic AI capability.
- Make approval, evidence, policy and auditability common across agent actions.
- Use Offer-to-Reality learning to improve quote accuracy and margins.
- Make Revenue Recovery the near-term commercial wedge.
- Build Company Model as a shared context, not a new CRM settings page.
- Let autonomy be earned per action type and reversible.
- Create Decision Replay and Outcome Graph only from stable underlying records.
- Prefer per-company learning before claiming a cross-company network moat.

### 3.5 Missing or understated in the strategy

1. **Production truth management:** migration state, release gates, cron viability and end-to-end pilot verification are prerequisites, not hygiene footnotes.
2. **Money-state semantics:** `draft`, `ready`, `sent`, `delivered`, `failed`, `partially_paid`, `paid` and `void` need explicit transition rules.
3. **Entity lineage:** lead/deal/quote/project/booking/invoice/ÄTA/action/outcome references must be durable before a graph or genome.
4. **Replayable side effects:** high-value completion and payment paths need idempotency, retry and reconciliation.
5. **Notification versus approval:** a deadline reminder is not a proposed decision, and an acknowledgement is not legal or financial fulfillment.
6. **Operational data quality:** outcome completeness and source provenance should gate AI advice and autonomy.
7. **Pilot evidence:** with effectively one pilot and several “built, not live” capabilities, adoption and data capture compound moat faster than speculative feature breadth.

---

## 4. Critical platform primitives

### 4.1 Recommendation summary

| Primitive | What exists | What is duplicated/missing | Recommendation |
|---|---|---|---|
| Lifecycle Event Registry | `fireEvent()`, automation rules/logs, domain status histories and direct route side effects | No durable event fact, contract version, idempotency key, correlation, replay, consumer state or dead-letter path; event names drift | **BUILD NOW, narrowly.** Append-only journal and outbox for money-critical transitions only. Keep the current dispatcher as a consumer during migration. |
| Action Ledger | Pending approvals, automation logs, agent runs, scheduled actions, execution outcomes in payloads | Actor/reason/evidence/policy/approval/execution/result spread across stores; informational cards contaminate action history | **BUILD NOW, evolutionarily.** Introduce a canonical action record/envelope and adapters; do not big-bang replace existing tables. |
| Outcome Store | `project_outcome`, recovered-revenue attribution, agent metrics and analytics | Outcomes are domain-specific; no common action→business-outcome link or confidence/attribution method | **BUILD NEXT, scoped to money.** Start with revenue identified, invoiced, sent, paid, time-to-invoice and margin delta. Do not create a general graph. |
| Decision Store | Sparse `_decision` metadata and agent run/message history | No persisted evidence set, input snapshot, policy, user response, final action or outcome; only a few call sites | **BUILD WITH ACTION LEDGER.** Store decision metadata on consequential proposed actions. Full replay UI later. |
| Evidence Store | Photos, reports, forms, documents, messages, calls, time, materials and signatures | Multiple schemas and storage references; weak link from evidence to scope/ÄTA/invoice/action | **BUILD NEXT AS AN INDEX.** Reference existing records and blobs; avoid copying content. |
| Policy Engine | Hard-coded allowlist, risk levels, approval requirements, quotas, night restrictions, kill switch, role routing and earned-autonomy state | Policy logic distributed across engine, crons and approval routes; no consistent evaluated-policy record | **UNIFY NEXT; no DSL yet.** One code-level policy evaluator and versioned decision result are enough. |
| Entity lineage | Partial foreign keys and many textual IDs | Missing/uncertain core FKs, no lifecycle/correlation ID, historical orphans possible | **BUILD NOW.** Validate/backfill first; add constraints only after measuring failures. |
| Company Model | Many authoritative and derived company facts across configs, preferences, memories and analytics | Source, freshness and effective time vary; prompt consumers assemble context independently | **BUILD NEXT AS A CONTRACT/READ MODEL.** Do not create a giant mutable table. |

### 4.2 Minimum lifecycle journal contract

The useful primitive is not a generic event-streaming platform. It is a durable fact for a small event set:

`event_id`, `event_name`, `schema_version`, `business_id`, `occurred_at`, `recorded_at`, `actor_type`, `actor_id`, `source`, `correlation_id`, `causation_id`, `idempotency_key`, canonical entity references, and a minimal payload.

Initial events should be limited to:

- `quote.sent`, `quote.accepted`;
- `project.completed`;
- `ata.approved`, `ata.invoiced`;
- `invoice.created`, `invoice.delivery_confirmed`, `invoice.delivery_failed`;
- `invoice.paid`;
- `action.approved`, `action.executed`, `action.failed`.

Lead/contact/schedule events can remain on the current dispatcher until a consumer requires durability. This avoids turning a data-integrity fix into an event-platform project.

The transition and its outbox record should be committed together where possible. A worker may then invoke current automations, outcome freezing, agents and notifications with retry and idempotency. A reconciliation job must detect source records whose required event/side effect is missing.

### 4.3 Minimum action/decision record

For financially or externally consequential actions, persist:

- proposed action type and target entities;
- proposer: user, rule, agent and run/model identifiers;
- reason and structured evidence references;
- confidence and known data-completeness level;
- evaluated policy version/result and required approver role;
- proposed payload hash and final approved payload hash;
- approval/rejection/edit actor and timestamp;
- execution attempts, external idempotency key, result and error;
- rollback/compensation capability, if one exists;
- business outcomes linked later.

This can coexist with `pending_approvals`, `v3_automation_logs` and `agent_runs`. The first goal is one consistent record for new high-value paths, plus stable references from the existing rows. Rewriting every historical approval type would be disproportionate.

### 4.4 Outcome facts before an Outcome Graph

Create a small vocabulary of observable facts, not an ontology:

- money identified as potentially recoverable;
- finding dismissed and reason;
- approved invoice amount;
- invoice created/sent/delivered;
- payment received and source;
- days from work completion to invoice and payment;
- quoted versus actual gross margin with completeness;
- promise fulfilled/late, when that feature exists.

Attribution must state whether it is **direct**, **rule-based**, or **inferred**. “Recovered revenue” should mean paid money with a defensible link to the Handymate action, not a card amount or an invoice draft.

### 4.5 What should not be built as a primitive yet

- no Kafka, separate event service, event sourcing rewrite or general workflow language;
- no graph database;
- no vector database as the default Company Model;
- no duplicate evidence blob repository;
- no universal policy DSL or customer-authored code;
- no attempt to normalize all 169 historical tables in one program;
- no global “autonomy level” detached from action type, risk and observed history.

---

## 5. Ranked top 10 next epics

### 5.1 Scoring method

All component scores are 1–10. Complexity is scored **1 = easy, 10 = hard** and subtracted.

`Weighted score = 0.25 Customer value + 0.20 Revenue/retention + 0.20 Moat + 0.15 Future unlock + 0.10 Technical-risk reduction − 0.10 Complexity`

The positive-weight ceiling is 9.0 before the complexity penalty (the strict achievable maximum is 8.9 because complexity starts at 1). The percentage shown is `score / 9.0` for readability. Scores rank expected value; they do not override dependency order, security stop-the-line findings, or external blockers.

| Rank | Epic | Customer | Revenue | Moat | Unlock | Risk reduction | Complexity | Weighted | Recommendation |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 1 | Close the Revenue Recovery loop | 10 | 10 | 8 | 8 | 7 | 6 | **7.40 / 9 (82%)** | BUILD NOW |
| 2 | Durable money lifecycle spine and entity lineage | 8 | 9 | 9 | 10 | 10 | 8 | **7.30 / 9 (81%)** | BUILD NOW |
| 3 | Evidence-to-invoice readiness | 9 | 9 | 8 | 8 | 7 | 6 | **6.95 / 9 (77%)** | BUILD NOW |
| 4 | Offer-to-Reality reliability and quote feedback | 8 | 8 | 9 | 9 | 8 | 6 | **6.95 / 9 (77%)** | BUILD NEXT |
| 5 | Thin Action + Decision Ledger | 7 | 7 | 9 | 10 | 9 | 8 | **6.55 / 9 (73%)** | BUILD NOW, scoped |
| 6 | Tenant, cron, migration and release truth gate | 8 | 8 | 5 | 9 | 10 | 4 | **6.55 / 9 (73%)** | BUILD NOW / stop-the-line |
| 7 | Fortnox pilot-grade financial synchronization | 9 | 8 | 7 | 9 | 8 | 9 | **6.50 / 9 (72%)** | BUILD NEXT, externally gated |
| 8 | Karin V2: obligation fulfillment and cash-action layer | 8 | 7 | 7 | 8 | 8 | 6 | **6.20 / 9 (69%)** | BUILD NEXT after V1 validation |
| 9 | Company Model contract and trusted read model | 6 | 6 | 9 | 10 | 7 | 7 | **6.00 / 9 (67%)** | BUILD NEXT, incremental |
| 10 | Unified earned-autonomy policy evaluator | 6 | 6 | 8 | 9 | 9 | 7 | **5.85 / 9 (65%)** | BUILD NEXT after ledger |

Ranks 1 and 2 are effectively one program: the lifecycle spine must precede autonomous recovery execution even though the customer-facing recovery loop has the slightly higher score.

### 5.2 Epic definitions

#### Rank 1 — Close the Revenue Recovery loop

**Why now:** Detection exists, but the new cards cannot yet reliably become invoices or prove paid recovery. False ÄTA positives are possible. This is Handymate’s clearest near-term paid-value story.

**Customer impact:** fewer forgotten ÄTA/materials/projects, fewer manual searches, faster invoicing, improved cash flow.  
**Revenue impact:** supports premium pricing and retention with a visible “Handymate found and recovered X kr” result.  
**Moat impact:** accumulates per-company examples of leakage, decisions and outcomes rather than generic chat history.  
**Dependencies:** correct invoice/ÄTA semantics; lifecycle events; canonical project/invoice/action references; approval execution; payment reconciliation.  
**Complexity:** medium. Existing rules and invoice paths reduce product work; correctness and idempotency create the real complexity.  
**Risk:** duplicate invoices, false claims of recovery, staff alert fatigue, and incorrect attribution.

**Definition of done:**

- the three current finding types have tested false-positive and duplicate-prevention rules;
- signed ÄTA invoicing sets one consistent status, `invoice_id` and `invoiced_at` atomically with invoice creation;
- every finding can be dismissed with a structured reason or approved into an invoice draft through an existing safe path;
- the action chain exposes `identified → approved/dismissed → invoice_created → delivery_confirmed/failed → paid`;
- recovered revenue is counted only at a clearly defined outcome, preferably paid, and attribution method is visible;
- reconciliation catches lost side effects; retry is idempotent;
- pilot scenarios for ÄTA, material and whole-project leakage are run end to end.

#### Rank 2 — Durable money lifecycle spine and entity lineage

**Why now:** The automation dispatcher is useful but ephemeral. Project completion, invoice, payment, outcomes and agent triggers can diverge without a durable record or replay path.

**Customer impact:** fewer missing invoices, duplicate actions and unexplained states.  
**Revenue impact:** protects billing and payment flows while enabling recovery features.  
**Moat impact:** produces the trustworthy historical sequence required by Decision Replay, Outcome Graph and Job Genome.  
**Dependencies:** source-table transition rules, migration/backfill analysis and idempotency design.  
**Complexity:** high if generalized; manageable if restricted to the initial 10–12 event types.  
**Risk:** dual-write drift and a premature platform rewrite.

**Definition of done:**

- canonical lineage is measured and backfilled for lead/deal/quote/project/booking/ÄTA/invoice where safely inferable;
- the initial money-event contract is versioned and documented;
- transition plus outbox write is atomic on selected paths;
- consumers retry safely and record success/failure;
- a reconciliation report finds source records missing required lifecycle facts;
- existing `fireEvent()` rules keep working through an adapter;
- no generic event-service extraction or all-domain migration is included.

#### Rank 3 — Evidence-to-invoice readiness

**Why now:** Handymate already captures the raw evidence. A small index and readiness check can convert that investment into fewer disputes and faster invoices without building a broad Evidence Store.

**Customer impact:** a foreman/owner can see what is missing before invoice or completion: time, material, signed ÄTA, completion proof, customer approval.  
**Revenue impact:** fewer omitted chargeable items and shorter time to invoice.  
**Moat impact:** links work evidence to commercial outcomes and creates higher-quality outcome data.  
**Dependencies:** canonical entity references; existing evidence permissions; invoice-line/scope mapping; lifecycle journal.  
**Complexity:** medium.  
**Risk:** implying evidence is legally sufficient when it is only operationally useful; exposing customer/private media.

**Definition of done:**

- an evidence reference contract indexes existing photos, reports, messages, signatures, time and materials without copying blobs;
- each reference records business, source, actor, timestamp, target project/ÄTA/scope and access classification;
- invoice-readiness rules are deterministic and explainable;
- missing evidence creates a warning or review action, not an autonomous block, during the first release;
- the final invoice/action stores the exact evidence-reference set used;
- access-control and signed-URL tests cover worker, owner and customer contexts.

#### Rank 4 — Offer-to-Reality reliability and quote feedback

**Why now:** This is a real moat foundation already in code. Its value is limited by best-effort outcome freezing, coarse aggregate comparisons and incomplete cost inputs.

**Customer impact:** more accurate future quotes and earlier visibility of margin leakage.  
**Revenue impact:** higher gross margin and fewer systematically underpriced job types.  
**Moat impact:** per-company closed-loop pricing data compounds with every completed job.  
**Dependencies:** durable completion event, outcome backfill/reconciliation, evidence/time/material completeness and canonical quote/project lineage.  
**Complexity:** medium.  
**Risk:** confident pricing advice from incomplete or incomparable projects.

**Definition of done:**

- outcome freezing is retriable and reconciled rather than console-only best effort;
- each outcome records source completeness and calculation version;
- quote-to-project line/section mapping is retained where practical so large deviations are explainable;
- advice is suppressed or qualified below a data threshold;
- backfill results and orphan rates are measured;
- at least three completed pilot job types produce reviewable quote-versus-actual explanations.

#### Rank 5 — Thin Action + Decision Ledger

**Why now:** Existing approvals and logs are the strongest autonomy substrate, but their semantics are fragmented. Revenue Recovery and Karin need a common reason/evidence/policy/execution/outcome chain.

**Customer impact:** users can answer “what did Karin/Handymate propose, why, who approved it, and what happened?”  
**Revenue impact:** reduces fear of adoption and supports earned autonomy.  
**Moat impact:** captures decision/outcome history competitors cannot infer from documents alone.  
**Dependencies:** stable action IDs, entity references, evidence index, policy result and lifecycle/outcome facts.  
**Complexity:** high if historical records are rewritten; medium for new high-value actions plus adapters.  
**Risk:** creating another log table without making it authoritative.

**Definition of done:**

- Revenue Recovery and one Karin action use the same versioned action envelope;
- proposed/final payload hashes, decision metadata, evidence, policy, approval and execution attempts are linked;
- informational reminders are distinguishable from executable proposals;
- edited approvals preserve proposed and final payloads;
- agent/model/prompt versions are recorded for consequential AI proposals;
- new consequential model calls use one instrumented caller for timeout, retry, cost and decision metadata, while legacy call sites migrate incrementally;
- existing automation logs and agent runs link to the action rather than being replaced;
- an operator can reconstruct the action without searching JSON across multiple tables.

#### Rank 6 — Tenant, cron, migration and release truth gate

**Why now:** Concrete service-role tenant and fail-open cron paths exist. Manual migration and verification gaps make every autonomous workflow less trustworthy.

**Customer impact:** protects customer isolation and prevents broken money workflows.  
**Revenue impact:** avoids breach, failed onboarding, failed billing and pilot loss.  
**Moat impact:** low direct differentiation, high preservation of every other moat.  
**Dependencies:** none; this is a gate.  
**Complexity:** low to medium.  
**Risk:** work can expand into unlimited hygiene; constrain it to security and release truth, while the separate hygiene task owns dead code.

**Definition of done:**

- the monthly-review cross-business override is removed or role/scoped correctly;
- all cron routes use one fail-closed secret validator and tests cover missing/malformed secrets;
- business-scoping contract tests cover service-role routes in money/action domains;
- CI runs typecheck, build and a curated critical-path facit suite;
- migration state has a production-verifiable ledger/check and required-version startup/health reporting;
- the deployed cron plan is validated against the actual Vercel account;
- production smoke tests cover quote→project→invoice→payment and Karin calendar profile/rules.

#### Rank 7 — Fortnox pilot-grade financial synchronization

**Why now:** Fortnox can materially reduce reconciliation work and later feed Karin, but external access and production validation are unresolved. This epic starts only when license and scopes are available.

**Customer impact:** less double entry and more reliable payment state.  
**Revenue impact:** improves retention for established Swedish firms and enables stronger economic guidance.  
**Moat impact:** Swedish workflow depth and historical finance signals.  
**Dependencies:** pilot license, confirmed scopes, schema migrations, lifecycle/action idempotency, secret/token handling and reconciliation.  
**Complexity:** high because external state, rate limits, refresh, reconciliation and support matter more than API calls.  
**Risk:** treating Fortnox as authoritative before bidirectional conflicts and partial failures are understood.

**Definition of done:**

- the pilot license/scopes are documented and exercised in sandbox then production;
- one route family and one sync service are authoritative; duplicate namespaces are deprecated safely;
- refresh/token failures, rate limits and partial sync are observable;
- invoice/payment reconciliation has idempotency and conflict rules;
- webhook/polling outcomes write lifecycle facts;
- API-log retention is actually enforced and sensitive fields are minimized;
- supplier-invoice/bookkeeping claims remain out of scope unless scopes and real data prove them.

#### Rank 8 — Karin V2: obligation fulfillment and cash-action layer

**Why now:** Karin V1 should first be validated. The next useful step is not more calendar UI; it is the distinction between an upcoming obligation, an acknowledged reminder, and proven fulfillment.

**Customer impact:** fewer missed company deadlines and a clearer cash/administration plan.  
**Revenue impact:** retention and willingness to pay for reduced owner administration.  
**Moat impact:** combines Swedish rules with company facts and action history.  
**Dependencies:** validated V1, Company Model provenance, action/evidence record, trusted invoice/payment facts and later Fortnox inputs.  
**Complexity:** medium for fulfillment tracking, high for accounting-grade amounts.  
**Risk:** presenting legal/tax certainty or cash amounts beyond the available sources.

**Definition of done:**

- V1 rule accuracy and reminder usefulness are measured with pilot feedback;
- obligation instances are materialized with rule/profile version snapshots;
- “handled” is renamed/defined as acknowledgement unless fulfillment evidence exists;
- fulfillment stores actor, time, evidence and source;
- profile changes are audited with field-level provenance;
- no tax/payment amount is presented as authoritative without a named trusted source and freshness;
- Karin can propose a bounded action through the common action/policy path.

#### Rank 9 — Company Model contract and trusted read model

**Why now:** Many future moats require the same company facts, but building a new giant table would duplicate existing truth. A contract and provenance layer offers leverage with lower migration risk.

**Customer impact:** more consistent recommendations and fewer repeated setup questions.  
**Revenue impact:** indirect through better onboarding, quotes, scheduling and Karin.  
**Moat impact:** per-company operating context and history compound over time.  
**Dependencies:** source inventory, identity/roles, profile audit, pricing/outcome facts and data-retention policy.  
**Complexity:** medium/high.  
**Risk:** creating a stale cache or using inferred facts as authoritative.

**Definition of done:**

- a versioned read contract defines authoritative, user-declared, imported, derived and inferred facts;
- each critical fact exposes source, observed/effective time, freshness and confidence;
- Karin and one other consumer use the same read contract;
- field-level overrides do not erase provenance for unrelated fields;
- derived facts remain reproducible from source/version;
- sensitive memory/profile retention and deletion behavior is explicit;
- no mass migration into a single “company_model” JSON blob occurs.

#### Rank 10 — Unified earned-autonomy policy evaluator

**Why now:** Earned autonomy works for four low-risk action types, but policy checks are distributed and post-grant feedback is asymmetric. Expansion without an evaluated-policy record would be unsafe.

**Customer impact:** fewer approval clicks while preserving control and clear boundaries.  
**Revenue impact:** improves stickiness after trust is established.  
**Moat impact:** per-company, per-action trust history is harder to copy than an autonomy toggle.  
**Dependencies:** Action Ledger, outcomes, role model, quotas/quiet hours, execution reliability and sufficient approval history.  
**Complexity:** medium/high.  
**Risk:** accidental scope expansion or learning from misleading approval events.

**Definition of done:**

- one code-level evaluator returns policy version, reasons, required approval role and allowed execution mode;
- the existing hard allowlist, kill switch, quotas, quiet hours, role routing and trust state flow through it;
- each action stores the evaluated result;
- autonomous failures and sampled outcomes can downgrade or re-gate the action type;
- edited approvals and informational cards never inflate trust;
- no user-authored DSL or global autonomy switch is introduced.

---

## 6. Moat-by-moat assessment

Scores below are qualitative 1–10 assessments for **customer value / revenue potential / moat potential / technical complexity / risk**. Complexity and risk are higher when the number is higher.

| # | Moat concept | Current implementation status | Value / revenue / moat | Dependency readiness | Complexity / risk | Data required | What it unlocks / depends on | Recommendation |
|---:|---|---|---|---|---|---|---|---|
| 1 | Offer-to-Reality Engine | **Partial, meaningful.** `project_outcome`, economics, quote/actual deltas and pricing consumption are wired; freezing is best-effort and aggregate. | **8 / 8 / 9** | Medium | **6 / 7** | Stable quote/project lineage, time, material, ÄTA, invoice, completeness and calculation version | Better prices, margin warnings and future Job Genome. Depends on durable completion and reliable outcomes. | **BUILD NEXT** |
| 2 | Autonomous Revenue Recovery | **Partial, high-potential.** Three detection rules and some prior outbound attribution exist; findings do not close to payment and can false-positive on ÄTA. | **10 / 10 / 8** | Medium | **6 / 8** | Invoice/ÄTA/project transitions, payment source, action approval, evidence and attribution | Direct commercial wedge and Economic Copilot actions. Depends on money lifecycle spine. | **BUILD NOW** |
| 3 | Customer Promise Ledger | **Not started as a ledger.** Dates/messages/tasks exist, but promises are not typed, owned or evaluated. | **7 / 6 / 8** | Low/medium | **6 / 6** | Promise text/type, source evidence, owner, due date, fulfillment evidence, exceptions and outcome | Dispute prevention, customer trust and Autopilot. Depends on events/evidence/action identity. | **BUILD NEXT**, small MVP after core loop |
| 4 | Project Autopilot | **Partial and fragmented.** Project health, stage automation, dispatch, checklists, next actions and approval packages exist; no single mission/state/recovery model. | **8 / 7 / 7** | Medium/low | **8 / 8** | Reliable lifecycle, dependencies, evidence, schedule constraints, action policy and outcomes | Administrative time savings and proactive delivery. Depends on primitives and data quality. | **LATER** as a unified product; harden components now |
| 5 | Decision Replay | **Very partial.** `_decision` metadata covers a few AI proposal paths; no complete persisted decision chain or replay. | **6 / 5 / 9** | Low | **7 / 7** | Inputs/evidence, prompt/model version, policy, user edit/response, action and outcome | Auditability, AI evaluation and earned autonomy. Depends on Action/Decision Ledger. | **BUILD NEXT** for records; replay UI **LATER** |
| 6 | Company Model | **Partial and fragmented.** Config, profile, preferences, pricing, learned context, automation and outcome data exist. | **7 / 7 / 9** | Medium | **7 / 8** | Source/provenance, time/freshness, override history, roles, pricing, capacity and outcomes | Karin, Autopilot, personalization, Trade Packs and policy. Depends on source inventory. | **BUILD NEXT**, as a contract/read model |
| 7 | Outcome Graph | **Not implemented.** Domain outcomes and logs exist, but core lineage and action attribution are incomplete; no traversable graph. | **5 / 5 / 10** long-term | Low | **9 / 9** | Durable lifecycle, canonical IDs, actions, evidence, outcomes and substantial history | Portfolio learning, attribution and Decision Replay. Depends on almost every core primitive. | **LATER** |
| 8 | Job Genome | **Not implemented.** Job types, templates, pricing, outcomes and photos are ingredients, not a genome. | **6 / 6 / 9** long-term | Low | **9 / 9** | Many complete comparable jobs, normalized scope/resources/constraints/events/outcomes | Better estimating, scheduling and risk models. Depends on Offer-to-Reality and volume. | **LATER** |
| 9 | Dispute Prevention | **Partial substrate.** Signed quotes/ÄTA, communication, photos, reports and self-inspection exist; no risk/obligation engine or evidence bundle. | **8 / 7 / 8** | Medium | **7 / 7** | Promise/scope changes, approvals, customer messages, evidence timeline, invoice link | Fewer write-offs, faster payment and insurer/legal evidence. Depends on Evidence index and Promise Ledger. | **BUILD NEXT** after evidence readiness |
| 10 | Economic Copilot | **Partial.** Karin, cash radar, overdue/reminders, monthly review, project economics and profitability exist; no trusted full cash/obligation ledger. | **9 / 8 / 8** | Medium/low | **8 / 9** | AR/AP, bank/cash, taxes, recurring costs, payroll, projects, obligations, provenance and freshness | Owner operating decisions and proactive cash actions. Depends on Karin, Fortnox and action/outcome records. | **BUILD NEXT** in narrow stages; broad copilot **LATER** |
| 11 | Evidence-to-Payment | **Partial.** Considerable evidence is captured; it is not consistently linked to scope, invoice lines or payment outcomes. | **9 / 9 / 8** | Medium | **7 / 8** | Evidence references, project/ÄTA/scope mapping, customer approval, invoice and payment | Revenue Recovery, disputes and faster billing. Depends on entity lineage and access controls. | **BUILD NEXT**; readiness slice **BUILD NOW** |
| 12 | Trade Packs | **Partial content only.** Industry article/product/form/rule defaults exist, not versioned installable packs with measured outcomes. | **6 / 6 / 7** | Low/medium | **6 / 7** | Pack version, trade taxonomy, company overrides, outcome evidence and upgrade behavior | Faster onboarding and vertical expansion. Depends on Company Model and multiple real customers. | **LATER** |
| 13 | Constraint-aware Scheduling | **Partial assistant.** Capacity, time off, skills, certificates, conflicts and rough proximity exist; no hard optimizer. | **8 / 7 / 7** | Medium/low | **9 / 9** | Travel, job duration distributions, dependencies, skills, labor rules, materials, vehicles and exceptions | Fewer mistakes and better utilization. Depends on reliable durations and operational data. | **LATER** |
| 14 | Homeowner Twin | **No twin.** Customer, address, project, warranty, documents, service and portal history are ingredients. | **5 / 5 / 7** | Low | **8 / 8** | Property identity, systems/assets, ownership/consent, projects, warranties and service history | Repeat service, maintenance and cross-contractor context. Depends on adoption and data rights. | **LATER** |
| 15 | Supplier Intelligence | **Partial operational data.** Suppliers, products/inventory and manual/material records exist; no reliable network intelligence or broad live integrations. | **7 / 7 / 8** | Low | **9 / 9** | Supplier invoices, SKU normalization, quotes/orders, lead times, prices, substitutions and outcomes | Margin and scheduling improvements. Depends on integrations and volume. | **LATER** |
| 16 | Handymate Protocol | **Not implemented.** No stable external lifecycle/action/evidence protocol or ecosystem demand. | **3 / 3 / 9** theoretical | Very low | **10 / 10** | Stable internal contracts, identity, permissions, schemas, adoption and partner demand | Ecosystem interoperability. Depends on mature internal primitives. | **DO NOT BUILD** now |
| 17 | Autonomy Marketplace | **Not implemented as a marketplace.** Automation templates/library and action types exist, but no safe packaging, versioning, permissions or ecosystem. | **4 / 4 / 8** theoretical | Very low | **10 / 10** | Versioned skills/actions, policy sandbox, permissions, billing, review, telemetry and rollback | Third-party expansion. Depends on protocol, policy and large installed base. | **DO NOT BUILD** now |
| 18 | Verified Contractor Passport | **Not implemented.** Business/employee/certificate/project evidence exists but no verification, portability or external trust network. | **5 / 4 / 8** | Low | **9 / 10** | Verified identity, credentials, insurance, outcomes, consent, revocation and fraud controls | Marketplace trust and procurement. Depends on ecosystem demand and legal design. | **DO NOT BUILD** now |
| 19 | Margin Insurance / risk intelligence | **Partial analytics only.** Profitability, outcome deltas and warnings exist; no calibrated underwriting or insurance product. | **7 / 7 / 9** long-term | Very low | **10 / 10** | Large complete outcome corpus, causality, external risk data, pricing, claims and regulation | Risk-adjusted pricing and potentially financial products. Depends on Job Genome/Outcome Graph/volume. | **LATER** for risk intelligence; insurance **DO NOT BUILD** |

### Moat conclusion

The highest-value “moats” for the next 90 days are not the most futuristic names. They are the intersections:

- **Revenue Recovery × Evidence-to-Payment × lifecycle reliability**;
- **Offer-to-Reality × complete project outcomes**;
- **Karin × Company Model provenance × action policy**.

Those intersections can produce paid invoices, better margins and defensible per-company data now. Protocol, marketplace, passport and insurance require an installed base and reliable data that Handymate does not yet have.

---

## 7. Dependency graph and recommended sequence

```text
Production truth gate
├── tenant/role isolation
├── fail-closed cron auth
├── migration-state verification
└── build + critical-path facit CI
             │
             ▼
Canonical entity lineage + money-state semantics
             │
             ▼
Durable money lifecycle journal + scoped outbox
├── project.completed
├── ata.invoiced
├── invoice.created / delivered / failed
└── invoice.paid
             │
       ┌─────┴──────────────┐
       ▼                    ▼
Thin Action/Decision     Evidence reference index
record                   + invoice readiness
       │                    │
       └──────────┬─────────┘
                  ▼
     Revenue Recovery closed loop
     identified → approved → invoiced
     → delivered → paid → attributed
                  │
       ┌──────────┴───────────┐
       ▼                      ▼
Offer-to-Reality         Karin V2 obligations
reliable outcomes        + bounded cash actions
       │                      │
       └──────────┬───────────┘
                  ▼
        Company Model read contract
                  │
       ┌──────────┼─────────────┐
       ▼          ▼             ▼
Promise Ledger  Policy       Project Autopilot
MVP             convergence  components
       └──────────┴──────┬──────┘
                         ▼
               Decision Replay records
                         │
                         ▼
               Outcome Graph / Job Genome
               only after sufficient history
```

### High-priority dependency chains

**Autonomous Revenue Recovery**  
requires → correct invoice/ÄTA semantics → durable lifecycle facts → idempotent approved action → delivery confirmation → payment reconciliation → conservative attribution.

**Evidence-to-Payment**  
requires → evidence references and permissions → canonical project/scope/ÄTA links → invoice-readiness rules → approved invoice action → immutable evidence bundle reference → payment outcome.

**Offer-to-Reality**  
requires → quote/project lineage → complete time/material/ÄTA/invoice inputs → durable completion → versioned outcome calculation → sufficient comparable history → qualified pricing advice.

**Economic Copilot**  
requires → Company Model provenance → obligations → reliable invoices/payments → cash/AP/recurring-cost sources → action policy → outcome measurement. Fortnox helps but is neither sufficient nor currently fully ready.

**Project Autopilot**  
requires → lifecycle state → dependency/constraint data → evidence/readiness → action policy → retryable execution → exception handling → outcome feedback.

**Promise Ledger / Dispute Prevention**  
requires → extraction or explicit creation from communications/documents → actor/source evidence → owner/due date → fulfillment evidence → immutable timeline → access/export controls.

**Decision Replay**  
requires → persisted decision input/evidence → model/prompt version → policy → user edit/response → action execution → outcome. Current `_decision` metadata satisfies only a small part.

**Outcome Graph**  
requires → stable entity IDs → durable lifecycle events → action records → outcome facts → historical volume → explicit attribution semantics. It should be a read model over those facts, not the first data layer.

**Job Genome**  
requires → normalized job type/scope → Offer-to-Reality lineages → resources/constraints/evidence → many complete outcomes → privacy-safe aggregation. It is not credible with one pilot and sparse comparable jobs.

**Constraint-aware Scheduling**  
requires → trustworthy duration distributions → employee/skill/certification availability → travel locations/times → job dependencies → material/vehicle/tool constraints → explainable solver and exception workflow.

---

## 8. Karin integration implications

### 8.1 Where Karin V1 fits

Karin V1 is a sensible deterministic entry point: company profile facts feed a versioned rule engine that produces Swedish business-calendar deadlines, reminders and a dashboard surface. It should continue without a competing implementation.

Karin V1 currently establishes:

- company form/fiscal year/VAT/employer profile inputs in `business_config`;
- deterministic obligations with rule version, legal basis/source URL and confidence;
- onboarding profile collection and organization-number validation;
- calendar API/view/widget;
- deadline cards and a user “handled” state.

### 8.2 Architectural guardrails for the in-progress work

These are not reasons to redesign V1, but they must constrain its claims and next steps:

1. **“Handled” means acknowledged, not fulfilled.** The current preference array has no actor, timestamp, evidence, payment, filing reference or fulfillment proof. It must not be used as an audit or compliance fact.
2. **Calendar instances are recomputed.** A future compliance/Decision Replay claim requires a snapshot of the rule version and relevant profile facts that produced an obligation.
3. **Profile provenance is too coarse.** A single edit currently turns the profile-level source into `user`, potentially hiding which fields came from lookup, onboarding, import or inference. V2 should use field-level provenance/history.
4. **No amount/source should be invented.** V1 has dates and obligations, not accounting-grade VAT, payroll tax, cash, supplier invoices or bank balances.
5. **Deadline cards are informational.** Storing them in `pending_approvals` works for UI reuse, but Action Ledger work must classify them separately from executable decisions so they do not affect trust/approval analytics.
6. **Rule changes need a migration policy.** Future-date recalculation can be acceptable; historical obligations should retain the rule/profile snapshot the user saw.

### 8.3 Dependencies Karin needs next

- Company Model fact provenance and change history;
- materialized obligation instances with acknowledgement versus fulfillment;
- reliable customer-invoice and payment states;
- supplier invoice, recurring cost, payroll/tax and cash sources only when verified;
- lifecycle/action records for proposed reminders, filings or payment actions;
- evidence references for receipts, filings and confirmations;
- policy boundaries by action type, amount, role and due-date risk;
- notification delivery status and dedupe;
- Fortnox license/scopes, reconciliation and source-freshness indicators.

### 8.4 Systems Karin can feed

- **Today/Jarvis:** upcoming obligations, cash exposures and one prioritized next action;
- **Revenue Recovery:** overdue invoice prioritization, payment risk and recommended approved follow-up;
- **Project economics:** cash and margin consequences of delayed invoicing or missing cost inputs;
- **Notifications:** deadline, exception and failed-action alerts with explicit delivery state;
- **Action/Policy:** bounded proposed reminders, invoice follow-ups and later payment preparation;
- **Company Model:** verified fiscal rhythm, recurring obligations and learned owner preferences;
- **Outcome measurement:** deadlines acknowledged/fulfilled, days saved, overdue value reduced and cash received.

### 8.5 What Karin should eventually become

Karin should become an **auditable economic operating controller**, not a financial chatbot and not an accounting system replacement.

Her useful loop is:

```text
Observe trusted company and money facts
→ identify obligation, leakage or cash risk
→ explain evidence and uncertainty
→ propose a bounded action under policy
→ obtain required human approval
→ execute or hand off
→ verify the result
→ learn from the business outcome
```

Examples include prioritizing a verified overdue invoice, preparing an owner-approved reminder, showing the cash effect of delayed project invoicing, surfacing a VAT deadline with source and confidence, or warning that supplier costs make a project outcome incomplete. Filing taxes, paying suppliers or changing accounting records should remain gated until source quality, roles, amounts, rollback and external integration behavior are proven.

---

## 9. NOT NOW

The following items are strategically interesting but should not consume the next 90 days:

1. **Full Outcome Graph or graph database.** The system first needs reliable lineage, action IDs and outcome facts. A graph would visualize uncertainty rather than remove it.
2. **Job Genome.** There is insufficient complete, comparable job history and customer volume. Improve outcome capture first.
3. **Unified Project Autopilot product.** Harden the current components and lifecycle substrate before adding a mission layer that promises autonomous delivery.
4. **General constraint solver for scheduling.** Current heuristics deliver value. Travel, dependencies, labor rules, materials and explainability make the full feature much larger than it appears.
5. **Handymate Protocol.** Internal contracts are not stable enough, and there is no demonstrated partner demand.
6. **Autonomy Marketplace.** Requires protocol, permission sandbox, versioning, billing, review, rollback, installed base and support operations.
7. **Verified Contractor Passport.** Identity, credential verification, consent, fraud, portability and revocation are ecosystem/legal work, not a product toggle.
8. **Margin Insurance.** Continue internal margin-risk intelligence later, but do not market or build insurance before calibrated data, claims economics and regulatory analysis.
9. **Cross-company supplier intelligence network.** Supplier/SKU normalization, live order/invoice data and sufficient customer volume are absent.
10. **Homeowner Twin.** First prove repeat-service value using existing customer/project/warranty data; do not create a property ontology yet.
11. **Installable Trade Packs.** Continue using and testing trade-specific defaults, but defer packaging/version marketplaces until multiple customers show reusable patterns.
12. **More agent personas or a generic voice agent.** Shared reliability, evidence and action outcomes create more value than expanding the roster.
13. **Generic event platform or event-sourcing rewrite.** A scoped journal/outbox is enough for current scale.
14. **General policy DSL.** Code-level, versioned policies with tests are safer until policy patterns stabilize.
15. **Full Decision Replay UI or counterfactual simulator.** Capture complete records now; build replay only when the history is worth replaying.
16. **Accounting-grade Karin forecasts based on inferred or manually incomplete data.** Show source and uncertainty; do not manufacture precision.
17. **Computer-vision progress/quality expansion.** Self-inspection exists but lacks live usage proof. Gather pilot evidence before broadening CV scope.
18. **Another dashboard analytics surface.** Prioritize action and measured result over more passive cards.

---

## 10. 90-day recommendation

The 90-day target should be one demonstrable customer outcome:

> On a real project, Handymate identifies omitted billable work, shows the evidence, gets owner approval, creates and delivers the correct invoice, observes payment, and reports the conservatively attributed recovered amount—with every step auditable.

### Wave 1 — Weeks 1–4: Make the money facts trustworthy

**Scope**

- correct ÄTA invoicing fields and invoice delivery-state semantics;
- reconcile project versus booking completion side effects;
- fix the verified monthly-review tenant issue and standardize fail-closed cron authentication;
- establish CI for typecheck, build and a small golden-path/facit set;
- verify required production migrations and actual Vercel cron capability;
- measure/backfill core entity lineage and define money-state transitions;
- implement the smallest durable journal/outbox slice for completion, invoice, delivery and payment;
- shadow-validate Karin V1 rules and wording; keep acknowledgement distinct from fulfillment.

**Exit criteria**

- no known path can mark an unsent invoice as successfully sent;
- no successful auto-invoice leaves its ÄTA eligible for the same missed-revenue rule;
- selected transitions are idempotent, reconcilable and tenant-scoped;
- one production-like golden path passes from quote acceptance through payment application;
- Karin V1 has pilot validation data without expanding scope.

### Wave 2 — Weeks 5–8: Close Revenue Recovery and evidence readiness

**Scope**

- connect the three existing findings to review/dismiss/invoice-draft actions;
- introduce structured dismissal reasons and conservative attribution;
- index existing project evidence and calculate invoice readiness;
- link action, evidence and lifecycle records for this flow;
- show identified, approved, invoiced, delivered and paid amounts without conflating them;
- run real pilot cases and tune alert thresholds/dedupe.

**Exit criteria**

- all three findings can complete safely or be dismissed with an auditable reason;
- false-positive rate and duplicate rate are measured;
- recovered value is not claimed before the chosen outcome threshold;
- an owner can inspect why the action was proposed and what evidence supports it;
- at least one real paid or explicitly dismissed pilot path is documented.

### Wave 3 — Weeks 9–13: Compound the result

**Scope**

- make project outcome freezing durable and versioned;
- add data-completeness-aware Offer-to-Reality feedback;
- extend the common action/decision record to one Karin proposal;
- materialize Karin obligation instances with rule/profile snapshots if V1 validates;
- define the Company Model read contract for Karin plus one additional consumer;
- if and only if license/scopes are available, run the Fortnox pilot-grade reconciliation track;
- design, but do not necessarily build, a small Promise Ledger MVP from explicit promises.

**Exit criteria**

- completed projects reliably produce qualified, reproducible outcomes;
- one AI/rule action outside Revenue Recovery uses the same reason/evidence/policy/result record;
- Karin distinguishes obligation, acknowledgement and fulfillment;
- the next roadmap decision is based on pilot usage, recovered cash and data completeness—not file presence.

### 90-day success metrics

- percentage of completed projects invoiced within 24/72 hours;
- missed-revenue findings by type, false-positive rate and dismissal reason;
- identified, approved, invoiced, delivered and paid recovered value;
- duplicate/failed/retried money actions;
- invoice delivery-confirmation rate;
- project outcome completeness rate;
- time from completion to invoice and invoice to payment;
- Karin obligation acknowledgement and verified-fulfillment rates, kept separate;
- number of critical lifecycle records missing during reconciliation;
- pilot weekly active use of the recovery/evidence flow.

---

## 11. Suggested Claude Code vs Codex split

This split is based on task shape, not model prestige. Avoid simultaneous edits to the same money-critical routes and migrations.

### Claude Code

Best suited to:

- finish and stabilize the in-progress Karin V1 scope;
- Karin rule/calendar UX, Swedish copy, obligation presentation and pilot feedback iteration;
- product workflow design for Revenue Recovery review/dismiss/approve and evidence-readiness UX;
- Company Model consumer integration where broad product context and existing UI conventions matter;
- cohesive changes spanning dashboard components and established domain conventions.

### Codex

Best suited to:

- narrow data-integrity audits and fixes for invoice, ÄTA, completion and payment transitions;
- entity-lineage inventory, orphan measurement, backfill scripts and reconciliation tests;
- scoped lifecycle/outbox and idempotency implementation with contract tests;
- tenant-isolation, cron-auth and service-role route audits;
- CI/release-gate wiring and migration-state verification;
- Action/Decision record schema-contract tests, compatibility adapters and failure-injection testing;
- Fortnox sync reconciliation, retry/idempotency tests and route-family inventory once externally unblocked.

The separate Codex hygiene/dead-code task should remain separate; none of the work above should opportunistically become general cleanup.

### Mandatory cross-review

- **Money-state changes:** Claude reviews customer/product semantics; Codex reviews atomicity, idempotency and reconciliation.
- **Karin obligations:** Claude owns rule/product intent; Codex reviews provenance, historical reproducibility and failure states.
- **Security/service role:** Codex performs systematic scope checks; Claude reviews impact on established workflows and roles.
- **Action/autonomy policy:** Claude reviews user trust and Swedish communication; Codex reviews evaluated-policy records, bypass paths and rollback/failure behavior.
- **SQL migrations:** one author, one independent reviewer, plus production-state verification before code claims readiness.
- **Fortnox:** one reviewer validates accounting/product mapping and another validates OAuth, idempotency, partial failure and data minimization.

---

## 12. Questions and factual uncertainties

These are the only observed uncertainties likely to materially change priority or sequencing:

1. **Production migration state:** Are recent required migrations—especially the latest multi-employee/learning, deal/customer lineage and Karin profile migrations—actually applied and verified in production?
2. **Vercel plan and cron execution:** Does the deployed account support all 36 configured schedules, including 15-minute/two-hour jobs, and is there execution/failure telemetry?
3. **Real golden-path evidence:** Has a real customer completed lead/deal/quote/project/invoice/payment end to end on the current build, including the newly changed quote and completion paths?
4. **Pilot count and volume:** How many real businesses and completed comparable jobs currently provide usable outcome data? The documents imply one meaningful pilot and many built-but-unverified flows.
5. **Fortnox access:** Has the pilot obtained the required integration license, which scopes are actually granted, and can sandbox and production reconciliation now be exercised?
6. **Invoice delivery truth:** Which channels currently provide a durable delivered/failed result versus only “request accepted,” and what historic records are incorrectly marked sent?
7. **Historical lineage quality:** What fraction of invoices, projects, quotes, deals and customers are orphaned or linked only through inferable text/JSON fields?
8. **Karin rule validation:** Have a Swedish accountant/legal reviewer and the pilot confirmed the six V1 obligation rules, company-form applicability, wording and edge cases?
9. **Fortnox log/token operations:** Is API-log retention enforced outside this repository, and are token encryption/rotation controls provided by deployment infrastructure not visible here?
10. **Mobile/runtime parity:** The dashboard repository references mobile capabilities and prior branches; the current production mobile build and its approval/action compatibility are not verifiable from this checkout.
11. **Actual customer demand ordering:** Do pilot interviews rank forgotten revenue/evidence-to-invoice above scheduling and quote speed? The engineering evidence favors the money loop, but measured willingness to pay could adjust Waves 2–3.

---

## Final council position

Handymate has enough product breadth to pursue its next-generation vision, but not yet enough shared truth to pursue several moats in parallel. The company should resist adding more names, personas or graphs. The post-Karin priority is to make one economically meaningful loop complete, durable and measurable.

If Handymate can reliably prove:

> “We found work you had earned but not invoiced, showed why, helped you approve and send it, observed the payment, and learned how to prevent the same leakage,”

then Revenue Recovery, Offer-to-Reality, Karin, Evidence-to-Payment, Decision Replay and eventually Outcome Graph all begin to compound from the same facts. That is maximum customer and moat value per unit of engineering effort.
