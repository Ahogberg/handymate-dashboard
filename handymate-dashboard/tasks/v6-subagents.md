# V6 Subagent-arkitektur (T1) — Progress

## Status: KLAR

Alla steg implementerade och verifierade.

## Arkitektur

```
Orchestrator (regelbaserad klassificering, zero-LLM)
├── Lead-agent (Haiku) — SMS, kvalificering, pipeline
├── Ekonomi-agent (Haiku) — offert, faktura, ROT, betalning
└── Strategi-agent (Sonnet) — komplexa beslut, kräver alltid godkännande
```

## Steg

- [x] **Steg 1**: `sql/v6_agent_logs.sql` — agent_type kolumn i v3_automation_logs + agent_runs
- [x] **Steg 2**: `lib/agent/agents/shared.ts` — runAgentLoop, filterTools, fetchBusinessContext, escalateToolDefinition
- [x] **Steg 3**: `lib/agent/agents/lead-agent.ts` — Haiku, 6 steg, 11 tools + eskalering
- [x] **Steg 4**: `lib/agent/agents/ekonomi-agent.ts` — Haiku, 6 steg, 11 tools + eskalering
- [x] **Steg 5**: `lib/agent/agents/strategi-agent.ts` — Sonnet, 10 steg, alla 22 tools
- [x] **Steg 6**: `lib/agent/orchestrator.ts` — orchestrate(), classifyEvent(), loggning per agent
- [x] **Steg 7**: `lib/automation-engine.ts` — handleRunAgent() anropar orchestrate() istället för HTTP
- [x] **Steg 8**: `npx tsc --noEmit` 0 fel, `npx next build` ren build

## SQL att köra i Supabase

```
sql/v6_agent_logs.sql
```

## Filer skapade/ändrade

| Fil | Åtgärd |
|-----|--------|
| `sql/v6_agent_logs.sql` | NY |
| `lib/agent/agents/shared.ts` | NY |
| `lib/agent/agents/lead-agent.ts` | NY |
| `lib/agent/agents/ekonomi-agent.ts` | NY |
| `lib/agent/agents/strategi-agent.ts` | NY |
| `lib/agent/orchestrator.ts` | NY |
| `lib/automation-engine.ts` | ÄNDRAD — handleRunAgent() |
| `ARCHITECTURE.md` | ÄNDRAD — V4/V5 ✅, V6 🔄 |

## Eskaleringsloggning

Vid eskalering från Haiku → Strategi:
1. Haiku-körningen loggas separat med sin `agent_type` ('lead' eller 'ekonomi')
2. Strategi-körningen loggas separat med `agent_type: 'strategi'`
3. Hela kedjan är synlig i `agent_runs`-tabellen
