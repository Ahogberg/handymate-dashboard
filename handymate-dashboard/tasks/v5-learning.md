# V5 Per-företags-inlärning (T2) — Progress

## Status: KLAR

Alla steg implementerade och verifierade.

## Steg

- [x] **Steg 1**: `sql/v5_learning_events.sql` — learning_events + business_preferences tabeller
- [x] **Steg 2**: `lib/agent/learning-engine.ts` — recordLearningEvent()
- [x] **Steg 3**: Approval route hooked — accept/reject/edit loggar learning events
- [x] **Steg 4**: `lib/agent/context-engine.ts` — updateBusinessPreferences() med Claude Haiku
- [x] **Steg 5**: System prompt — learnedPreferences injiceras (ton, SMS-längd, prissättning)
- [x] **Steg 6**: Cron route — updateBusinessPreferences() körs efter context-generering
- [x] **Steg 7**: `npx tsc --noEmit` 0 fel, `npx next build` ren build

## SQL att köra i Supabase

```
sql/v5_learning_events.sql
```

## Filer skapade/ändrade

| Fil | Åtgärd |
|-----|--------|
| `sql/v5_learning_events.sql` | NY — learning_events + business_preferences + RLS |
| `lib/agent/learning-engine.ts` | NY — recordLearningEvent() |
| `lib/agent/context-engine.ts` | ÄNDRAD — updateBusinessPreferences() tillagd |
| `app/api/approvals/[id]/route.ts` | ÄNDRAD — learning event hook + edit action |
| `app/api/agent/trigger/system-prompt.ts` | ÄNDRAD — learnedPreferences interface + buildLearnedPreferencesBlock() |
| `app/api/agent/trigger/route.ts` | ÄNDRAD — hämtar business_preferences, skickar till systemPrompt |
| `app/api/cron/agent-context/route.ts` | ÄNDRAD — kör updateBusinessPreferences() per företag |

## Flöde

1. Hantverkaren godkänner/avvisar/redigerar en approval → `learning_events` rad skapas
2. Nattlig cron (05:00 UTC) → `updateBusinessPreferences()` analyserar senaste 50 events med Claude Haiku
3. Tolkade preferenser upseras till `business_preferences`
4. Agent trigger läser `business_preferences` och injicerar i system prompt
5. Agenten agerar enligt inlärda preferenser
