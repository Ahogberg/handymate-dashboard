# Tech Debt — Handymate

Logg över kända optimeringar och skalproblem som inte är akuta men ska adresseras.

---

## 2026-05-07 — Prompt caching på agent-routen

**Plats:** `app/api/agent/trigger/route.ts`

**Problem:** Varje agent-run laddar full system prompt + business config + memories + agent messages. Vid `MAX_STEPS = 10` skickas hela contexten 10 gånger per run utan caching → linjär kostnad i steg.

**Optimering:** Anthropic prompt caching på system-prompt-blocket. Cache-reads kostar ~10% av cache-writes och TTL är 5 min — perfekt för en agent-loop som körs i ~30 sek totalt.

**Hur:** Lägg `cache_control: { type: 'ephemeral' }` på det stora, statiska blocket av systempromten (business config + tool definitions). Sonnet 4.6 + Haiku 4.5 stöder båda prompt caching.

**Förväntad besparing:** 50–80% input-tokens på multi-step runs.

---

## 2026-05-07 — communication_check fan-out per entitet

**Plats:** `app/api/cron/communication-check/route.ts`

**Problem (verifierat 5/5 16:00 UTC):** Cronen kör `0 16 * * *` daily men loopar internt och fan-outar 16+ agent-runs på 4 minuter — en run per entitet (kund/lead/conversation). Brände 3.97M tokens på Sonnet 4.6 vid bara ~16 entiteter.

**Skalrisk:** Med 100 kunder blir det 100+ runs/dag från ENBART denna cron. Med flera fan-out-crons (`nurture`, `quote-follow-up`, `gmail-lead-import`) multipliceras kostnaden snabbt.

**Audit-frågor när någon rör koden:**
1. Är varje per-entitet-run faktiskt nödvändig, eller kan flera entiteter batch:as i en run?
2. Kan koden filtrera bort entiteter som inte behöver action innan agenten anropas (deterministisk pre-check)?
3. Stora delar av prompten är identiska över entiteter (system prompt, business config) — passa på att aktivera prompt caching samtidigt som batch-logiken införs.

**Mitigering tills vidare (2026-05-07):** Cron-runs använder nu Haiku 4.5 (router i `/api/agent/trigger`), inte Sonnet 4.6 — ~10x billigare per run. Men fan-out-mönstret består.
