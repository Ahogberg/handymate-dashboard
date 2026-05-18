# Agent Observations Rollout — 2026-05-18

Slutrapport för utbyggnaden av Karin-mönstret till fyra specialist-agenter:
Karin (ekonom), Daniel (säljare), Lars (projektledare), Hanna (marknadsansvarig).

## Sprintens utfall

13 commits över 5 faser, från extracted shared-infrastruktur till komplett
4-agent observations-pipeline med staggerad cron-schedule. Karin var pilot;
Daniel/Lars/Hanna byggdes ovanpå hennes infrastruktur utan duplicering.

| Phase | Commits | Status |
|---|---|---|
| A — Shared infrastructure | `0fb1215d`, `2068b2aa`, `0694dbbf` | ✅ Klar |
| B — Daniel | `61edd5ea`, `c109fb46`, `31d74a9c` | ✅ Verifierad live |
| C — Lars | `cc912fc3`, `b2d415b2`, `71e06ebd` | ✅ Verifierad live |
| D — Hanna | `9d675896`, `33e6eb6a`, `f445a34b` | ⏳ Verifiering pending |
| E — Slutrapport | (denna fil) | ✅ Klar |

## Files skapade per agent

### Karin (refactor från solo → shared infrastructure)
- `lib/agents/karin/observation-prompt.ts` (976 → 528 rader, refactor)

### Shared (extracted från Karin)
- `lib/agents/shared/schema-block.ts` — `SCHEMA_BLOCK` const
- `lib/agents/shared/normalize.ts` — `AgentObservation` + `normalizeObservation()`
- `lib/agents/shared/business-aggregate.ts` — `InvoiceStats`, `computeInvoiceStats`, helpers
- `lib/agents/shared/thinking-call.ts` — `callAgentWithThinking()` + `AgentDebugInfo`
- `lib/agents/shared/save-and-push.ts` — `saveAndPush(supabase, businessId, agentId, observations)`
- `lib/agents/registry.ts` — `AGENT_RUNNERS` Record-mapping

### Daniel
- `lib/agents/daniel/observation-prompt.ts` (468 rader)
- `lib/agents/daniel/__examples__/observation-samples.json` (6 scenarier)

### Lars
- `lib/agents/lars/observation-prompt.ts` (537 rader)
- `lib/agents/lars/__examples__/observation-samples.json` (7 scenarier)

### Hanna
- `lib/agents/hanna/observation-prompt.ts` (430 rader)
- `lib/agents/hanna/__examples__/observation-samples.json` (7 scenarier)

### Routes
- `app/api/cron/agent-observations/[agent]/route.ts` — dynamisk per-agent-route
- `app/api/cron/agent-observations/route.ts` — **raderad** (gamla solo-Karin-routen)
- `app/api/cron/agent-observations/test/route.ts` — uppdaterad till SUPPORTED_AGENTS

## Hypotes-tabell per agent

| Agent | Fönster | Hypotes 1 | Hypotes 2 | Hypotes 3 | Hypotes 4 |
|---|---|---|---|---|---|
| **Karin** (ekonom) | 90d | Cash-flow-mönster | Faktura-betalningstid | Pricing-möjligheter | Säsongs-cash-flow |
| **Daniel** (säljare) | 90d | Offert-konvertering per kund-typ | Stale-offerter (3+ views) | Lead-källors win-rate | Pris-elasticitet per typ |
| **Lars** (projektledare) | 90d | Scope-creep per projekt-typ | Lönsamhet <>50k | ÄTA-flöde sign-rate | Booking-completion |
| **Hanna** (marknadsansvarig) | 180d | Reaktivering inaktiva | Säsongs-trender leads | Recension-coverage | Repeat-customer-andel |

## Data-aggregation per agent (direktläst vs härlett)

### Karin (90d)
| Källa | Status |
|---|---|
| `invoice` (total, status, paid_at, created_at) | ✅ Direkt |
| `quote` per status (accepted/declined/sent/open) | ✅ Direkt |
| `project` (revenue, profitability_status) | ✅ Direkt |

### Daniel (90d)
| Källa | Status |
|---|---|
| `quotes` (total, status, view_count, customer_id) | ✅ Direkt |
| `leads` (source, score, status) | ✅ Direkt |
| `customer.customer_type` | ✅ Direkt |
| `quotes.sent_at` / `quotes.declined_at` | ⚠️ Härlett — status-transition + created_at-fallback |

### Lars (90d)
| Källa | Status |
|---|---|
| `project` (budget_hours, actual_hours, profitability_status) | ✅ Direkt |
| `project_change` (ata_number, status, total) | ✅ Direkt |
| `booking` (status, scheduled_start) | ✅ Direkt |
| `booking.attended/completed` | ⚠️ Härlett — `status='completed'` ELLER `cancelled` |

### Hanna (180d)
| Källa | Status |
|---|---|
| `customer` (customer_type, created_at, review_request_sent_at) | ✅ Direkt |
| `leads` (source, status, created_at) | ✅ Direkt |
| `invoice` (customer_id, total, created_at) | ✅ Direkt |
| `booking` (customer_id, scheduled_start, created_at) | ✅ Direkt |
| `customer.last_contact_at` | ⚠️ Härlett — `MAX(invoice.created_at, booking.scheduled_start/created_at)` |
| `repeat_customers` | ⚠️ Härlett — `GROUP BY customer_id HAVING COUNT >= 2` på invoice |
| `review_flow.eligible_count` | ⚠️ Härlett — customers med >= 1 invoice senaste 180d |

## Code-versions

| Agent | Const | Värde |
|---|---|---|
| Karin | `KARIN_CODE_VERSION` | `shared-extract-A2-2026-05-18` |
| Daniel | `DANIEL_CODE_VERSION` | `daniel-v1-2026-05-18` |
| Lars | `LARS_CODE_VERSION` | `lars-v1-2026-05-18` |
| Hanna | `HANNA_CODE_VERSION` | `hanna-v1-2026-05-18` |

## Cron-spread (vercel.json)

| Agent | Schedule | UTC | Sv-tid |
|---|---|---|---|
| Karin | `0 6 * * 0,3` | 06:00 | 08:00 sön/ons |
| Daniel | `5 6 * * 0,3` | 06:05 | 08:05 sön/ons |
| Lars | `10 6 * * 0,3` | 06:10 | 08:10 sön/ons |
| Hanna | `15 6 * * 0,3` | 06:15 | 08:15 sön/ons |

15-minuters fönster söndag + onsdag morgon. Christoffer får upp till 4 push-
notiser i snabb följd från olika agenter när observationer genereras.

## Test-resultat (biz_al7pjuu5smi)

### Daniel — verifierad 2026-05-18
- `code_version: "daniel-v1-2026-05-18"` ✅
- `data_maturity: "early_stage"` (9 quotes — under 10-tröskeln)
- `observations_total: 1`, `saved: 1`, `insights_pushed: 1`
- Tone: säljarens energi ("Tjena! Jag är Daniel..."), refererade konkret
  Andreas stale 45 000 kr badrumsoffert, 100% accept-rate
- `validation_drop_reasons: []`

### Lars — verifierad 2026-05-18
- `code_version: "lars-v1-2026-05-18"` ✅
- `data_maturity: "early_stage"` (6 projekt — under 10-tröskeln)
- `observations_total: 1`, `saved: 1`, `insights_pushed: 1`
- Tone: planerarens lugn ("Hej! Lars här, er nye projektledare... ett litet
  men ordnat underlag att börja från"), refererade konkret data (6 projekt,
  1 avslutat, 5 aktiva, 98% marginal, inga over-budget)
- `validation_drop_reasons: []`

### Hanna — pending verifiering
Test-instruktion:
```js
const r = await fetch('/api/cron/agent-observations/test?agent_id=hanna&debug=true&t=' + Date.now())
console.log(JSON.stringify(await r.json(), null, 2))
```

## Identifierade TDs

1. **`data_basis.customer_count: null` i Daniel** — Claude flaggar ärligt att
   aggregate saknar unique-customer-count. Fältet räknas inte i `buildDanielAggregate`
   eftersom det inte är hypotes-relevant. Inte blocker, men fix:as om observation-
   kvalitet lider i pilot.

2. **`quote_tracking_events.event_type='sent'` ↔ `quotes.sent_at`** — Daniel
   härleder via status-transition + created_at-fallback. Imprecist för gamla
   quotes utan tracking-events. TD-kandidat: lägg till `quotes.sent_at`-kolumn
   explicit om observation-kvalitet lider.

3. **Push-notis-batching** — 4 agenter inom 15-min-fönster söndag+onsdag kan
   ge upp till 4 push-notiser till Christoffer's enhet i snabb följd. Om det
   upplevs spammigt: batch:a till en "Ditt AI-team har 3 nya observationer"-
   notis istället för per-agent-pushes.

4. **Session-expiry under långa dashboard-sessioner** — upptäckt under
   verifiering 2026-05-18. JWT-cookien (1h TTL) går ut när Andreas är
   inloggad lång tid utan att ladda om sidan, vilket ger 401 från alla
   API-rutter. TD-kandidat: middleware-flöde som auto-refreshar JWT på
   alla dashboard-requests så browser-sessionen inte tyst dör mitt i jobbet.

5. **Daniel + Karin pricing-överlapp** — Daniel's hypotes 4 (pris-elasticitet)
   kan kollidera med Karin's pricing-möjligheter-hypotes. Mitigation:
   Daniel fokuserar på "kunder som accepterade höga belopp" (forward-looking),
   Karin fokuserar på "timpris-stagnation över tid" (backward-looking).
   Flagga om verkligt överlapp i pilot-data.

## Befintliga utilities som återanvändes

- `sendApprovalPush` från `lib/notifications/approval-push.ts` — generisk för
  alla `agent_id` via `AGENT_DISPLAY_NAMES`-map + `agentName()` helper. Ingen
  ändring krävdes.
- `business_knowledge`-tabell + `pending_approvals`-tabell — schema redan
  korrekt för alla 4 agenter via `agent_id`-fältet.
- `TeamActivityStrip` — plockar senaste observation per agent via
  `observationByAgent`-map. Ingen ändring krävdes, fungerar för alla 4 agenter
  så snart de skriver till `business_knowledge`.

## Nästa steg

1. Andreas verifierar Hanna via test-endpoint (per ovan)
2. Söndag/onsdag 06:00–06:15 UTC kör alla 4 agenter parallellt i prod
3. Granska de första 2-3 cron-runorna för pilot-customers
4. Adjust prompt-tuning per agent om observations är trivial eller fel-tonade
5. Adressera TDs ovan baserat på pilot-feedback
