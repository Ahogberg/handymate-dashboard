# Fynd: agent-pipelinen får HTTP 400 på thinking-anropet (2026-06-11)

**Status:** ✅ LÖST 2026-06-11 — orsaken var **slut på API-credits** (hypotes 1). Efter påfyllning: Daniel-cron gav `approvals_created: 3`, `run_cost_usd: 0.0358`, riktig thinking-text. Bekräftat empiriskt.

**Slutsats om hypotes 2 (deprecated thinking-config):** AVFÖRD. `{type:'enabled', budget_tokens:8000}` funkar fortfarande på `claude-sonnet-4-6` (annars hade det 400:at även med credits). Adaptive-thinking-bytet är ren hygien, ej brådskande.

**Lärdom:** slut på Anthropic-credits returneras som **HTTP 400** (`invalid_request_error`, "credit balance is too low"), inte 403. Cron-routen strippar `debug.api_error_body`, så felkroppen syns bara i Vercel-loggar (`thinking-call.ts:140`) — överväg att lyfta status + kort error in i cron-svaret så framtida credits-stopp syns direkt i trigger-outputen.

---

*Historik nedan bevarad för kontext.*

**Status (ursprunglig):** AKUT — hela agent-observation-pipelinen producerar noll. INGEN kod ändrad. Disambiguering krävs (se nedan) innan fix.

## Symptom

Manuell trigger av Daniel-cron mot Bee (`biz_21wswuhrbhy`) gav:
```json
{ "business_id": "biz_21wswuhrbhy", "data_maturity": "full_analysis",
  "thinking_preview": "error: 400", "run_cost_usd": 0, ... }
```
- `data_maturity: "full_analysis"` → aggregatet byggdes, test-offerten räknades, early-stage-tröskeln passerades. **Schemat är friskt** (separat verifierat: alla quotes/customer-kolumner finns).
- `thinking_preview: "error: 400"` + `run_cost_usd: 0` → Anthropic-anropet avvisades med HTTP 400, noll tokens debiterade.

## Var felet sitter

`lib/agents/shared/thinking-call.ts:119-146` — `callAgentWithThinking()` gör rå fetch mot `https://api.anthropic.com/v1/messages` med:
```js
{ model: 'claude-sonnet-4-6', max_tokens: 12000,
  thinking: { type: 'enabled', budget_tokens: 8000 },
  system: systemPrompt, messages: [...] }
```
Vid `!response.ok` returneras `thinkingPreview: "error: ${status}"` och `debug.api_error_body` sätts (rad 144) — **men cron-routen strippar `debug` (app/api/cron/agent-observations/[agent]/route.ts:105-106) innan svar**, så felkroppen syns inte i JSON-svaret. Den loggas dock i Vercel via `console.error` på `thinking-call.ts:140`.

## ⚠️ Blast radius — ALLA agenter, inte bara Daniel

`thinking-call.ts` är den **delade** helpern för Karin/Daniel/Lars/Hanna, och defaulterna (`model='claude-sonnet-4-6'`, `maxTokens=12000`, `thinkingBudget=8000`) gäller alla som inte overridar. Om anropet 400:ar gör det det för **alla fyra** → hela observation-pipelinen har producerat noll sedan felet uppstod. Detta omvärderar tidigare antagandet att "agenterna är tysta för att Bee har tunn data" — de är tysta för att LLM-anropet aldrig lyckas.

## Två hypoteser — BÅDA ger HTTP 400, ej ömsesidigt uteslutande

| # | Hypotes | Felkropp (`error.message`) | Fix |
|---|---|---|---|
| 1 | **Slut på API-credits** (Andreas: "vi har inga credits i APIt") | `"...credit balance is too low..."` | Fyll på credits i Anthropic Console |
| 2 | **Deprecated thinking-config** | `"...thinking..."` / `"...budget_tokens..."` | adaptive thinking (se nedan) |

Verifierat mot Anthropic API-referensen (claude-api skill):
- `claude-sonnet-4-6` är ett **giltigt** model-id → uteslutet som orsak.
- `budget_tokens` (8000) < `max_tokens` (12000) och ≥ 1024 → den klassiska budget-vs-max-400:an är utesluten.
- `anthropic-version: 2023-06-01` är korrekt; ingen beta-header krävs för adaptive thinking.
- Sonnet 4.6 stödjer **adaptive thinking** (`thinking: {type:'adaptive'}`). Formen `{type:'enabled', budget_tokens:N}` är **deprecated** på Sonnet 4.6 (transitional escape hatch per cache 2026-05-26). Om den hatchen tagits bort → 400.

## Disambiguering (2 sekunder — kunde ej köras lokalt: ANTHROPIC_API_KEY tom, bara i Vercel)

Välj EN:
1. **Vercel-loggar:** sök `[daniel/call] Anthropic API error` → fältet `body` är Anthropics exakta `error.message`. Innehåller "credit balance" → hypotes 1. Innehåller "thinking"/"budget_tokens" → hypotes 2.
2. **Anthropic Console → Billing:** är saldot 0/negativt → hypotes 1 bekräftad.

## Rekommenderad sekvens (eftersom hypoteserna kan samexistera)

1. **Fyll på credits** (Andreas stated cause).
2. **Re-trigga Daniel-cron.** Producerar approval → det var enbart credits, och `enabled`+budget_tokens-formen funkar fortfarande.
3. **Om fortfarande 400 efter credits** → det är config:en. Applicera adaptive-thinking-fixen:
   ```js
   // thinking-call.ts:129 — från:
   thinking: { type: 'enabled', budget_tokens: thinkingBudget }
   // till:
   thinking: { type: 'adaptive' }
   // + valfritt: output_config: { effort: 'medium' }
   ```
   Ta bort `budget_tokens`/`thinkingBudget`. Delad helper → en ändring fixar alla fyra agenterna (princip 2).

## Prioritet

Högre än Del 1 (attribution/dubbelklick) och Del 2 (execution-chain): de förbättrar ett system som producerar approvals. **Detta fynd betyder att systemet producerar NOLL agent-approvals.** Allt lärande-arbete (approve_rate, patterns, roadmap) är blockerat tills thinking-anropet lyckas. Attribution-fixen (Del 1A) ger heller ingen träningsdata förrän agenterna faktiskt skapar approvals igen.

*Ingen kod ändrad. Disambiguering + beslut hos Andreas.*
