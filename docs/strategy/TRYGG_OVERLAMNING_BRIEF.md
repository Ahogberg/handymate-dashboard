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
| H1 | Never a silent expiry: notices vs decisions, expiry becomes a visible summary, three decisions a day | Codex | **ready — brief §3** | — |
| H2 | Autonomy on from day one for the four allowlisted keys, supervised by the daily digest, one-tap off | Codex | **ready — brief §4** | owner policy decision (§4, one line) |
| H3a | Channel pre-flight: no card and no send without a working channel; the home screen says what is missing | Codex | **ready — brief §5** | — |
| H3b | Durable outbound promises: `outbound_intents` modelled on `financial_effect_intents` for SMS, e-mail and push | Codex | sketched (§5b); Claude drafts DDL after H3a | H3a |
| H4 | Morgonrapporten delivers or says why: root cause of `run_agent` failures, one retry, its own driftlarm line | Codex | **ready — brief §6** | — |

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
| **Three decisions a day.** The morning push (existing `push-morgon` / `tyst-tid`) shows at most three open decisions, oldest first with the highest money first; the rest wait. A decision is answerable from the push with "Ja / Nej" where the card type supports it (start with `send_sms` and `invoice_reminder`). | Median pending age 6.8 days says the pile is the problem, not the decisions. The craftsman's channel is the phone. |
| **Expiry windows by type, not one default.** Money and customer-facing sends: 7 days. Internal notices: none. Offers of autonomy: 14 days (unchanged). | 48-hour windows on pipeline reviews expire before a weekend is over. |

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

1. Every `approval_type` that can be created is classified `decision` or `notice`; the contract test lists them by scanning `skapaKort` callers and `tool-router`.
2. A `notice` is never created with `expires_at` and is never set to `expired` by any cron.
3. Every `decision` that becomes `expired` appears in exactly one morning push summary for its business, within 24 h, and carries `payload.expiry_reported_at` afterwards. A card already reported is never reported again.
4. The morning push never lists more than three decisions; when more are open it says how many wait.
5. v241's producers are untouched: an expiry still yields exactly one `opportunity_dismissed`.

## 4. H2 — Autonomy on from day one, supervised

### The one owner decision this needs (one line in the handoff)

> New businesses start with the four allowlisted actions on. Existing businesses get the existing offer card once. Turning off is one tap and immediate.

If the owner says no, H2 reduces to lowering `STREAK_TARGET` to 5 and counting across the four keys; the rest of this section still applies to the digest and the off switch.

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
lib/autonomy/default-grant.ts              (grantDefaults(business) called from onboarding finalize; idempotent)
lib/notifications/autonomy-digest.ts       (pure: yesterday's autonomous actions per key → lines; supervised lists, earned counts)
app/api/cron/push-morgon/route.ts          (digest block)
app/api/autonomy/off/route.ts              (one-tap off from push/mail: signed token, POST, immediate revoke)
components/dashboard/EarnedAutonomyPanel.tsx (shows mode; off switch)
tests/autonomy-default-on.spec.ts          (new business → four grants supervised; existing business → offer once; off → revoke + cancel + cooldown)
tests/autonomy-digest.spec.ts              (lines, counts, quiet hours)
```

### Invariants

1. A new business finalized after the flag date has exactly the four keys granted in `supervised` mode; nothing else.
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

### 5b. Durable outbound promises (sketch; DDL drafted by Claude after 5a lands)

Generalise `financial_effect_intents`: an `outbound_intents` table with `business_id, kind (sms|email|push),
source (automation_log|approval|autonomy), source_id, recipient, template, status
(pending|attempting|sent|failed|skipped|unknown), attempts, attempt_token, claimed_at, finished_at,
last_error, provider_ref`, the same claim/finish/unknown RPC trio, a sweep in the existing 10-minute kernel
cron, and the same admin resolution with actor and reason. Every outbound message from automations,
approvals and autonomy becomes an intent first; the customer-facing status ("Skickat 08:12", "Väntar på
saldo", "Kunde inte skickas") is read from it. Lost acknowledgements become `unknown`, never a second
send. This is what makes Codex's priority 2 ("vad teamet gör härnäst, när det sker") a fact rather than
a text.

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
