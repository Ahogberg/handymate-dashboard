# `lib/patterns/` — Pattern-extraction v0 (Fas 1a)

Strukturerad pattern-extraction från Bees data. Per [`tasks/roadmap-learning-ai.md`](../../tasks/roadmap-learning-ai.md) Fas 1.

Inget LLM-anrop i Fas 1a — ren SQL-aggregering. Helpers är fil-isolerade och unit-testbara.

## Arkitektur

```
types.ts                 ← PatternKey + value-typer + CalculatorResult-union
   ↓
sample-thresholds.ts     ← Kvantitativ epistemic-gate (thresholds + window + assessConfidence)
exclusions.ts            ← Kvalitativ epistemic-gate (ExclusionRule + applyExclusions)
utils/extract-agent-id.ts ← Delad helper (agent_id → routed_agent → null)
   ↓
calculators/             ← Ren-funktion (computeX) + thin DB-wrapper (calculateX)
  approve-rate.ts          ✓ Dag 3 — typed-actions only, agent_observation exkluderas
  deal-cycle.ts            ⏳ Dag 6 — outlier-rule cycle_days < 1
  ata-frequency.ts         ⏳ Dag 6 — 0/24 hittills för Bee
   ↓
run-patterns.ts          ← Orkestrering: buildPatternUpsertPayload + upsertPattern + runPatternsForBusiness
   ↓
app/api/cron/patterns/
  route.ts               ← Vercel cron 05:05 UTC, alla businesses
  test/route.ts          ← Manuell trigger, ?business_id=X
   ↓
business_patterns        ← SQL-tabell (sql/v61_business_patterns.sql)
```

## Designprinciper

| Princip | Implementation |
|---|---|
| **Epistemic hygien** | `is_stale=true` tills sample-threshold nås. UI/Fas 2 visar "Bygger underlag (X av Y)" istället för value. |
| **Per-business isolation** | UNIQUE(business_id, pattern_key) + RLS. Lärandet är per-konto. |
| **Atomic update** | Per-pattern-rad (inte JSONB-blob) → omräkning av ett mönster rör inte andra. |
| **Idempotent** | UPSERT på unique-constraint. Kör 2 ggr samma dag → samma rad uppdateras. |
| **Defense in depth** | Calculator gör defensiv status-filtrering även om DB-wrapper missade. |
| **Audit-spår** | `metadata.excluded_outliers` + `exclusion_reason` loggas för granskbarhet. |
| **En sanning per koncept** | `extractAgentId` (saveAndPush + approve-rate), `getDataWindow` (alla calculators), `assessConfidence` (alla). |

## Confidence + is_stale-semantik

| `confidence` | `is_stale` | UI visar | När |
|---|---|---|---|
| `'preliminary'` | `true` | "Bygger underlag (X av Y)" | sample_size < preliminary-threshold |
| `'preliminary'` | `false` | "Preliminär: …" (slate-grå) | sample_size >= preliminary, < medium |
| `'medium'` | `false` | "Tidigt mönster: …" (slate-700) | sample_size >= medium, < high |
| `'high'` | `false` | "Bekräftat: …" (emerald) | sample_size >= high |

`is_stale=true` innebär att raden finns (sample_size-progression bevaras) men `value` ska inte presenteras som uttalande. Spegelmotsvarighet till `MarginalCard`-mönstret.

## Lägg till ny calculator (Dag 6-mall)

### Steg 1 — Definiera pattern_key + types

Edit [`types.ts`](./types.ts):

```typescript
// PatternKey union
export type PatternKey =
  | 'approve_rate'
  | 'deal_cycle'  // ← NY
  | 'ata_frequency'

// Value-typ
export interface DealCycleValue {
  avg_days: number | null
  median_days: number | null
  // ...
}

// Metadata-typ
export interface DealCycleMetadata {
  excluded_outliers: number
  exclusion_reason: 'cycle < 1 day'
  open_deals_count?: number
}

// Discriminated union — lägg till case
export type CalculatorResult =
  | { pattern_key: 'approve_rate'; ... }
  | { pattern_key: 'deal_cycle'; value: DealCycleValue; ...; metadata: DealCycleMetadata }  // ← NY
  | ...
```

### Steg 2 — Lägg threshold + window i `sample-thresholds.ts`

```typescript
export const PATTERN_THRESHOLDS: Record<PatternKey, PatternThresholdConfig> = {
  // ...
  deal_cycle: {
    preliminary: 10,
    medium: 25,
    high: 50,
    window_days: 90,
  },
}
```

`Record<PatternKey, ...>` tvingar tsc-exhaustiveness — saknad config ger kompileringsfel.

### Steg 3 — Skapa calculator: ren funktion + thin DB-wrapper

Skapa `calculators/deal-cycle.ts`:

```typescript
import type { ExclusionRule } from '../exclusions'
import { applyExclusions, summarizeExclusions } from '../exclusions'
import { assessConfidence, getDataWindow } from '../sample-thresholds'

// Deklarera samples-typ
export interface DealSample {
  id: string
  cycle_days: number
  // ... vad du behöver
}

// Deklarera exclusions
export const DEAL_CYCLE_EXCLUSIONS: ExclusionRule<DealSample>[] = [
  { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' },
]

// Ren funktion
export function computeDealCycle(
  samples: DealSample[],
  windowStart: string,
  windowEnd: string,
): CalculatorResult {
  const { kept, excluded_by_reason } = applyExclusions(samples, DEAL_CYCLE_EXCLUSIONS)
  // ... beräkna value från kept[]
  return {
    pattern_key: 'deal_cycle',
    value: { ... },
    sample_size: kept.length,
    data_window_start: windowStart,
    data_window_end: windowEnd,
    metadata: { ...summarizeExclusions({ kept, excluded, excluded_by_reason }) },
  }
}

// DB-wrapper
export async function calculateDealCycle(
  supabase: SupabaseClient,
  businessId: string,
  now: Date = new Date(),
): Promise<{ result: CalculatorResult; confidence: ReturnType<typeof assessConfidence> }> {
  const window = getDataWindow('deal_cycle', now)
  // ... SQL-fetch, JOIN pipeline_stage WHERE is_won, etc.
  const result = computeDealCycle(samples, window.start.toISOString(), window.end.toISOString())
  const confidence = assessConfidence(result.sample_size, 'deal_cycle')
  return { result, confidence }
}
```

### Steg 4 — Lägg in i `run-patterns.ts`

Edit [`run-patterns.ts`](./run-patterns.ts), addera block efter approve_rate:

```typescript
try {
  const { result, confidence } = await calculateDealCycle(supabase, businessId, now)
  const payload = buildPatternUpsertPayload(businessId, result, confidence, now)
  await upsertPattern(supabase, payload)
  patternsUpdated.push('deal_cycle')
  console.log(`[patterns/${businessId}] deal_cycle:`, { ... })
} catch (err) {
  errors.push({ pattern: 'deal_cycle', error: err.message })
}
```

### Steg 5 — Unit-tester i `scripts/test-patterns.ts`

Per Dag 2-disciplin:
- Tom samples-array → sample_size=0
- Outlier-exklueringar fungerar (cycle_days < 1 räknas i excluded_outliers)
- Realistisk mix → korrekta avg/median/p25/p75
- Edge case: alla samples exkluderas → sample_size=0

### Steg 6 — Verifiera

```bash
npx tsc --noEmit
npx tsx scripts/test-patterns.ts
npx next build
```

Manuell test mot Bee:

```js
fetch('/api/cron/patterns/test?business_id=biz_21wswuhrbhy', {
  headers: { Authorization: 'Bearer CRON_SECRET' }
}).then(r => r.json()).then(console.log)
```

Förvänta: `patterns_updated: ['approve_rate', 'deal_cycle']`. SQL ska visa 2 rader, en per pattern_key.

## Sample-trösklar och windows

| Pattern | preliminary | medium | high | Window |
|---|---|---|---|---|
| `approve_rate` | 5 | 15 | 30 | 30d |
| `deal_cycle` | 10 | 25 | 50 | 90d |
| `ata_frequency` | 10 | 25 | 50 | 365d |

Per-business override av thresholds är designat (TD) men inte byggt — alla calculators läser globala defaults. Aktiveras när 3+ pilotkunder med olika profiler finns.

## Testkörning + verifiering

```bash
# Unit-tester (ingen DB)
npx tsx scripts/test-patterns.ts

# Manuell trigger mot Bee
fetch('/api/cron/patterns/test?business_id=biz_21wswuhrbhy', {
  headers: { Authorization: 'Bearer CRON_SECRET' }
}).then(r => r.json()).then(console.log)

# Verifiera tabell-state
SELECT pattern_key, sample_size, confidence, is_stale, last_calculated_at
FROM business_patterns
WHERE business_id = 'biz_21wswuhrbhy';
```

## Kill-switch

Pattern-cron respekterar `business_config.agents_globally_paused` (samma flag som agent-observation-cron). Pausat business → `result: { skipped: 'agents_globally_paused' }`.

```sql
UPDATE business_config SET agents_globally_paused = true
WHERE business_id = 'biz_21wswuhrbhy';
```

Cost-cap-flaggan (`agent_cost_cap_usd_daily`) gäller INTE för pattern-cron eftersom Fas 1a är ren SQL utan Claude-anrop.

## Beroenden

- [`sql/v61_business_patterns.sql`](../../sql/v61_business_patterns.sql) — tabell
- [`lib/agents/shared/save-and-push.ts`](../agents/shared/save-and-push.ts) — använder `extractAgentId` för rate-limit (Commit C 2026-05-30)

## Status (2026-05-30)

| Dag | Innehåll | Status |
|---|---|---|
| 1 | SQL-tabell + types | ✓ |
| 2 | Sample-thresholds + exclusions + 42 tester | ✓ |
| 3 | extract-agent-id + approve-rate + APPROVE_RATE_EXCLUSIONS + 90 tester | ✓ |
| 4 | run-patterns + cron-route + test-route + 103 tester | ✓ |
| 5 | vercel.json + denna README | ✓ |
| 6 | deal-cycle + ata-frequency calculators | ⏳ |
