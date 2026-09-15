# Trygg överlämning — Codex brief H1–H4

> Written 2026-09-14 by Claude after Codex's product assessment ("Jag lämnade över jobbet, och Handymate
> tog det vidare") and a read of production. Companion to `CUSTOMER_VALUE_PACKAGE_LOG.md` (money and
> time honesty) and `FINANCIAL_KERNEL_PACKAGE_LOG.md` (the intent pattern H3 reuses). Same rules as
> those logs: handoff block back under §Handoffs, Claude reviews against orchestration §6 A + B.

## 0. Why these four, and why before "trygg överlämning" is built as a surface

Codex's priorities 1 (first real job) and 2 (handover receipt) are right. But a receipt that says
"teamet gör härnäst" is only honest if the work actually continues after the customer lets go.
Today it structurally does not, for three reasons that are independent of customer volume:

| Signal (production, last 60 days, test and pilot companies — structure, not statistics) | What it means |
|---|---|
| Cards closed: approved 82, **expired 79**, rejected 38. Median time to a decision when one is made: 0.3 h. Pending cards' median age today: 6.8 days. | People decide fast when they decide. Cards nobody answers die silently. Expiry equals approval in volume. |
| Expiry share by type: publish_microsite 90 %, checklist_forslag 73 %, automation 64 %, send_sms 62 %. | Several "approvals" are not decisions at all; the customer has nothing to lose by not answering, so they don't. |
| Autonomous (earned) successes: **0**. `STREAK_TARGET = 15` approvals of one type per business inside `WINDOW_DAYS = 60`. | The mechanism that would make "Handymate tog det vidare" true is unreachable at craftsman volumes. |
| Automation logs: 521 success, **290 failed**, 41 skipped. Top causes: 46elks "Not enough credits" (38), SMS service unavailable (14), "Agent-köning misslyckades" (14), `lead_id` missing in context (13), `RESEND_API_KEY` not configured (8), push with no recipient (3). Morgonrapport: 198 failed vs 180 success. | Failures are configuration and plumbing, not customer data. With real customers this is the worst case: the customer believes the job went on, it did not. |

The volumes are small and mostly ours. The shapes are not.

## 1. Package board

| Package | What | Owner | Status | Blocked on |
|---|---|---|---|---|
| H1 | Never a silent expiry: notices vs decisions, expiry becomes a visible summary, three decisions a day | Codex | **done 2026-09-15** (PR #81 merged `263ce4a5` after the three MEDIUM fixes; v248 applied and verified) | `HANDOFF_INBOX_ENABLED` on the pilot; native Ja/Nej in push still open |
| H2 | Autonomy for the four allowlisted keys after one explicit onboarding consent, supervised by the daily digest, one-tap off | Codex | **done 2026-09-15** (PR #81; explicit one-shot consent, four keys supervised, off with 30-day cooldown and revocation trigger) | `SUPERVISED_AUTONOMY_ENABLED` + `AUTONOMY_OFF_SECRET`; cancel-on-off of queued sends lands with H3b (v249) |
| H3a | Channel pre-flight: no card and no send without a working channel; the home screen says what is missing | Codex | **done 2026-09-15** (PR #78 merged `c09364e7` after M1 fix: failed provider check no longer cached, six new tests; 305 tests + tsc green locally, CI 13/13; v246 applied to production and verified) | activation: `CHANNEL_PREFLIGHT_ENABLED` on pilot; optional `RESEND_PREFLIGHT_API_KEY` if the production Resend key is sending-only |
| H3b | Durable outbound promises: `outbound_intents` modelled on `financial_effect_intents` for SMS, e-mail and push | Codex | **ready — [H3B_OUTBOUND_INTENTS_BRIEF.md](H3B_OUTBOUND_INTENTS_BRIEF.md)**; Claude drafted `sql/v249_outbound_intents.sql` and proved it in PGlite (43/43) 2026-09-15 | #81 merged (v249 replaces v248's `stop_supervised_autonomy`) |
| H4 | Morgonrapporten delivers or says why: root cause of `run_agent` failures, one retry, its own driftlarm line | Codex | **done 2026-09-15** (PR #78; root cause 198/198 credit errors; seeded rule delivers the deterministic brief without the LLM, one retry via cron `*/10`, own driftlarm line; v246 `morning_report_runs` applied) | activation: `MORNING_REPORT_RELIABILITY_ENABLED` on pilot |

Order: H3a and H4 first (they decide whether the customer can trust anything), then H1 and H2 together.
Codex's own priority 1 (first real job) runs in parallel; its single metric is in §7.

## 2. Read first

`lib/autonomy/earned-autonomy.ts` (allowlist, streak, offer cards, revoke, auto-downgrade),
`lib/automation-engine.ts` (`executeRule`, `earned_autonomy` context, `handleRunAgent`, `handleSendSms`),
`app/api/cron/maintenance/route.ts` (expiry sweep), `app/api/cron/missed-revenue`, `quote-follow-up`
and `app/api/agent/trigger/tool-router.ts` (per-type expiries), `lib/approvals/skapa-kort.ts`,
`lib/sms/klarsprak.ts` (error classes incl. `saldo`), `lib/sms/saldo.ts` (46elks balance),
`lib/observability/credit-watch.ts` and `driftlarm.ts`, `app/api/cron/push-morgon` and
`lib/notifications/tyst-tid.ts` (morning summary, quiet hours), `sql/v239`–`v240`
(`financial_effect_intents`, claim/finish/unknown/sweep/resolve) and `sql/v241` (value events:
`opportunity_identified/acted/dismissed` are already produced by triggers on `pending_approvals`).

## 3. H1 — Never a silent expiry

### Claude decisions

| Decision | Why |
|---|---|
| **Two kinds of card, declared per type: `decision` and `notice`.** A `decision` needs the customer (money, a customer-facing send, a commitment). A `notice` is information Handymate prepared (checklist, microsite draft, team intro, debrief, deadline note). Notices never expire into nothing: they live in *Inkorg* without a deadline, and a notice older than 30 days is folded into a monthly "Vi la det åt sidan" line, never deleted. | Expiry data shows the high-expiry types are notices. Asking for approval where nothing is at stake trains the customer to ignore cards. |
| **A decision that reaches `expires_at` is reported, not dropped.** Status still becomes `expired` (v241's trigger already writes `opportunity_dismissed`), but the sweep collects the day's expiries per business and the next morning push carries "3 förslag fick inget svar" with the three titles and one link. `payload.expiry_reported_at` marks it. Per-type expiries (missed-revenue, quote-follow-up, tool-router) route through the same collector. | The customer must learn what Handymate stopped doing on their behalf. Today the only trace is a log line. |
| **Three decisions a day.** The morning push (existing `push-morgon` / `tyst-tid`) shows at most three open decisions. Cards with a deadline come first: soonest deadline, then highest money, then age. Never-expiring internal gates fill any remaining slots by age; the rest wait. A decision is answerable from the push with "Ja / Nej" where the card type supports it (start with `send_sms` and `invoice_reminder`). | Median pending age 6.8 days says the pile is the problem, not the decisions. Old internal gates must not occupy all three slots forever while customer sends approach their deadline. The craftsman's channel is the phone. |
| **Expiry windows are explicit per type, never a default.** Money and customer-facing sends: 7 days. Autonomy offers: 14 days. Notices and internal work gates: none. The fourteen internal gates are `four_eyes_quote`, `four_eyes_project_close`, `review_auto_invoice`, `time_attestation`, `tidrapport_forslag`, `checklist_forslag`, `egenkontroll_foto`, `egenkontroll_avvikelse`, `job_report`, `lead_review`, `installation_register`, `manual_project_create`, `project_debrief`, `karin_deadline`. | Owner decision (Andreas, 2026-09-15): silently dropping a four-eyes check or statutory acknowledgement is worse than an old open card. A new type must not silently inherit seven days. |

### Scope

```text
lib/approvals/card-kind.ts                 (CARD_KIND: Record<approval_type, 'decision' | 'notice'>; a type missing from the map is a build error via the contract test)
lib/approvals/expiry.ts                    (expiryFor(type) → days | null; collectExpired(business, day) → summary; markReported)
app/api/cron/maintenance/route.ts          (uses expiryFor; writes the per-business summary; per-type crons call the same collector)
lib/notifications/morning-decisions.ts     (pure: pick ≤3 decisions, order rule; expiry summary block)
app/api/cron/push-morgon/route.ts          (adds the two blocks; unchanged quiet-hours logic)
app/dashboard/approvals/page.tsx           (Inkorg tab for notices; "Vi la det åt sidan" monthly line)
tests/card-kind-contract.spec.ts           (every approval_type in the codebase is classified; notices have no expires_at)
tests/expiry-never-silent.spec.ts          (an expired decision is in the next morning push exactly once; per-type crons included)
tests/morning-decisions.spec.ts            (≤3, ordering, quiet hours untouched)
```

### Invariants

1. Every `approval_type` that can be created is classified `decision` or `notice` and has an explicit `7 | 14 | null` expiry entry; the contract test lists them by scanning `skapaKort` callers and `tool-router`.
2. A `notice` is never created with `expires_at` and is never set to `expired` by any cron.
3. Every `decision` that becomes `expired` appears in exactly one morning push summary for its business, within 24 h, and carries `payload.expiry_reported_at` afterwards. A card already reported is never reported again.
4. The morning push never lists more than three decisions; when more are open it says how many wait. A decision with a deadline always outranks a never-expiring internal gate, however old the gate is.
6. `expiryFor(type)` is explicit per type — days or `null`. A type missing from the map is a build error via the contract test, never a silent 7 days, and the same split is mirrored in the migration's normalising trigger.
5. v241's producers are untouched: an expiry still yields exactly one `opportunity_dismissed`.

## 4. H2 — Autonomy on from day one, supervised

### The owner decision (taken 2026-09-15)

> **Owner decision (Andreas, 2026-09-15): no implicit default-on.** Onboarding asks one explicit, concrete consent for the four allowlisted actions ("Får Handymate skicka fakturapåminnelser, bokningspåminnelser, offertuppföljningar och recensionsförfrågningar åt dig? Du ser varje utskick i morgonrapporten och kan stänga av med ett tryck."). A yes grants the four keys in `supervised` mode with `source: 'consent'`; a no leaves today's offer-card path untouched. Existing businesses get the same consent card once. Turning off is one tap and immediate.

Consequences for the scope below: `source` gains the value `'consent'` and `'default'` is not used; `grantDefaults` becomes `grantOnConsent(business)` called from the onboarding consent step (and from the one-time consent card for existing businesses), never from business creation alone. `STREAK_TARGET` stays as the supervised → earned path. Everything else in this section stands.

### Claude decisions

| Decision | Why |
|---|---|
| **Grant state gains a mode:** `earned_autonomy[key] = { granted: true, mode: 'supervised' | 'earned', since, source: 'default' | 'offer' | 'streak' }`. Supervised means every autonomous action is listed in the next daily digest with its outcome and a one-tap *Stäng av*. `earned` is reached by the existing streak and drops the per-action listing to a count. | Trust is built by seeing the work, not by withholding it. The streak stays meaningful as the path from supervised to quiet. |
| **Allowlist unchanged (four keys). No new type gets default-on without a new brief.** | The four are reversible messages with a known template; nothing else is. |
| **Every autonomous send goes through H3a pre-flight; a failed pre-flight downgrades to a card, never a silent skip.** | "On by default" without a channel check would multiply today's credit failures. |
| **Off is immediate and sticky:** the customer's *Stäng av* writes `granted: false, source: 'customer'`, cancels pending intents of that key (H3b) and never re-offers for 30 days (existing cooldown). Rejection of a supervised action does the same (existing auto-downgrade). | Reversibility is what makes default-on defensible. |
| **Digest copy** (Swedish, no internal terms): "Karin skickade 2 fakturapåminnelser i går. Stäng av" · "Lars påminde 1 kund om bokningen." | The customer sees who did what; the off switch sits next to the fact. |

### Scope

```text
lib/autonomy/earned-autonomy.ts            (mode, source, default grant on business creation behind a dated flag; unchanged revoke/downgrade)
lib/autonomy/consent-grant.ts              (grantOnConsent(business) called from the onboarding consent step and the one-time consent card; idempotent)
lib/notifications/autonomy-digest.ts       (pure: yesterday's autonomous actions per key → lines; supervised lists, earned counts)
app/api/cron/push-morgon/route.ts          (digest block)
app/api/autonomy/off/route.ts              (one-tap off from push/mail: signed token, POST, immediate revoke)
components/dashboard/EarnedAutonomyPanel.tsx (shows mode; off switch)
tests/autonomy-consent.spec.ts             (consent yes → four grants supervised with source consent; consent no → nothing granted; existing business → consent card once; off → revoke + cancel + cooldown)
tests/autonomy-digest.spec.ts              (lines, counts, quiet hours)
```

### Invariants

1. A business that has answered yes to the consent step has exactly the four keys granted in `supervised` mode with `source: 'consent'`; a business that has not answered, or answered no, has no grant from this package.
2. An autonomous action never executes without a pre-flight pass (H3a) and is always logged with `earned_autonomy` and `autonomy_key` (exists) so v241 records `opportunity_acted`.
3. Every supervised action is listed in the next digest exactly once; earned actions are counted.
4. *Stäng av* revokes within the same request, cancels the key's pending intents, and blocks re-offer for 30 days; a rejected supervised action does the same (existing path).
5. The streak logic and the four-key allowlist are unchanged; `STREAK_TARGET` moves supervised → earned only.

## 5. H3 — Pre-flight and durable outbound promises

### 5a. Pre-flight (this package)

| Decision | Why |
|---|---|
| **`preflightChannel(business, channel)` → `{ ok, reason }`** for `sms` (46elks balance via the existing `lib/sms/saldo.ts` reader, cached 10 min per process; `ok` only if balance covers ≥ 1 SMS), `email` (`RESEND_API_KEY` present, sender verified), `push` (≥ 1 active subscription for the recipient). Pure decision on top of the readers; the readers are the ones credit-watch already uses. | The top failure causes are all knowable before the send. |
| **Two gates.** At card creation: a card whose action needs a channel that fails pre-flight is not created; instead one `notice` per business and channel per day: "SMS-saldot är slut — påminnelser är pausade tills det fylls på" with the top-up link. At execution: a failed pre-flight returns `skipped` with the reason class from `klarsprak`, never `failed`, and never a retry storm. | A promise Handymate cannot keep must not be made. |
| **Home screen banner** from the same function: the three channels with state, shown only when something is off. Copy in Swedish, no "token/API key": "E-post är inte inställd" with the settings link. | The customer should never learn about a missing channel from a failed job. |

Scope: `lib/channels/preflight.ts`, calls in `skapaKort`, `handleSendSms`/`handleSendEmail`/push sender,
`components/dashboard/ChannelBanner.tsx`, `tests/channel-preflight.spec.ts` (each channel, each gate, the
daily notice dedupe, the skip-not-fail path, no external call when cached).

Invariants: (1) no `send_sms` card is created while the balance is zero; (2) a send attempted with a
failing channel is logged `skipped` with a `saldo`/`konfiguration` reason, never `failed`; (3) one notice
per business, channel and day; (4) the banner and the notice are computed by the same function.

### 5b. Durable outbound promises (this package now has its own brief)

Written up in full, with the drafted migration and 43 proven checks, in
[H3B_OUTBOUND_INTENTS_BRIEF.md](H3B_OUTBOUND_INTENTS_BRIEF.md). In short: `outbound_intents` generalises
`financial_effect_intents` to SMS, e-mail and push, so every outbound message becomes a durable promise
before a provider is called. The customer-facing status ("Skickat 08:12", "Väntar på saldo", "Kunde inte
skickas") is read from that row, a lost acknowledgement becomes `unknown` rather than a second send, and
`stop_supervised_autonomy` cancels the queue in the same transaction as the revoke — which is what closes
H2's fourth invariant. The migration is `v249`, not the originally reserved `v247`, because it replaces a
function that v248 introduces.

## 6. H4 — Morgonrapporten delivers or says why

The most visible daily artifact failed 198 times against 180 successes in 60 days, with
"Agent-köning misslyckades" as the reported cause from `handleRunAgent` (orchestrator failure). Whatever the
volume, a coin-flip morning report is the first impression every day.

Scope: root-cause the `run_agent` failure path (queue vs orchestrator vs credits), make the failure class
explicit in the log's `error_message`, retry once after 10 minutes, and give it its own driftlarm line
("Morgonrapporten nådde inte 3 av 12 företag: köfel 2, kredit 1"). If a report cannot be delivered, the
customer gets a one-line push "Morgonrapporten kommer senare i dag" rather than nothing.

Invariants: (1) a failed report is retried exactly once; (2) every failure carries a class; (3) the
driftlarm line exists and counts per class; (4) no business goes without either the report or the
one-line notice.

## 7. The metric for Codex priority 1

Time from the first `opportunity_identified` to the first `opportunity_acted` per new business, read from
`value_events` (live in production since 2026-09-14). Report it in the handoff as the median and the count
of businesses over 15 minutes, never as "achieved" from fixtures.

## 8. Not in these packages

New autonomy types. Any change to what a card may do. Money or time figures (Customer Value log). The
kernel's own intents (unchanged). Native mobile (parity after web, as in the acceptance note of #75).

## 9. Handoff back

Same §7 block as the other logs, under a new §Handoffs here. Claude reviews H1–H4 against orchestration
§6 A + B; H3b gets a DDL draft and PGlite probe from Claude before Codex implements it.

## Handoffs

### 2026-09-15 — Claude: #81 merged, v248 applied (deployment state)

Re-reviewed on `e61d3d05`: the three MEDIUM are closed (backfill no longer shortens a live window, digest types stay
notices and keep their activity history, reminder outcomes classify correctly) and the owner decision is implemented as
an explicit per-type expiry axis that fails to compile when a new card type is added without a policy. Locally 435 tests,
the recovery harness and `tsc` green; CI 13/13.

`v248_handoff_inbox_consent.sql` applied to production via Supabase MCP and verified read-only: four tables with RLS and
no client grants, eleven SECURITY DEFINER RPCs with EXECUTE for service_role only (the two classification functions are
pure `IMMUTABLE` SQL, by design), all three triggers installed, 165 cards reclassified as notices, 15 pending internal
gates now hold no deadline, and **zero** pending cards sit past a deadline — so no batch expiry on the first maintenance
run. All four new tables are empty. Advisor: only the expected INFO (RLS enabled without a policy, the same shape as
every other service-only table); no new WARN. Both flags remain unset.



### 2026-09-15 — Claude: #78 merged, v246 applied (deployment state)

`v246_handoff_reliability.sql` applied to production via Supabase MCP after the merge and verified read-only:
`channel_notices` and `morning_report_runs` with RLS, `record_channel_notice` / `claim_morning_report` /
`finish_morning_report` SECURITY DEFINER with EXECUTE for service_role only, `morning_report_due` index, 0 rows,
10 seeded morning-report rules match the claim predicate. Advisor: no new WARN. Both flags unset.

One LOW for H3b's DDL: v246 revokes table privileges from PUBLIC/anon/authenticated but not from service_role,
so service_role keeps Supabase's default ALL on both tables (v244 revoked service_role too). The app only
writes through the RPCs, so nothing is exposed; tighten to SELECT,DELETE when H3b's migration touches these
tables. Review record: 1 MEDIUM (fixed on `c0859d92`), 6 LOW carried (execution-time `kontrollfel` is
fail-closed; missing-recipient copy on invoice reminders; `channel_notices` has no reader until H1; the
morning report no longer uses the LLM — owner informed; `[class]` prefix on all `run_agent` errors; numbering).


### 2026-09-15 — Codex H3a/H4 implementation for Claude review

**H2 recommendation: NO to implicit default-on customer sends at account creation.** Recommend one explicit, concrete onboarding consent for these four actions, then supervised mode, per-action digest and immediate off. A message already sent cannot be reversed. This is Codex's recommendation, not a claim that Andreas has accepted an owner policy. H2 and its alternative streak threshold have not been implemented in this package.

**Package / scope.** H3a automated-channel readiness and H4 the seeded V3 morning report. Built directly on main `4a334519`, independently of #75/#77. The brief's text above is carried from #76; only this handoff is added. H1 and H3b remain separate.

**Root cause, read-only production evidence (2026-09-15 UTC).** Grouping the last 60 days of `v3_automation_logs` for `rule_name='Morgonrapport'` found 198 failed, ALL containing Anthropic's insufficient-credit error, and 180 marked success. These 180 are historical agent success, not established report delivery. The generic `Agent-köning misslyckades` is not the root cause for this cohort. No production writes or real sends were made.

**Files / integration.** New `lib/channels/preflight.ts` and `approval-insert.ts`; common card creator, automation approval/execution handlers, central SMS/Resend/push senders, agent-tool queue and existing direct SMS/review/reminder card producers. Shared owner/admin API and `ChannelBanner` on home. `lib/automation/morning-report.ts`, strict mode on the existing morning-brief reader, a bounded retry cron and a separate driftlarm line. `lib/agent/orchestrator.ts` additionally scopes the existing idempotency lookup to business and no longer reports failed/running history as success. New tables are included in account erasure.

**DB/RPC.** v246 creates `channel_notices` (atomic unique business/channel/Swedish-day) and narrowly scoped `morning_report_runs` (business/day, attempt token, two-attempt ceiling, next-attempt time, persisted report/notice/outcome). Service-only commands `record_channel_notice`, `claim_morning_report`, `finish_morning_report`; anon/member access denied. No modification of financial intents, financial canonical events or value_events producers.

**Flags / rollout.** Both `CHANNEL_PREFLIGHT_ENABLED` and `MORNING_REPORT_RELIABILITY_ENABLED` default off. Apply v246 after review, check Resend domain-read access (optional `RESEND_PREFLIGHT_API_KEY` for a sending-only production key), enable in test/pilot and prove visible channel recovery/report delivery before broader activation. The new cron is configured every ten minutes and returns without work while its flag is off. Flags and server guards must remain enabled together for the combined acceptance. This PR does not switch any production flag or request provider credentials.

**Golden paths.** PGlite: notice races, tenant/RPC privileges, foreign rule, first claim, ten-minute eligibility, exactly one retry, stale token, interrupted-worker unknown, no blind redispatch, pause and deletion. Real module tests: SMS raw balance/multipart estimate and cache, exact verified Resend sending domain, recipient/tenant-targeted push, actual card insert blocked before DB write, email-only reminder channel selection, engine skipped result/log/stats, strict report + owner push, missing recipients with persistent notice, prepared-report reuse, unknown push, drift classes, route roles and a rendered home-banner recovery.

**Deliberate tightenings / limits to review:**
1. The 46elks balance is Handymate's global provider balance. The customer sees a pause and a support link, never an instruction to replenish our account. SMS readiness uses the existing versioned cost estimate (52 öre/part), not the older 35-öre warning estimate; actual execution uses normalized multipart count. A cached balance is a readiness check, never a reservation or delivery guarantee.
2. Push readiness means a usable stored token/subscription for the correct tenant/person, not proof that the phone will receive it. Expo can work without VAPID. Invalid-provider acknowledgements remain delivery failures; a readiness check alone cannot predict them.
3. A daily channel notice is an informational row in its own table, surfaced through the shared live home state. It is not an unanswerable approval. H1's inbox and monthly archival UI are not invented here. Failed notice persistence is logged, and the original send remains blocked.
4. The exact seeded system morning instruction is routed to the existing deterministic brief, with core query/cache errors made strict. This eliminates the proven credit dependency and avoids retrying an unconstrained tool-using agent. Custom instructions, other `run_agent` rules and the separate legacy agent-context SMS report are not rewritten. This scope distinction must be preserved in activation testing.
5. The report is available on the existing overview's team strip; the owner-targeted push contains only a link, no financial/customer details. `delivered` means provider-accepted notification, not device read. A prepared report is reused on retry. Paused/inactive/edited rules cancel a queued retry at claim.
6. “Every failure retried exactly once” is tightened to **at most one retry for a known failure, no earlier than ten minutes**. The cron cadence can add up to ten minutes. Ambiguous push responses and interrupted workers are `unknown`, carry visible status, and are NOT automatically resent. H3b's broader unknown-resolution workflow remains Claude's next DDL package.
7. Quiet hours use the existing `arTystTid`: work is deferred durably and does not consume the failure retry. If push itself cannot work, no implementation can guarantee a push notice. The persisted home notice and driftlarm cover that case. Copy promises a retry only while one remains; it never guarantees “later today” after the final failure. Database unavailability returns an explicit status-read error, not healthy/zero.
8. This is a provider-read gate for the specified automation paths, not a consolidation of every transport in the repository. Manual Gmail/Outlook transports keep their existing authorization/token checks; Resend-dependent automation checks must be pilot-tested alongside connected mailboxes. Existing consent, STOPP, quotas, approval and quiet-hours policies are not relaxed.

**§7 first-work metric (read-only, NOT an achieved target).** Cohort: businesses created in the last 60 days, including internal/test businesses. Four have `opportunity_identified`; zero have a valid first identified→acted timestamp pair, four have no acted event. Median is NULL/unavailable. Count over 15 minutes among completed pairs is zero because there are no completed pairs; do not interpret this as meeting the target. No fixture or client timer contributes to this result.

**Architecture / accounting.** Relies on the existing provider send boundaries, automation status/consent contract and orchestration §6 A+B and §7; records this package in ARCHITECTURE.md. Canonical financial events touched: none. Swedish reverse-charge/cash-basis/ROT/cut-over calculation changes: none. No accounting-policy or merchant-of-record decision made; no new human accounting approval needed for these operational changes. H2 owner decision stays open.

**Verification.** Detailed final command/CI results are recorded in the PR body. Production activation, actual iPhone receipt and real-customer pilot are not claimed by these tests.

### 2026-09-15 — Review M1 och basmerge mot main
Cache för 46elks/Resend behåller definitiva utfall men släpper kontrollfel och avvisade promises direkt. Nästa anrop gör en ny kontroll; en gammal misslyckad kontroll får inte radera en ny cachepost efter credential-byte. Sex nya prov: 503→200, avvisat anrop→200 och gammalt fel efter credential-byte, för båda leverantörerna. Tidigare samtidighets- och definitiva negativcacheprov kvarstår.

Main:s H2-ägarbeslut i §4 är aktuellt och har bevarats; den tidigare rekommendationen i handoffen ovan är historik. H2 implementeras inte i denna rättning.

LOW-avgränsningar: kontrollfel stoppar fortfarande själva utskicksförsöket (fail-closed); cachen förlänger däremot inte pausen. `channel_notices` skrivs för kommande H1-läsning, medan dagens banner visar live-status. Morgonrapporten är en deterministisk databasbrief och saknar den tidigare LLM-genererade insiktstexten; det är en avsiktlig produktförändring för tillförlitlighet. Saknad SMS-mottagares text och grupperingar av klassprefix i driftloggar kvarstår som LOW. Slutlig verifiering anges på PR-huvudet.

### Handoff — Codex H1/H2, 2026-09-15 (granskningsunderlag)

Byggt från `main c09364e7` efter #78. Ägarbeslutet i §4 är implementerat som uttryckligt engångssamtycke; inget default-on. Inkorg, SQL-insamlad expiry, beständigt morgonkvitto, fyra övervakade nycklar och omedelbar avstängning finns för granskning. [Implementation, aktivering och avvikelser](H1_H2_IMPLEMENTATION.md) beskriver v248 och proven. Board ska inte markeras helt done: native Ja/Nej och H3b:s cancellation-integration återstår. Pilot och produktionsflaggor är fortfarande ägarens aktiveringssteg.
