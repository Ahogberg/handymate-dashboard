# H3b — Durable outbound promises (`outbound_intents`)

> Claude brief, 2026-09-15, written after H3a and H4 merged (#78) and H1/H2 went to review (#81).
> Companion to [`TRYGG_OVERLAMNING_BRIEF.md`](TRYGG_OVERLAMNING_BRIEF.md) §5b, which this replaces in full.
> Pattern inherited from the Financial Kernel's `financial_effect_intents` (`sql/v239`, `sql/v240`):
> same claim/finish/unknown trio, same fencing, same audited human resolution.
> Same rules as the other logs: handoff block back under §Handoff, Claude reviews against orchestration §6 A + B.

## 0. Why this closes the handover

H3a stops a promise that cannot be kept from being made. H4 makes one daily artifact reliable. Neither
makes the *send itself* durable. Today an outbound SMS or e-mail exists only as a function call: if the
worker dies between the provider request and the log write, nobody knows whether the customer got the
message, and the only honest recovery — ask a human — has nowhere to live. Three things follow from that:

| Consequence | Where it shows today |
|---|---|
| A lost acknowledgement is indistinguishable from a failure, so the safe choice is to do nothing. | 290 failed automation runs in 60 days with no record of what actually reached a customer. |
| "Stäng av" cannot be honest. H2 revokes the grant, but anything already queued has no queue to be removed from. | Open item on #81; H2 invariant 4 is the only one not closed. |
| The customer cannot be told what happens next, because there is no row that says it. | Codex's priority 2, "vad teamet gör härnäst, när det sker", is text rather than fact. |

The kernel solved exactly this shape for money effects. H3b applies it to messages.

## 1. Claude decisions

| Decision | Why |
|---|---|
| **One promise per `dedupe_key`, composed by the producer** (`reminder:<invoice>:3`, `followup:<quote>:2`). `UNIQUE(business_id, dedupe_key)`; recording twice returns the first row. | The whole point is that a retry, a crash or a double cron tick cannot become a second message to a real customer. |
| **The intent is written synchronously and attempted in the same request; it is not a queue-first rewrite.** The producer records, claims, calls the provider, finishes. The sweeper only picks up what was left behind. | An approval today returns a result while the craftsman watches. Turning every send asynchronous would change every latency assumption and the customer's mental model for a durability benefit we get anyway. |
| **Status machine copied from the kernel, unchanged:** `pending → attempting → sent \| failed \| skipped \| unknown`. Token-fenced finish, terminal outcomes, idempotent on the same status. | Two different meanings of "unknown" in one codebase is how you get a double send. Reviewers already know this machine. |
| **`unknown` is a human's problem, never an automatic resend.** A stalled attempt becomes `unknown` at the next claim; only `resolve_outbound_intent` with actor and reason closes it. | Identical to C5b. The provider may already have delivered; guessing costs the customer's trust, asking costs a minute. |
| **Off cancels in the same transaction as the revoke.** `stop_supervised_autonomy` (v248) is replaced so it calls `cancel_outbound_intents` while it still holds the autonomy lock. | This is H2 invariant 4. A revoke that leaves the queue intact is not an off switch. |
| **A provider call already in flight is flagged, not recalled.** `cancel_requested_at` is stamped; the attempt finishes normally and the receipt says it was cancelled mid-send. | Honesty over theatre. We cannot unsend; we can say so. |
| **Own lock namespace `outbound:<business>`; never `financial_lock`.** Lock order: a holder of `autonomy:` may take `outbound:`, never the reverse. | An SMS must not serialise against invoice work, and one fixed order is what keeps cancel-on-off deadlock-free. |
| **A failed pre-flight is a durable `pending` with `defer_reason`, not a dropped send.** `not_before` holds it ten minutes; the sweeper retries when the channel recovers. | This is what makes "Väntar på saldo" a true statement rather than a guess, and it closes H3a's fail-closed gap: a paused channel delays a message instead of losing it. |
| **Recipient and template only. The message body is never stored in the intent.** | The source row already owns the text. A second copy of every customer message is a retention and erasure problem we do not need. |
| **The sweep rides the existing 10-minute cron `/api/cron/financial-kernel`, with its own work list across all businesses.** | No new cron (see the cost policy in #74). The list is deliberately *not* kernel-scoped: outbound applies to every tenant. |
| **This is `v249`, not the reserved `v247`.** | v247 was reserved when H3b was expected before H1/H2. It replaces `stop_supervised_autonomy` from v248, so it must run after it. Drop the v247 reservation. |

## 2. Read first

`sql/v239_financial_payment_commands.sql` (the intent table, `claim_effect_intents`, `finish_effect_intent`),
`sql/v240_financial_bridge_intents.sql` (work list, `resolve_effect_intent`, the audited resolution shape),
`lib/financial-kernel/effects/sweep.ts` (how a sweep reports unknown and exhausted without stopping),
`app/api/admin/financial-kernel/intents/route.ts` (admin resolution with actor and reason),
`lib/channels/preflight.ts` (H3a's `gateChannel`, the reason classes), `lib/autonomy/supervised-send.ts`
and `sql/v248_handoff_inbox_consent.sql` (H2's grant, audit and `stop_supervised_autonomy`).

## 3. The migration

`sql/v249_outbound_intents.sql` is drafted and proven in PGlite (§6). Codex may correct it, but every
change to the status machine, the fencing or the cancel path needs a line in the handoff saying why.

The table, then the RPCs:

```sql
CREATE TABLE public.outbound_intents (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  business_id TEXT NOT NULL REFERENCES public.business_config(business_id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('sms','email','push')),
  source TEXT NOT NULL CHECK (source IN ('approval','automation_log','autonomy','cron','manual')),
  source_id TEXT NOT NULL,
  dedupe_key TEXT NOT NULL,            -- the producer composes it; one promise per key, forever
  recipient TEXT NOT NULL,             -- address or E.164 only; never the message body
  template TEXT NOT NULL,
  autonomy_key TEXT NULL CHECK (autonomy_key IS NULL OR autonomy_key IN
    ('invoice_reminder','booking_reminder','quote_followup_sms','review_request')),
  status TEXT NOT NULL CHECK (status IN ('pending','attempting','sent','failed','skipped','unknown')),
  attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  attempt_token TEXT NULL, claimed_at TIMESTAMPTZ NULL, finished_at TIMESTAMPTZ NULL,
  not_before TIMESTAMPTZ NULL,         -- pre-flight defer and failure backoff share this field
  defer_reason TEXT NULL CHECK (defer_reason IS NULL OR defer_reason IN
    ('saldo','konfiguration','mottagare','kontrollfel')),
  cancel_requested_at TIMESTAMPTZ NULL,-- off arrived while the provider call was in flight
  last_error TEXT NULL, provider_ref TEXT NULL, context JSONB NULL, resolution JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (id), UNIQUE (business_id, id), UNIQUE (business_id, dedupe_key),
  CHECK (NOT (status = 'pending' AND attempt_token IS NOT NULL)),
  CHECK (status <> 'attempting' OR (claimed_at IS NOT NULL AND attempt_token IS NOT NULL)),
  CHECK ((status IN ('sent','failed','skipped','unknown')) = (finished_at IS NOT NULL))
);
```

| RPC | Does |
|---|---|
| `record_outbound_intent(business, kind, source, source_id, dedupe_key, recipient, template, autonomy_key, context, defer_reason)` | Idempotent producer. Refuses a revoked autonomy key. A `defer_reason` stores the pre-flight pause and sets `not_before`. |
| `claim_outbound_intents(business, ids, max_attempts, stale_minutes, limit)` | `ids` = the synchronous path, `NULL` = the sweeper. Stale `attempting` → `unknown`; a revoked key → `skipped`; then claims due work with a fresh token. |
| `finish_outbound_intent(business, id, token, status, provider_ref, error, max_attempts)` | Token-fenced, terminal, idempotent on the same status. A failure under the ceiling gets `not_before = now + 10 min × attempts`. |
| `cancel_outbound_intents(business, autonomy_key, reason)` | `pending`/`failed` → `skipped`; `attempting` gets `cancel_requested_at`. Called from inside `stop_supervised_autonomy`. |
| `list_owed_outbound_intents(max_attempts, stale_minutes, limit)` | The sweeper's work list, across all businesses. |
| `resolve_outbound_intent(business, id, resolution, actor_id, reason, max_attempts)` | `delivered` / `abandon` / `retry` on `unknown` or exhausted `failed`. Actor and reason mandatory and persisted. `retry` is refused when the key has been switched off. |
| `list_unresolved_outbound_intents(business, max_attempts, limit)` | What a human sees. |
| `read_outbound_status(business, source, source_id)` | The latest promise per channel for one source row. The Swedish text lives in TypeScript. |

Grants: RLS on, `REVOKE ALL` from PUBLIC/anon/authenticated/service_role, `GRANT SELECT, DELETE` to
service_role only (reads and account erasure; every write goes through an RPC). All RPCs `SECURITY DEFINER`
with `search_path` pinned and EXECUTE for service_role only; `outbound_lock` is revoked even from service_role.

**Already done, not your job:** the H3a review's carry — `v246` left `channel_notices` and `morning_report_runs` with service_role's default `ALL` — is closed by `v250_handoff_reliability_grants.sql`, applied to production 2026-09-15 and verified: both tables are now `SELECT, DELETE` for service_role only, matching v244 and v248, with the three RPCs still callable.

## 4. Scope

```text
sql/v249_outbound_intents.sql                (drafted; see §3 and the file)
lib/outbound/intents.ts                      (recordOutboundIntent, claimOutboundIntents, finishOutboundIntent, cancelOutboundIntents — thin service over the RPCs, same shape as lib/financial-kernel/commands/service.ts)
lib/outbound/promise.ts                      (withOutboundPromise(db, {businessId, kind, source, sourceId, dedupeKey, recipient, template, autonomyKey}, send) — record → pre-flight → claim → send → finish; the single wrapper every producer uses)
lib/outbound/sweep.ts                         (sweepOutboundIntents: claim due work per business, re-send, report unknown/exhausted via rapporteraTystFel — mirror lib/financial-kernel/effects/sweep.ts)
lib/outbound/status.ts                        (pure: intent row → "Skickat 08:12" | "Väntar på saldo" | "Kunde inte skickas" | "Utfallet är inte bekräftat")
lib/sms-send.ts, lib/email.ts, app/api/push/send/route.ts   (the three chokepoints H3a already gates: wrap with withOutboundPromise)
lib/autonomy/supervised-send.ts              (its audit row and the intent are the same fact — fold the audit into the intent, keep handoff_items for the digest)
app/api/cron/financial-kernel/route.ts       (add the outbound sweep behind OUTBOUND_INTENTS_ENABLED, driven by list_owed_outbound_intents; unchanged kernel work)
app/api/admin/outbound/intents/route.ts      (GET unresolved, POST resolve — copy app/api/admin/financial-kernel/intents/route.ts including the actor/reason requirement)
components/dashboard/HandoffInbox.tsx        (show the promise status next to the action it belongs to)
lib/account/radera.ts                        (outbound_intents into RADERAS)
tests/outbound-intents-sql.spec.ts           (the 43 checks in §6, as PGlite cases)
tests/outbound-promise.spec.ts               (the wrapper against real modules: pre-flight defer, provider failure, lost finish, off mid-send)
```

## 5. Invariants

1. Two records with the same `dedupe_key` produce exactly one promise and at most one provider call.
2. A promise whose `autonomy_key` is not granted is never created, and never claimed if the grant is withdrawn after it was created.
3. A finish with a stale or missing attempt token is refused; a terminal promise cannot change outcome; the same outcome twice is idempotent.
4. An attempt that has not finished within `stale_minutes` becomes `unknown`, is never claimed again, and can only be closed by `resolve_outbound_intent` with an actor and a reason that are persisted.
5. `stop_supervised_autonomy` revokes the grant and cancels that key's `pending`/`failed` promises in one transaction; a promise already `attempting` is flagged, never rewritten, and its real outcome is still recorded.
6. A failed pre-flight leaves a `pending` promise with a `defer_reason`, and the send happens when the channel recovers — it is never silently dropped.
7. Failures back off (`10 min × attempts`) and stop at the ceiling; an exhausted promise goes to the admin list, not to the customer.
8. No RPC in this package takes `financial_lock`, and nothing takes `autonomy:` while holding `outbound:`.
9. `anon` and `authenticated` can neither read the table nor execute any RPC; `service_role` can read and delete but never write a row directly.
10. A promise is scoped to its business in every RPC: another tenant's id is "not found", never a silent no-op.

## 6. Acceptance — the 43 checks, all green in PGlite on the drafted DDL

Claude ran these against the real migration (`probe15.cjs`, 43 passed / 0 failed). Codex converts them
into `tests/outbound-intents-sql.spec.ts`; a check that has to be weakened needs a line in the handoff.

- **Idempotency and the gate (6):** same key yields one promise; one row exists; a revoked key gets no promise; a pre-flight defer stores its reason and a future `not_before`; a deferred promise is not claimed early; a legacy JSON grant still counts when no control row exists.
- **Claim and finish (8):** claim marks `attempting` with a token and attempt 1; a second claim finds nothing; a stale token cannot finish; another tenant cannot finish; `sent` is terminal and keeps the provider reference; the same status again is idempotent; a finished promise cannot change outcome; a sent promise is never claimed again.
- **Backoff and ceiling (4):** a failed attempt gets a future `not_before`; backoff holds the next claim; after backoff it is attempt 2; the ceiling stops the sweeper at 3.
- **Lost acknowledgement (5):** a stalled attempt becomes `unknown`; it is never re-sent; the worker cannot finish it behind a human; resolution demands actor and reason; a human closes it as delivered and the reason is kept.
- **Off (6):** off skips everything not yet handed to a provider; it never touches a call in flight; it is recorded as a revocation; the in-flight result is still recorded and flagged as cancelled mid-send; no new promise can be made after off; retrying a cancelled promise is refused.
- **Revoked between promise and claim (1):** the claim closes the promise as `skipped` instead of sending.
- **Work list, tenants, status read (3):** the work list spans businesses, not only kernel tenants; a claim for one business never touches another; the customer-facing read returns the latest promise per channel.
- **Grants (10):** `anon` and `authenticated` each fail to read, to produce and to cancel/resolve; `service_role` cannot insert, cannot rewrite an outcome, can read and erase, and cannot take the lock outside an RPC.

## 7. Not in this package

New message types or any change to what a card may send. Consent, quotas, STOPP, quiet hours and amount
caps stay exactly as they are — an intent records a send, it never authorises one. The morning receipt's
own delivery tracking (H4) is not merged into this. Native Ja/Nej in push (open from #81) is separate.
No provider is changed: 46elks, Resend and the push sender keep their current adapters.

## 8. Activation

`OUTBOUND_INTENTS_ENABLED` off by default. Apply v249 after review, enable on the pilot alongside
`CHANNEL_PREFLIGHT_ENABLED`, and prove one real deferred send that recovers and one resolved `unknown`
before widening. The flag gates the wrapper and the sweep; the DDL alone sends nothing.

## Handoff

_Codex fills this in: what was built, deviations from §1 with reasons, the check list from §6 with results,
flags and what remains. Claude reviews against orchestration §6 A + B._
