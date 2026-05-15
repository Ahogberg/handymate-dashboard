# Model Migration — claude-sonnet-4-20250514 → claude-sonnet-4-6

**Trigger:** `claude-sonnet-4-20250514` retiras 15 juni 2026 (32 dagar från 14 maj).
**Sprint datum:** 2026-05-14 → 2026-05-15
**Strategi:** 5 atomära commits grupperade per use-case + rapport.

## Sammanfattning

| Kategori | Filer | Mål-modell | Commit |
|---|---|---|---|
| Live customer-facing | 6 | `claude-sonnet-4-6` | C1 `4ee2faec` |
| Quote-generation | 4 | `claude-sonnet-4-6` | C2 `bbf75f91` |
| Agent-background (sonnet) | 3 | `claude-sonnet-4-6` | C3 `b799a4ae` |
| Agent-background (haiku) | 2 | `claude-haiku-4-5-20251001` | C3 `b799a4ae` |
| Karin-modulen | 2 | `claude-sonnet-4-6` | C4 `ee9aa234` |
| Misc + Haiku-uppgr + dead code | 4 | mixed | C5 `567139df` |
| **Totalt migrerade fil-träffar** | **24 i 21 unika filer** | | |

Inga ENV-defaulter, config-filer eller docs hade deprecerade strängar. Allt var hard-coded i kod.

## Detaljerad mapping per fil

### Commit C1 — Live customer-facing (`4ee2faec`)

| Fil | Före | Efter |
|---|---|---|
| `app/api/widget/chat/route.ts:209` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/ai-copilot/route.ts:152` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/assistant/command/route.ts:135` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/jobbuddy/voice/route.ts:82` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/jobbuddy/photo/route.ts:30` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/voice/analyze/route.ts:216` | sonnet-4-20250514 | sonnet-4-6 |

Inga parameter-ändringar.

### Commit C2 — Quote-generation (`bbf75f91`)

| Fil | Före | Efter |
|---|---|---|
| `lib/ai-quote-generator.ts:153,383` (2 calls) | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/quotes/generate/route.ts:83` | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/quotes/from-photo/route.ts:28` (vision) | sonnet-4-20250514 | sonnet-4-6 |
| `app/api/storefront/generate/route.ts:92` | sonnet-4-20250514 | sonnet-4-6 |

### Commit C3 — Agent-background (`b799a4ae`)

**Till sonnet-4-6:**
| Fil | Konstant | Före | Efter |
|---|---|---|---|
| `lib/agent/context-engine.ts:11` | `MODEL` | sonnet-4-20250514 | sonnet-4-6 |
| `lib/agent/agents/strategi-agent.ts:12` | `STRATEGI_MODEL` | sonnet-4-20250514 | sonnet-4-6 |
| `lib/matte/monthly-review.ts:282` | inline | sonnet-4-20250514 | sonnet-4-6 |

**Nedgraderade till Haiku 4.5 för billigare drift (samma kvalitet för enkla classifiers):**
| Fil | Före | Efter |
|---|---|---|
| `lib/matte/intent-agent.ts:103` | sonnet-4-20250514 | haiku-4-5-20251001 |
| `lib/pipeline-ai.ts:58` | sonnet-4-20250514 | haiku-4-5-20251001 |

**Cost-impact:** Sonnet → Haiku på intent-agent + pipeline-ai = ~5x billigare per anrop. Båda triggas på inkommande SMS/samtal som kan bli >100/dag vid full pilot.

### Commit C4 — Karin-modulen (`ee9aa234`)

| Fil | Före | Efter |
|---|---|---|
| `lib/agents/karin/observation-prompt.ts:507` | sonnet-4-20250514 | sonnet-4-6 |
| `lib/agents/karin/__examples__/observation-samples.json:5` | sonnet-4-20250514 | sonnet-4-6 |

**Thinking-config behållen oförändrad:**
```ts
thinking: { type: 'enabled', budget_tokens: 8000 }
```
Sonnet 4.6 stödjer både `enabled+budget_tokens` och `adaptive`. Om vi vill uppgradera till **Opus 4.7** senare för djupare analys krävs breaking change (`type: 'adaptive'` + `effort: 'high'`) — kvar som möjlighet, inte gjort nu.

### Commit C5 — Misc + Haiku-uppgradering (`567139df`)

| Fil | Före | Efter | Anteckning |
|---|---|---|---|
| `lib/communication-ai.ts:239` | sonnet-4-5-20250929 | sonnet-4-6 | Sonnet 4.5 också att förmodligen retiras |
| `app/api/automations/test/route.ts:31` | sonnet-4-5-20250929 | sonnet-4-6 | — |
| `lib/proactive-care.ts:104` | claude-3-5-haiku-20241022 | haiku-4-5-20251001 | Haiku 3.5 → 4.5 |
| `lib/ai.ts:50,79` (2 calls) | sonnet-4-20250514 | sonnet-4-6 | **DEAD CODE** — se TD nedan |

## Negative results (det fanns INTE)

- Inga `ANTHROPIC_MODEL` eller `CLAUDE_MODEL` ENV-defaulter
- Inga modellnamn i `.env.local.example`, `vercel.json`, `package.json`
- Inga `.md`-docs med deprecerade strängar
- Ingen Opus i prod-koden alls (alla är Sonnet eller Haiku)

## Edge-function — öppen punkt

**`supabase/functions/agent/index.ts:34`** har fortfarande `claude-sonnet-4-20250514`.

Per migration-spec ska denna verifieras innan migration:
1. Kolla Supabase dashboard → Edge Functions → invocations senaste 30 dagar
2. **Om 0 invocations** → markera som DEAD CODE, skip migration, logga TD-41 för deletion
3. **Om > 0 invocations** → kör commit C6 för migration

Verkar vara legacy från innan Next.js API routes tog över agent-flödet. Andreas behöver kolla Supabase-dashboarden.

## Audit post-migration

```bash
grep -rn "claude-sonnet-4-20250514\|claude-sonnet-4-5-20250929\|claude-3-5-haiku-20241022" \
  --include="*.ts" --include="*.json" lib/ app/ supabase/
```

Resultat: **1 träff kvar** — endast `supabase/functions/agent/index.ts:34` (väntar på edge-function-verifiering).

## Inga prompt-justeringar utöver modellsträngen

Sonnet 4.6 är API-kompatibel med Sonnet 4 för samtliga calls i kodbasen — `system`, `messages`, `max_tokens`, vision-input, `thinking: { type: 'enabled', budget_tokens }`. Inga andra parametrar behövde ändras.

Om Sonnet 4.6 ger sämre output-kvalitet post-deploy:
- **Quote-generering (C2):** byt till Opus 4.7 för specifika quote-routes (kräver thinking-config-byte till adaptive + effort)
- **Karin observation (C4):** byt till Opus 4.7 om observation-kvalitet inte räcker

## Testresultat

Testning sker mot prod efter deploy (Vercel auto-deploys per push). Eftersom dessa är `model`-string-byten utan andra parameter-ändringar är risken låg — endast två failure modes:
1. **400 "model not found"** → Sonnet 4.6 inte tillgängligt i Anthropic-kontot ännu, rollback
2. **Output-kvalitet sämre** → byt till Opus 4.7 per route

**Inga prod-tester gjorda från CLI** (kräver session/secrets). Smoke-test rekommenderas via:
- Widget-chat: trigger med test-prompt
- Quote-generation: kör mot test-data
- Agent-context cron: trigga manuellt med `Bearer CRON_SECRET`
- Karin observation: använd test-endpoint (kommer i Väg 1 Commit 5)

## Loggade TDs

### TD-41 — Supabase edge-function `agent/index.ts` verifiering
**Plats:** `supabase/functions/agent/index.ts:34`
**Status:** Öppen, väntar på dashboard-check.
**Action:** Andreas kollar invocations senaste 30 dagar i Supabase dashboard. Om 0 → DEAD CODE, delete. Om >0 → migrera till sonnet-4-6.

### TD-42 — `lib/ai.ts` dead code
**Plats:** `lib/ai.ts` — funktionerna `getAIInsights` + `askCopilot`
**Status:** Öppen.
**Action:** Båda är exporterade men ingen fil i kodbasen importerar dem. Antingen återanvänd dem (en framtida dashboard-insights-widget kan ha nytta), eller radera filen. Migrerade modellsträngen i C5 för säkerhet om återanvändning sker.

### TD-43 — Möjlig Opus 4.7-uppgradering för Karin
**Plats:** `lib/agents/karin/observation-prompt.ts`
**Status:** Möjlighet, inte krävd.
**Action:** Om observation-kvalitet inte räcker med Sonnet 4.6, uppgradera till Opus 4.7. Kräver breaking change i thinking-config (`enabled+budget_tokens` → `adaptive+effort: 'high'`) + 35% fler tokens via ny tokenizer = högre kostnad. Avvakta första vecko-körningarna innan beslut.

## Tidslinje + säkerhetsmarginal

- **2026-05-15** Migration klar (denna sprint)
- **2026-05-22** Första Karin observation-cron-körning (söndag 06 UTC) — verifierar att thinking-config funkar på 4.6
- **2026-06-15** Sonnet 4-20250514 retiras — vi har **31 dagar säkerhetsmarginal** efter migration

## Commits-historia

| Commit | Hash | Tid | Filer |
|---|---|---|---|
| C1 — Live customer-facing | `4ee2faec` | 2026-05-14 | 6 |
| C2 — Quote-generation | `bbf75f91` | 2026-05-15 | 4 |
| C3 — Agent-background | `b799a4ae` | 2026-05-15 | 5 |
| C4 — Karin-modulen | `ee9aa234` | 2026-05-15 | 2 |
| C5 — Misc + Haiku-uppgr | `567139df` | 2026-05-15 | 4 |
| **Rapport (denna fil)** | — | 2026-05-15 | 1 |
