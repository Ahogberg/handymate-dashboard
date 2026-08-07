# Handymate Architecture Council — Final Codex Review

**Round:** 3 — Final Engineering Sanity Check  
**Date:** 2026-08-07  
**Review basis:** current working tree, recent commits, repository instructions, both strategy documents, `PRIORITY_PROPOSAL_CODEX.md`, `COUNCIL_SYNTHESIS.md`, Karin V1, and the production paths named below. The repository—not the strategy prose—is treated as current-state truth.

# 1. Executive verdict

**Roadmap readiness: YES, WITH REQUIRED CHANGES**

`COUNCIL_SYNTHESIS.md` has the right strategic center: stop adding broad moat concepts, make the existing money paths true, prove value with a pilot, then improve Offer-to-Reality. It is also correct to defer a generic event journal, outbox, graph, Company Model service, policy DSL, evidence platform, and marketplace.

It is **not safe to copy verbatim into `ACTIVE_ROADMAP.md`**. Five corrections are mandatory:

1. The security gate must cover actual RLS and direct browser writes to project/financial tables, not only one tenant override and two fail-open cron routes.
2. Karin's `handled` behavior is a current statutory-reminder safety defect. It belongs in NOW, not in a later Karin V2 wave.
3. Revenue Recovery V1 must express uncertainty and use source-specific invoice paths. “One route: time + material + ÄTA” is several epics and can double-bill fixed-price or manually invoiced work.
4. The approval queue is not yet a trustworthy action boundary. Unknown types fall through to “acknowledged,” including at least one high-risk manual-project recovery card. A small producer-to-handler contract is more valuable than a broad synthetic smoke harness.
5. Offer-to-Reality is technically connected but does not yet produce consistently trustworthy learning. It needs calculation versioning, completeness, reconciliation, and correction of known semantic ambiguities before it can tune pricing.

The recommended roadmap is therefore smaller than both prior proposals: security and truth first; one confidence-aware Revenue Recovery vertical slice next; reliable aggregate Offer-to-Reality after evidence. No platform program is required.

# 2. Factual corrections

| Synthesis claim | Actual code reality | Severity | Required correction |
|---|---|---:|---|
| The missed-revenue sweep has never created a card because it selects `project_change.id`. | **OUTDATED in the current working tree.** The uncommitted change aliases `change_id` as `id`. The historical defect is verified, but the fix is already in flight. `missad_intakt` still has no explicit executor. | High | Describe the detector defect as an in-flight fix, merge and verify it first, and retain the handler/action gap as open. Do not schedule a duplicate fix. |
| Auto-invoice marks ÄTA incorrectly and will create false leakage findings. | **OUTDATED in the current working tree, but not fully closed.** The in-flight patch writes `status`, `invoice_id`, and `invoiced_at` with a tenant filter. Invoice creation and ÄTA marking remain separate writes; a failed second write is only logged. | High | Merge the patch, add idempotency/reconciliation coverage, and do not claim atomic correctness. |
| Auto-send sends the invoice. | **VERIFIED defect.** `auto-invoice-on-complete.ts` creates the invoice as `sent`, calls the authenticated `/api/invoices/send` route without a valid user session, ignores the response, and tells the owner it was sent. `_internal_business_id` is not consumed by the route. | Critical | A failed or unauthenticated delivery must never yield `sent` state or “skickad” copy. Fix before any recovered-revenue action can send automatically. |
| Monthly review has a tenant hole; two cron routes fail open. | **VERIFIED, but incomplete as a security boundary.** Monthly-review POST accepts a body `business_id`. `fortnox-sync` and `project-health` explicitly allow execution when the secret is absent. Most other cron routes compare against `Bearer ${process.env.CRON_SECRET}` and therefore accept the guessable string `Bearer undefined` if configuration is missing. | Critical | Use one fail-closed cron-auth contract across every cron route, and test missing, guessed, wrong, and valid secrets. Do not limit Wave 1 to two files. |
| The approval queue is production-ready, including earned autonomy and automatic downgrade. | **PARTIALLY VERIFIED and overstated.** CAS resolution, execution-result persistence, retry, role checks, and a four-action allowlist exist. However, unknown approval types default to acknowledgement. `missad_intakt` and high-risk `manual_project_create` have no explicit case. Post-grant automatic downgrade is not universal: engine actions bypass the approvals whose rejection would call `revokeAutonomy`; autonomous failures generally notify rather than revoke. | Critical | Call the queue a strong partial foundation. Add an explicit action/acknowledgement/review contract, fail closed for unclassified action cards, and state autonomy downgrade behavior per action type. |
| Offer-to-Reality is a closed loop that only needs reliability. | **PARTIALLY VERIFIED.** Both project-completion paths call `freezeProjectOutcome`, and pricing reads outcomes. The freeze is best-effort with no retry. Quote labor hours use heuristic classification; ROT/RUT-eligible non-hour units can be counted as hours. Supplier invoices and project materials can double-count the same purchase. Margin uses expected revenue, not necessarily realized invoiced revenue. | High | Reframe as “connected aggregate loop, not yet trustworthy learning.” Put data-quality and reconciliation gates ahead of pricing feedback. |
| Project economics is production-ready. | **PARTIALLY VERIFIED.** `computeProjectEconomics` correctly refuses labor margin when internal cost is missing and includes time, ÄTA, invoices, supplier invoices, materials, and manual costs. A second legacy profitability engine still exists with different semantics. Supplier/material duplication and historical invoice linkage remain unresolved. | High | Designate one engine as canonical for new learning and measure completeness. Do not delete/refactor the legacy path as part of this roadmap unless a consumer migration requires it. |
| Karin V1 creates a Company Model foundation. | **PARTIALLY VERIFIED.** Nine profile fields on `business_config` support Karin and onboarding. Provenance is profile-wide and is overwritten as `user` by an edit. There is no read contract, field-level provenance, financial fact model, or general Company Model. | Medium | Call it shared company-profile persistence, not Company Model. Defer a model/service until a concrete second domain needs a stable read contract. |
| Karin V1 has financial events, cashflow, payables, and obligations. | **IMPLEMENTED DIFFERENTLY.** Obligations are deterministic, recomputed rule results; calendar events are not persisted. Existing Karin observations derive a three-month “cash flow” view solely from local customer invoices. Supplier invoices are manual CRUD. There is no financial-transaction store, recurring-expense model, bank feed, Fortnox AP feed, or two-sided cashflow ledger. | High | Keep Bolagskalender claims separate from Economic Copilot claims. Do not promise payables or cashflow prediction until the underlying feeds exist. |
| Fortnox is an available integration. | **PARTIALLY VERIFIED.** OAuth, customers, outbound invoices/offers, import of open customer invoices, API logging, and payment polling exist. Supplier invoices, general ledger transactions, recurring costs, and broad finance import do not. Required licenses/scopes and production migration state are not proven by code. | High | Treat Fortnox AR/customer capability as substantive but operationally unverified. Keep broad finance/AP expansion behind scope, consent, and pilot verification. |
| Supplier invoice data supports Economic Copilot and project reality. | **PARTIALLY VERIFIED.** `supplier_invoices` exists and feeds project economics, but entries are manual and can overlap `project_material`. Its repository migration defines `FOR ALL USING (true)` RLS. | Critical | Verify production RLS, harden tenant access, and establish duplicate/source semantics before using it as learning truth. |
| The documented event contract is an existing platform primitive. | **IMPLEMENTED BUT UNUSED as enforcement.** `ARCHITECTURE.md` lists 23 names, while `fireEvent` accepts any string and callers use undocumented names. There is no durable lifecycle registry or journal. | Medium | A typed/static name registry and contract test are appropriate now; a persistent event platform is not. |
| Decision records are a useful early Decision Replay substrate. | **PARTIALLY VERIFIED.** `_decision` stores model, prompt key/version, input hash, and time. It is attached by only three producer modules. It lacks output hash, evidence references, policy, confidence as a contract, and business outcome. | Medium | Extend it only when an actual AI proposal path is touched. Do not attach model/prompt metadata to deterministic revenue or obligation rules. |
| The security gate described in the synthesis is sufficient. | **NOT IMPLEMENTED at the required breadth.** Repository migrations still define permissive RLS for `project`, `project_change`, `project_material`, `time_entry`, and `supplier_invoices`. Browser components directly mutate at least `time_entry`; update/delete paths select only by row ID. `business_config` stores Fortnox tokens, is read client-side, and has no versioned RLS policy in this repository. Production policy state is unknown because migrations are manual. | Critical | Make production policy inventory and cross-tenant DB tests a stop-the-line gate for the financial/project tables used by Wave 2. Verify `business_config` column grants/policies and credential exposure. |
| GitHub Actions is absent. | The synthesis already corrected Codex's Round 1 error. **VERIFIED:** two workflows exist at repository root, but both are manual-only; push/scheduled QA is disabled. | High | The factual wording is correct. Add a small automatic merge gate for typecheck and selected no-browser contract tests before increasing feature parallelism. |
| Karin's handled state is merely incomplete fulfillment tracking. | **VERIFIED and more urgent:** the UI only offers “Markera hanterad”; the API can undo but the UI cannot. The deadline cron suppresses every future reminder for that event ID when handled. No actor, time, evidence, or fulfillment exists. | Critical | Move truthful acknowledgement/snooze semantics and visible undo to NOW. Do not represent a legal obligation as fulfilled. |

## Current-state summary by requested domain

- **Customer invoices:** implemented broadly, with several creation paths, delivery, reminders, payment state, ROT/RUT, and Fortnox sync. Consistency across paths is the risk.
- **Supplier invoices:** manual CRUD and project-cost input; no Fortnox AP ingestion.
- **Financial transactions:** **NOT IMPLEMENTED** as a general ledger/feed.
- **Business obligations:** deterministic Karin rule results; not persisted obligations or filings.
- **Calendar events:** Karin-local computed view; general booking/calendar systems are separate.
- **Notifications/reminders:** implemented through notifications, push, SMS, approvals, and many cron routes; observability and auth are fragmented.
- **Lifecycle events:** ad hoc string dispatch plus several unrelated activity/log tables; no canonical durable registry.
- **Audit/action tracking:** fragmented across `pending_approvals`, `v3_automation_logs`, `project_ai_log`, `learning_events`, Fortnox logs, and domain activities.
- **Agent framework:** registry, personas, tools, observations, approvals, and direct model callers exist; model invocation and decision stamping are not centralized.
- **Evidence:** photos, documents, calls, messages, time, material, signatures, and approvals exist in domain stores; no common evidence entity or retention contract.
- **Tenant isolation:** API routes commonly use service role plus explicit filters, but historical RLS and direct browser access prevent treating it as proven.

# 3. Karin V1 architecture findings

## Reusable now

| Concept | Finding | Recommendation |
|---|---|---|
| Company-profile fields | `business_config` is already shared by onboarding and Karin. Company form, fiscal-year end, VAT period, and employer status are legitimate shared facts. | Keep the fields in place. Improve semantics only when a real consumer needs them; do not add a parallel Company Model table. |
| Organisation-number validation | `lib/karin/org-number.ts` is deterministic and already used by onboarding/profile code. It is logically a business-identity utility. | Reuse it from its current location. A physical move is not worth churn until a non-profile consumer such as Fortnox matching actually imports it. |
| Existing notification/approval infrastructure | Karin uses the same queue and push surfaces as the rest of the product. | Reuse the infrastructure, but classify deadline cards as informational/acknowledgement rather than executable business actions. |

## Keep Karin-specific

| Concept | Why local |
|---|---|
| `obligation-rules.ts` and obligation materialization | The legal rules, applicability, confidence, sources, and date interpretation belong to Bolagskalender. |
| `CalendarEvent`, urgency sorting, and attention grouping | Only rule-derived Karin events use the abstraction. Its future source variants do not constitute consumers. |
| Handled/acknowledgement storage | It is tied to Karin event IDs and reminder behavior. Correct its semantics locally before considering a general acknowledgement primitive. |
| Swedish business-day calculations | They currently encode obligation-calendar assumptions. Invoice due dates can have different contractual/legal semantics. Keep local until that second consumer has explicit requirements and shared tests. |
| Deadline cron and profile-completeness prompts | These are Karin product behavior, not generic scheduling infrastructure. |

## Duplicate / consolidate

- Karin already existed as an observation agent over invoices, quotes, project snapshots, overdue receivables, and a simple invoice-derived cash view. Bolagskalender must not create a second “Economic Copilot” agent or duplicate those aggregates.
- Karin should consume the canonical project-economics and invoice services where possible. It must not introduce a third margin or receivables calculation.
- General notifications, approvals, Fortnox sync, invoices, and supplier invoices remain owned by their domains. Karin should link to them and propose actions rather than duplicate their mutation logic.
- No existing equivalent was found for the obligation rule engine itself. It is not accidental duplication.

## Future generalization

Generalize only on these concrete triggers:

- Move organisation-number functions when customer/Fortnox identity matching becomes an actual caller.
- Extract a shared Swedish due-date function only when invoice/payment terms require the same explicitly tested holiday semantics.
- Add a company-profile read contract when a second independent domain needs stable fact names, source, freshness, and confidence—not merely because nine columns exist.
- Add field-level provenance when imported and user-entered profile facts can conflict in a live workflow.
- Do **not** generalize `CalendarEvent`, obligation IDs, or handled state into Lifecycle Events, Evidence, or an Outcome Graph.

Dangerous abstraction candidates now are a generic calendar-event model, a general obligation table, a new Company Model schema, and a universal “financial event.” None has a concrete second consumer with matching semantics.

# 4. Dependency corrections

| Current order | Problem | Correct order | Reason |
|---|---|---|---|
| Security gate limited to monthly-review and two crons, then defect work | The core Wave 2 tables have unproven/permissive RLS and direct browser writes. Route filters do not protect direct Supabase access. | Production policy inventory → cross-tenant tests → targeted RLS/API hardening → money features | Tenant isolation is a release condition, not a ranked epic. |
| Four defects → Revenue Recovery | Two defects are already being edited in the working tree, while auto-send, action handling, and Karin reminder truth remain open. | Merge/verify current edits → fix delivery state and Karin semantics → approval action contract → Revenue findings | Parallel duplicate edits and false-success cards would otherwise contaminate the new flow. |
| Broad smoke test before Wave 2 | Calling every cron and every handler with synthetic rows is an integration platform, not a one-day test, and many routes have external side effects. | Static contracts + targeted integration tests for touched money paths → expand per shipped path | Risk-based tests give earlier signal without building an E2E environment first. |
| `missad_intakt` handler → cross-cutting view → one universal invoice route | The action's meaning is undefined, source lineage is incomplete, and fixed-price/T&M/mixed billing have different semantics. | Confidence/evidence contract → review surface → source-specific existing builder → outcome link → broader view after pilot | Prevents duplicate invoicing and makes false positives measurable. |
| Revenue action instrumentation uses `_decision` | The detector is deterministic; there is no model or prompt. | Persist `rule_id`, `rule_version`, confidence, evidence/source IDs, user response, invoice link, and outcome | Decision metadata should describe the real mechanism. |
| Offer-to-Reality retry/versioning and learning together | Replaying an ambiguous calculation only reproduces ambiguous data. | Define canonical calculation and completeness → reconcile/backfill → version/retry → allow pricing consumption | Reliability without semantic correctness creates confident bad learning. |
| Karin fulfillment in Wave 3 | Current `handled` state can suppress statutory reminders today. True filing verification is a separate, larger product. | NOW: acknowledgement/snooze/undo truth; LATER: explicit fulfillment evidence | Safety copy/state is small and urgent; filing verification needs external evidence. |
| Event-name guard as part of the customer-value chain | It is useful, but Revenue Recovery is a recomputable sweep and does not need a global event journal or event dispatch. | Build the static registry in parallel as a merge gate; do not block the first findings pilot on event persistence | It prevents drift but is not a hidden runtime dependency for V1. |
| CI is an implied Codex task rather than a roadmap gate | Existing workflows do not run automatically. Contract tests can still regress on main. | Enable a narrow automatic gate before Wave 2 branches proliferate | Typecheck plus selected pure/static tests is sufficient; full browser QA is not. |
| Manual SQL assumed present | Migrations are explicitly manual, and code has historical “column/table absent” fallbacks. | Verify production migration/policy state before each dependent rollout; then deploy code | A repository file is not proof that the production schema exists. |

# 5. Scope corrections

| Original epic | Problem | Recommended V1 slice | Definition of done |
|---|---|---|---|
| “Four defects + smoke test” | **MULTIPLE EPICS.** It combines financial state transitions, tenant security, cron auth, and test infrastructure. | 1A current money-transition fixes; 1B fail-closed auth/tenant gate; 1C Karin reminder truth; 1D targeted contracts/CI. | Each transition is truthful under success/failure/retry; cross-tenant tests fail closed; selected tests run automatically. |
| “One facit suite calls every cron route and approval handler” | **TOO LARGE / NOT CUSTOMER-TESTABLE.** External APIs, auth, service-role data, and side effects require a real integration environment. | Static column/event/approval contracts plus route-level tests for missed revenue, invoice delivery, Karin reminders, monthly tenant isolation, and cron auth. | The five verified defect classes fail a test before the fix and pass after it; no attempt to simulate every route. |
| “Revenue Recovery V1: handler + view + one route for time/material/ÄTA” | **MULTIPLE EPICS and financially unsafe.** It mixes detection, uncertainty, billing-contract interpretation, invoice composition, UI, and outcome attribution. | Detect and classify three finding types; show evidence; create a draft through the appropriate existing builder for one supported source type; link finding→invoice→payment. | One real pilot finding becomes a correct draft without duplicate lines; false alarms and dismiss reasons are measured; recovered SEK is counted only after an invoice link, and paid SEK separately. |
| “Cross-cutting uninvoiced view” | **TOO VAGUE.** “Uninvoiced” is not one reliable state across manual invoices, Fortnox imports, quotes, time, materials, and ÄTA. | A Revenue Review view containing only typed findings with confidence and evidence. | Every card explains why it exists, what is uncertain, its source rows, and the safe next action. |
| “Offer-to-Reality reliability” | **TOO VAGUE.** Retry and versioning alone do not fix unit classification, source duplication, or realized-margin semantics. | Aggregate Outcome Quality V1: canonical engine, version, completeness reasons, source counts, reconciliation/backfill, and corrected labels. | Completion coverage and completeness are observable; ambiguous outcomes are excluded from pricing advice. |
| “Karin V2 fulfillment” | **MULTIPLE EPICS.** A truthful acknowledgement is small; proving taxes/filings are completed requires evidence and integrations. | Karin Reminder Safety V1: acknowledgement or snooze, visible undo, actor/time, no false fulfillment claim, safe reminder behavior. | A click cannot silently suppress all relevant future reminders or claim a filing is complete. |
| “Project Autopilot” | **TOO LARGE.** Existing code already mixes creation, progress, health, margin, schedule, and close suggestions with inconsistent data. | No product epic. Ship domain-owned detectors separately, beginning with unbilled work. | Each detector has its own evidence, action, outcome, and false-positive metric. |
| “Decision Replay” | **PREMATURE ABSTRACTION** as a replay system. | Stamp touched AI proposals and retain approval/execution/outcome linkage. | A consequential AI proposal can be grouped by prompt/model and followed to user response and business outcome; no replay UI. |

# 6. Shared primitive verdict

| Primitive | Build now? | Minimum scope | First consumer | Future consumers |
|---|---:|---|---|---|
| Lifecycle event registry | **Yes, static only** | Typed constant/list for `fireEvent` names, documented payload owner, static caller/seed contract. No table, outbox, replay, or generic payload schema. | Automation engine | Notifications, future domain integrations |
| Durable lifecycle journal/outbox | **No** | Feature-local retry/reconciliation only. Revisit when a business-critical consumer cannot safely recompute and delivery must be guaranteed. | None now | Payment/invoice integrations, later replay |
| Approval action contract | **Yes** | Every producer type classified as `execute`, `review`, or `acknowledge`; executable types require an explicit handler; unknown executable types fail closed. | Revenue Recovery and existing approval queue | All agents and autonomy |
| Action Ledger | **No generic ledger** | On the consumer row/payload: action/finding ID, actor or rule, rule version, evidence refs, approval response, execution result, target entity, timestamps. | Revenue Recovery | Karin recommendations, margin interventions |
| Decision Store | **No new store** | Extend existing `_decision` only on touched AI paths with output hash, confidence, and evidence refs. Deterministic rules use rule metadata instead. | Next consequential AI proposal, not Revenue detector | Decision Replay |
| Outcome Store | **Feature-owned now** | In the revenue finding/approval payload: identified amount, invoice ID, invoiced amount/date, paid amount/date, dismissal reason. Avoid a generic graph/table until a second workflow needs the same contract. | Revenue Recovery | Project risk interventions, Karin recommendations |
| Evidence Store | **No** | Stable references to existing ÄTA, time, material, invoice, quote, photo, message, and document rows; snapshot only the explanation needed for audit. | Revenue finding | Promise and dispute workflows |
| Policy Engine | **No** | Hardcoded permission, risk, and autonomy allowlists. Revenue actions always require human review in V1. | Existing earned autonomy | Later per-action autonomy |
| Company Model | **No service/table** | Read the existing profile fields directly. Add a thin read contract only when a second independent consumer requires source/freshness semantics. | Karin | Fortnox matching, later pricing/configuration |
| Financial transaction model | **No** | Do not invent one before an actual bank/Fortnox transaction feed is licensed and mapped. | None | Cashflow and payables later |

The synthesis is right to reject a platform-first Outcome Graph. Its “second replay consumer” rule for an outbox is too mechanical, however. The actual trigger should be a non-recomputable business-critical side effect with a demonstrated delivery/reconciliation need. Until then, each feature owns idempotency and reconciliation.

# 7. Revenue Recovery verdict

**Recommendation: BUILD NEXT, but replace the proposed universal invoice route with a confidence-aware, source-specific vertical slice. Never run it autonomously in V1.**

## Data readiness

| Signal | Availability | Reliability for “forgotten revenue” |
|---|---|---|
| Project completion | Present via status/completed timestamps | Useful, but completion does not prove all work/costs are entered. |
| Quote value/lines | Present in normalized `quote_items` plus legacy JSON | Mixed schemas; fixed-price versus T&M meaning must be retained. |
| Approved/signed ÄTA | Present with signature and invoice fields | Customer approval is evidence, but signature does not prove work was performed. |
| Time entries | Present with billable/invoiced/invoice fields | Good prospectively; historical/manual flows may not maintain flags. |
| Material entries | Present with invoiced/invoice fields | Good prospectively; can overlap supplier invoices and manual invoice lines. |
| Customer invoices | Extensive local model | `project_id` is nullable and historical/manual invoices may not link to source rows. |
| Fortnox customer invoices | Import and payment sync exist | Imported documents do not establish project/source-line linkage. |
| Payments | Local paid state and Fortnox polling | Suitable after a reliable invoice link exists. |

## Required confidence categories

- **CONFIRMED UNBILLED:** a completed/performed billable source row has an explicit reliable `invoiced=false`, no `invoice_id`, no matching source link, and the billing contract permits adding it. This category will be strongest for prospectively maintained time/material/ÄTA records, not legacy data.
- **LIKELY UNBILLED:** completed project plus signed ÄTA or unbilled material where source flags are present but manual invoice inclusion cannot be excluded.
- **NEEDS REVIEW:** completed project with no project-linked invoice, signed ÄTA on an active project, unknown amount, legacy/manual invoice ambiguity, or incomplete source data.

The current detector labels signed ÄTA on active projects as earned and treats completed-project/no-linked-invoice as a finding. Those are useful review signals, not proof of forgotten revenue.

## Smallest credible V1

1. Produce a stable finding containing tenant, kind, rule/version, confidence, project/customer/source IDs, evidence text, detected amount, and detected time.
2. Present a “Granska” queue, not a promise that the amount is forgotten or recoverable.
3. For one supported class, open the existing source-appropriate draft preview:
   - fixed-price/final invoice: quote plus signed ÄTA;
   - T&M material/time: selected uninvoiced source rows;
   - never blindly combine quote total, all time, all materials, and ÄTA.
4. On draft creation, link the finding to the invoice and source rows. Preserve retry idempotency and prevent a second invoice from the same finding.
5. Track separate outcomes: identified, reviewed, dismissed with reason, drafted, sent, paid. “Recovered SEK” is not the detector amount; report invoiced and paid amounts separately.
6. Measure false-positive rate and the share caused by missing project/source linkage. Use that evidence to decide whether a broader cross-project view is justified.

**Definition of done:** at least one real pilot case is reviewed and converted to a correct invoice draft; no fixed-price/T&M double charge is possible in the supported path; repeat execution creates no duplicate; tenant and permission tests pass; the result can be followed to invoice and payment; the owner can dismiss an incorrect finding with a reason.

# 8. Offer-to-Reality verdict

**Recommendation: BUILD AFTER the first Revenue Recovery evidence, as Aggregate Outcome Quality V1—not as line-level intelligence or automatic pricing.**

| Comparison | Current readiness | Minimum prerequisite |
|---|---|---|
| Quoted vs actual labor hours | Partial | Count hours only for genuine time units; ROT/RUT eligibility alone must not turn quantity into hours. |
| Quoted vs actual labor cost | Partial | Internal cost completeness already exists; persist it and exclude incomplete rows from learning. |
| Quoted vs actual material | Weak/partial | Establish whether `supplier_invoices` and `project_material` represent distinct or overlapping purchases; record source coverage. |
| Subcontractors | Manual only | Preserve explicit `project_cost` category and completeness; no automatic claim. |
| Project duration | Not frozen meaningfully | Define start/end semantics and persist duration only when both are trustworthy. |
| Invoiced amount | Partial | Improve/backfill project/source linkage; distinguish local and Fortnox-imported invoice truth. |
| Realized margin | Not reliable | Use invoiced revenue for realized margin, expected contract revenue for forecast margin, and label them separately. Require complete costs. |

## V1 prerequisites and slice

- Declare `computeProjectEconomics` the calculation source for new outcomes; prevent legacy profitability output from feeding learning until reconciled.
- Add calculation version, quote-source type, source counts, completeness flags/reasons, and computed/closed timestamps to the frozen representation. The exact storage change should be feature-owned, not a generic Outcome Store.
- Add a reconciliation job or admin-safe backfill for missed best-effort freezes. Record failures visibly instead of relying only on console logs.
- Detect or exclude possible material duplicate-count cases.
- Recompute historical outcomes when a calculation version changes; do not silently overwrite the meaning of old rows.
- Gate pricing suggestions on minimum comparable sample size and outcome completeness.

**Definition of done:** every newly completed eligible project either has a versioned outcome or a visible failure reason; outcome coverage and completeness are measurable; known ambiguous rows are excluded from advice; fixtures cover fixed-price, hourly, mixed, ÄTA, missing labor cost, material overlap, and invoice-link gaps.

Line/section mapping, Job Genome, automatic quote adjustment, and graph storage remain later work.

# 9. Promise Ledger verdict

**Recommendation: DEFER as a roadmap product. If pilot evidence moves it up, start with explicit promises and two reliable sources—not broad AI extraction.**

Current source readiness:

- **Customer portal:** strongest; customer/project IDs and message direction are explicit.
- **SMS:** message logs exist, but some conversation views rely on mutable phone-number matching and not every message has project context.
- **Email:** conversations can carry customer/lead context, but project linkage and thread coverage vary.
- **Calls:** recordings/transcripts/summaries exist, but capture consistency, consent, retention, and entity linkage are not proven.
- **Notes/project activities:** useful as source references, but free text has no promise semantics.
- **Customer timeline:** an aggregate read model over many stores, not a canonical evidence ledger.

The smallest useful V1 would be a user-created promise on a customer/project with due date, owner, status, and a link to an outbound portal message or customer-linked SMS. Optional AI may suggest a promise, but the user confirms it. Start with reminders and fulfillment state. Exclude calls and email extraction until identity, consent, retention, source immutability, and evaluation are proven.

Prerequisites are reliable source IDs, project/customer attribution, GDPR retention/deletion behavior, permission tests, and a measured pilot problem. Do not market a broad Promise Ledger from the existing timeline.

# 10. Project Autopilot verdict

**Project Autopilot is a product label over multiple domain capabilities, not one epic or one giant agent. Keep it out of the active 90-day build.**

| Capability | Current reality | Roadmap treatment |
|---|---|---|
| Unbilled work | Detector exists; action loop and confidence do not | Revenue Recovery V1 now owns it. |
| Margin risk | Two economics paths; quality gaps | Build only after Outcome Quality V1. |
| Schedule risk | A health score uses dates, time, and progress; no constraint model or reliable durations | Later domain detector after duration data. |
| Missing documentation | Photos, checklists, documents, reports exist but no common completeness rule | Later, per trade/workflow. |
| Customer communication | Many channels exist; no promise/evidence contract | Later, after source attribution and pilot demand. |
| Missing action | Notifications/approvals can express it | Ship narrowly inside each domain, not a generic agent. |
| Promise risk | No reliable promise substrate | Behind Promise V1, if ever prioritized. |

The existing `project-ai-engine.ts` is **PARTIALLY IMPLEMENTED**, not an Autopilot foundation to expand blindly. It equates hours consumed with progress, compares project revenue budget with billable-time amount in health calculations, can emit repeated critical notifications, swallows dispatcher errors, and is called by a fail-open cron. Quote-to-project creation also overlaps newer dedicated creation helpers. Harden or retire individual consumers when touched; do not refactor the whole engine as a roadmap epic.

# 11. Decision Replay verdict

**Recommendation: capture minimum fresh decision metadata on new consequential AI proposals; defer Replay as a product and defer a Decision Store table.**

Current coverage:

| Field | Current state |
|---|---|
| Model | Stored in `_decision` on a few paths |
| Prompt/version | Stored on a few paths |
| Inputs | Only normalized input hash; raw input remains in domain/approval data when available |
| Evidence | Not a stable contract |
| Output | Present in proposal payload, not hashed/version-linked consistently |
| Confidence | Available in some agent outputs, not a decision-record requirement |
| User response | Present through approval status/edit/reject and learning events |
| Final action | Execution result is persisted for approval executions |
| Business outcome | Fragmented or absent; recovered-revenue attribution is heuristic |

Minimum additions when the next AI workflow is built:

- model and actual prompt key/version;
- normalized input hash and stable source/evidence references;
- output hash or proposal ID and confidence;
- proposed action type and policy/risk classification;
- approval/edit/reject actor and time from existing approvals;
- execution result/target entity from the existing payload result;
- feature-local business outcome link.

Revenue Recovery and Karin obligations are deterministic. They need rule/version/evidence, not fake model/prompt records. Replay UI, raw prompt archives, counterfactual simulation, a universal decision table, and graph relationships are NOT NOW.

# 12. Karin / Economic Copilot verdict

**Karin should be the owner-facing economic agent and prioritization surface, but not the owner of every economic data model or editing screen.**

The correct architecture is:

```text
Domain systems remain authoritative
  invoices / payments / Fortnox / supplier invoices / projects / obligations
                              │
                              ▼
Karin reads trusted facts, explains priorities, and proposes bounded actions
                              │
                              ▼
Human approval or earned per-action policy → domain service executes → outcome tracked
```

Recommended capability sequence:

1. **Now:** truthful business obligations and reminder semantics.
2. **Next:** receivables and Revenue Recovery findings, linking back to invoice/project screens.
3. **After source proof:** margin intelligence from complete versioned project outcomes.
4. **After licensed feeds:** payables and two-sided cashflow using supplier/AP and transaction data.
5. **Much later:** bounded economic recommendations with earned autonomy per action.

Invoices, Fortnox connection management, supplier-invoice editing, and detailed project economics deserve their existing domain surfaces. Karin is the cross-domain owner cockpit and conversational explanation layer, not a duplicate ERP dashboard. There should be no separate “Economic Copilot” persona or competing home page.

# 13. Commercial sanity check

Wave 1 items ranked by direct owner outcome, while preserving the non-negotiable security gate:

| Rank | Item | Owner-visible outcome | Commercial interpretation |
|---:|---|---|---|
| 1 | Invoice delivery-state truth | No invoice says “sent” when the customer did not receive it; fewer late payments and embarrassing follow-up | Immediate cashflow and trust protection |
| 2 | Missed-revenue/ÄTA state correctness | Fewer duplicate-billing suggestions and a detector that actually runs | Necessary foundation for recoverable SEK |
| 3 | Karin reminder safety | Acknowledging a card cannot silently hide a statutory deadline; the owner can undo | Deadline/risk avoidance; protects Karin trust |
| 4 | Approval action truth | “Approve” either performs a documented action, opens review, or clearly acknowledges—never a silent no-op | Reduces admin confusion and enables safe autonomy |
| 5 | Tenant/RLS and role isolation | Employees and other tenants cannot access or mutate financial/project records they do not own | Not a sales feature, but a stop-the-line condition for any paying business |
| 6 | Cron/migration/operations verification | Scheduled reminders, payment sync, and detectors actually run | Prevents invisible product failure |
| 7 | Automatic targeted CI/contracts | Fewer regressions on money paths | Indirect value; accelerates safe delivery |
| 8 | Event-name guard | Automation rules stop drifting from callers | Architectural leverage, weak standalone customer value |

The pilot walkthrough remains the highest-information no-code action: observe one owner completing quote→project→work→invoice→payment, and inspect real Fortnox/migration/cron state. It is a gate and discovery activity, not a product epic.

Wave 2's commercial proof must be: identified SEK, reviewed SEK, invoiced SEK, paid SEK, time-to-invoice, and false-positive rate. “AI insights generated” or “events captured” are not commercial outcomes.

# 14. Missing risks

## Security

- Permissive repository RLS plus direct browser mutations on project/financial tables is a larger tenant risk than the synthesis's single monthly-review override. Production policy state must be inspected because SQL is manually applied.
- `business_config` combines broadly consumed company settings with Fortnox access/refresh tokens. Repository policy/grant protection is not demonstrable. Verify that browser roles cannot select credential columns; do not broaden Karin reads with `select('*')` patterns.
- Service-role routes must always derive tenant from authenticated context and verify target ownership. Revenue actions need `create_invoices`; financial findings need `see_financials` or owner/admin policy.
- Existing approval routing defaults many rows to `any`; monetary actions require an explicit role bucket and server-side check.

## Data integrity

- Invoice creation followed by source-row marking is not atomic. Reconciliation is required even if a global outbox is deferred.
- Nullable/historical `invoice.project_id` and absent source-line links create false leakage findings.
- Material purchases can be represented in both supplier invoices and project materials.
- Manual migrations and fallback behavior can cause code and production schema to disagree.
- Deletion/cascade behavior for future finding/evidence links must preserve required financial audit while honoring GDPR; do not duplicate communication bodies into new stores without retention rules.

## Testing

- There is no automatic CI gate. Existing Playwright and agent workflows are manual-only.
- Pure facit tests validate algorithms but do not prove PostgREST column names, route auth, migration presence, side effects, or cross-tenant isolation.
- The proposed “every cron/handler synthetic row” suite is too broad. Add tests with each shipped money transition.

## Operations

- `vercel.json` schedules 36 cron invocations through 34 route files, including 15-minute and two-hour schedules. Repository instructions warn that sub-daily Vercel cron requires an appropriate plan. Verify deployment plan and actual execution history.
- Many background paths log and continue. Wave 1 needs visible success/failure counts, last-success time, and actionable alerts for invoice delivery, missed-revenue sweep, Karin reminders, Fortnox payment sync, and outcome freeze.
- A cron HTTP 200 with per-business errors must not be treated as successful operation without metrics.

## AI reliability

- Model calls remain distributed across many modules, while `_decision` covers only three producer modules. Consequential AI changes need fixture evals and decision stamping when touched.
- Revenue detection, calendar rules, auth, invoicing, and economic arithmetic must remain deterministic. AI may explain or rank; it must not decide financial truth in V1.

## Financial correctness

- “Expected revenue,” “invoiced,” “paid,” and “recovered” are distinct states and must never be presented as one number.
- Signed ÄTA does not necessarily mean performed work; a completed project without a linked invoice does not prove no invoice exists.
- Fixed-price, T&M, and mixed contracts require different invoice composition. A universal aggregator is unsafe.
- Fortnox customer-invoice data is not a substitute for supplier/AP or bank transactions.

## Minimum Wave 1 test and observability matrix

| Wave 1 item | Minimum tests | Observability |
|---|---|---|
| RLS/tenant gate | Integration tests with two authenticated tenants for select/insert/update/delete on `project`, `project_change`, `project_material`, `time_entry`, `supplier_invoices`, and relevant `business_config` fields; role tests for financial/invoice actions | Denied-operation counts without PII; production policy snapshot recorded with migration verification |
| Cron auth | Unit test for one fail-closed verifier; route tests for absent env, no header, `Bearer undefined`, wrong secret, and valid secret | Last run, scanned tenants, succeeded/failed tenants, duration |
| Monthly-review tenant fix | Integration test that body `business_id` cannot select another tenant; permission regression | Actor, tenant, requested month; no cross-tenant IDs in response/log |
| Invoice delivery truth | Unit state-transition tests; integration delivery success/failure/partial-channel tests; idempotent retry; tenant/permission test | Attempt/result per channel, final state, retry count, correlation ID |
| ÄTA/source marking | Unit economic cases; integration invoice→source-link transition; failure-between-writes reconciliation; repeat completion produces one invoice | Invoice/source mismatch count and reconciliation result |
| Karin acknowledgement | Unit semantics/expiry/pruning; route role/tenant tests; reminder cron test proving acknowledgement/snooze/fulfillment differences; idempotent repeat | Reminder suppressed reason, actor/time, next reminder, undo |
| Approval action contract | Static producer/type coverage; integration for one execute, one review, one acknowledge, and unknown fail-closed; CAS/idempotency regression | Unclassified type count, execution failures, retries, actor/result |
| Event registry | Static caller/seed/registry test | No runtime system required |
| CI gate | Typecheck/build as feasible plus selected pure/static suites on every change | Required check visible on pull request |

No AI eval is required for deterministic Wave 1 fixes. Economic correctness fixtures are mandatory for invoice/source transitions. AI evals begin only when a model-generated economic recommendation enters scope.

# 15. Parallelization plan

First rule: the current working tree already modifies `app/api/cron/missed-revenue/route.ts` and `lib/projects/auto-invoice-on-complete.ts` and adds `tests/column-contract.spec.ts`. Finish, review, and merge that work before another branch touches those files. The separate hygiene task remains out of scope.

| Workstream | Owner | Branch/worktree boundary | Allowed files/domains | Forbidden overlap | Dependency | Merge order | Reviewer |
|---|---|---|---|---|---|---:|---|
| Current in-flight money corrections | Existing owner | Existing worktree only | The two currently modified production files and the new column contract test | Karin, RLS, central approval handler, new roadmap feature work | None | 1 | Independent cross-review |
| Production security inventory + targeted hardening | Codex | `codex/wave0-tenant-cron-gate` in a clean worktree | New verification tests; one new migration lane; monthly-review and cron-auth helper/routes; direct-write ownership/API boundaries selected by the audit | `lib/karin/**`, Revenue UI/rules, invoice composition, `app/api/approvals/[id]/route.ts` | Production policy snapshot and migration-number reservation | 2 | Claude for workflow impact; independent DB review for SQL |
| Karin reminder safety | Claude Code | `claude/karin-reminder-safety` in a clean worktree | `lib/karin/**`, `app/api/karin/**`, Karin deadline cron, Karin page/components, Karin-only tests | `business_config` migration lane, Revenue files, central approval execution | Product semantics agreed; may run parallel with security if file locks hold | 3 | Codex for failure states and reproducibility |
| Contract tests + narrow CI gate | Codex | `codex/wave1-contract-ci` | New event/approval contract tests, root workflow changes, test documentation | Production handlers, Karin, migrations, Revenue implementation | Current in-flight types merged so the contract baseline is stable | 4 | Claude for intended action classifications |
| Approval semantics remediation | Claude Code | `claude/approval-action-truth` | Explicit classification/copy/handlers for known action/review/ack types; approval UI as required | Revenue detector, Karin files, SQL migration lane | Contract inventory merged; product meaning decided | 5 | Codex for fail-closed and idempotency review |
| Revenue Recovery V1 product slice | Claude Code | `claude/revenue-review-v1` | `lib/value/missed-revenue*`, missed-revenue route after in-flight merge, a dedicated Revenue Review API/UI, source-specific adapter to an existing invoice preview | Generic invoice rewrite, project economics, Karin internals, event platform, central migrations unless reserved | Security, action contract, and current money fixes merged | 6 | Codex for data lineage, tenant, idempotency, and financial edge cases |
| Revenue regression/outcome instrumentation tests | Codex | `codex/revenue-v1-verification` | New tests/fixtures and feature-local observability; no production semantics without handoff | Same production files while Claude branch is open | Revenue API/payload contract frozen or merged | 7 | Claude for customer semantics |
| Aggregate Outcome Quality V1 | Codex backend; Claude UI/copy only after backend contract | Separate sequential worktrees, not simultaneous edits | Codex: economics/freeze/reconciliation/tests. Claude: existing outcome UI after backend merge | No concurrent edits to `compute-economics.ts`, `freeze-outcome.ts`, quote derivation, or the same migration | Revenue pilot evidence and source-quality findings | 8+ | Cross-review both directions |

Additional collision rules:

- One migration author and one reserved migration number at a time.
- `app/api/approvals/[id]/route.ts`, `lib/invoices/create-invoice.ts`, `business_config` schema, and shared auth helpers are serialized integration points.
- Never let two branches invent finding/action/outcome payloads independently. Freeze the contract before parallel test/UI work.
- A workstream may consume only merged dependencies, not another agent's unmerged worktree.

# 16. NOT NOW corrections

## Correctly deferred

- Durable general event journal and outbox
- Full Outcome Graph and graph database
- Job Genome beyond versioned aggregate outcomes
- Company Model service/new table
- Broad Fortnox finance/AP feed until licenses, scopes, consent, and pilot need are proven
- Promise Ledger as a broad multi-channel extraction product
- Project Autopilot as a product/agent
- Constraint-aware scheduling solver
- Trade Packs before repeatable multi-customer demand
- Homeowner Twin
- Broad Supplier Intelligence
- Handymate Protocol
- Autonomy Marketplace
- Verified Contractor Passport
- Margin Insurance/risk underwriting
- Generalized computer vision/evidence classification
- Universal policy DSL and generic Evidence Store

## Should move up

- Production RLS/policy verification and hardening for the financial/project tables touched by the roadmap
- Karin acknowledgement/reminder safety
- Approval producer-to-action contract and unknown-type fail-closed behavior
- Feature-local finding→invoice→payment lineage and false-positive reasons
- Narrow automatic CI/contract gate
- Invoice/source reconciliation for non-atomic writes

## Missing from NOT NOW

- A universal time + material + quote + ÄTA invoice builder
- Autonomous Revenue Recovery execution or sending
- General `CalendarEvent` extraction from Karin
- “Fulfillment” inferred from a checkbox without evidence
- Replay UI/counterfactual simulator
- Raw all-channel communication ingestion for promises
- Full refactor/centralization of all direct Anthropic calls
- A second Economic Copilot UI
- Broad financial transaction/cashflow claims based only on invoices

Feature-local retry and reconciliation must **not** be deferred with the global outbox. Those are required wherever Wave 1 or Wave 2 can create, send, or attribute money.

# 17. Required roadmap changes

1. Expand Wave 0 from three route findings into a production tenant-policy and cron-auth gate for the exact financial/project tables and jobs used by the roadmap.
2. Record the current missed-revenue and ÄTA fixes as in-flight/outdated synthesis findings; merge and verify them before new work touches those files.
3. Move Karin reminder/acknowledgement truth from Wave 3 into NOW. Keep true filing fulfillment as a later, evidence-backed epic.
4. Replace “every cron and handler synthetic smoke test” with targeted route/integration tests plus static column, event-name, and approval-action contracts.
5. Add a narrow automatic CI merge gate; manual-only workflows are not sufficient for parallel roadmap execution.
6. Reclassify the approval queue as partial. Inventory producer types, classify execute/review/acknowledge behavior, and fail closed for unclassified executable actions.
7. Correct the autonomy claim: downgrade is not universally automatic after autonomy is granted. Document and test behavior per allowlisted action.
8. Split Revenue Recovery into detection/review, one source-specific draft action, and outcome attribution. Remove the universal time+material+ÄTA route from V1.
9. Require `CONFIRMED UNBILLED`, `LIKELY UNBILLED`, and `NEEDS REVIEW` semantics; do not call detector amounts forgotten or recovered revenue without evidence.
10. Keep Revenue Recovery human-reviewed in V1 and enforce financial/invoice permissions and tenant ownership at execution.
11. Track identified→reviewed→drafted→sent→paid separately, including dismiss reasons and a stable source/finding link. Do this feature-locally, not through a generic Outcome Store.
12. Reframe Offer-to-Reality as Aggregate Outcome Quality V1: canonical semantics, version, completeness, material-duplication handling, visible reconciliation, and gated learning.
13. Do not move organisation-number/business-day/calendar utilities merely for theoretical reuse. Require a concrete second consumer and matching semantics.
14. Preserve the static event-name guard but do not make a durable event journal a prerequisite for the first Revenue Recovery pilot.
15. Verify production migrations, RLS policies, Fortnox scopes, cron execution, and deployment plan before claiming a code path operational.
16. Use Karin as the owner-facing economic agent while retaining invoices, Fortnox, payables, projects, and obligation data in their domain services and screens.

# 18. Final recommended sequence

## NOW — weeks 1–3: make current facts and boundaries true

1. Finish and independently review the in-flight missed-revenue column and ÄTA invoice-link corrections.
2. Inventory production schema/RLS/grants; harden and test tenant/role access for the touched project and financial tables; close monthly tenant override and all fail-open/guessable cron auth.
3. Fix invoice delivery-state truth and add source/invoice reconciliation for partial failures.
4. Correct Karin acknowledgement/snooze/undo semantics so reminder suppression is explicit and reversible.
5. Establish approval action classification and fail-closed handling for actionable cards.
6. Add targeted column/event/approval contracts and a narrow automatic CI gate.
7. Run the pilot golden path and verify real cron, migration, Fortnox, and delivery behavior. Record factual gaps before expanding scope.

## NEXT — weeks 4–8: prove one recoverable-money loop

1. Ship confidence-aware Revenue Review findings with evidence and dismiss reasons.
2. Support one source-specific, human-reviewed invoice-draft path using an existing builder; no universal aggregation and no autonomous send.
3. Persist feature-local finding→invoice→payment lineage and report identified, invoiced, and paid SEK separately.
4. Measure false positives, time-to-invoice, and at least one real pilot outcome. Expand to a second source class only if the first is correct and used.

## AFTER EVIDENCE — weeks 9–13 and later

1. Build Aggregate Outcome Quality V1: canonical/versioned calculations, completeness, reconciliation/backfill, and learning gates.
2. Let Karin surface trusted receivables, recovery, and margin priorities by linking to domain actions; do not duplicate domain screens.
3. Decide from pilot data whether to expand Revenue Recovery sources, add a company-profile read contract, or start a manual/two-source Promise Ledger.
4. Keep broader moats deferred until their stated data and customer-demand gates are met.

This sequence produces immediate safety, one measurable commercial loop, and proprietary outcome data without committing Handymate to a premature platform.

# 19. Final statement

> READY FOR ACTIVE_ROADMAP: YES WITH CHANGES
