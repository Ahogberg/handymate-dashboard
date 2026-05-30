/**
 * Unit-tester för Fas 1a pattern-helpers (sample-thresholds + exclusions).
 *
 * Rena funktioner utan I/O. Skyddar mot regressioner när calculators
 * (Dag 3-7) bygger ovanpå.
 *
 * Körning:  npx tsx scripts/test-patterns.ts
 * Exit code 0 = alla tester passerade. 1 = något fail:ade.
 *
 * Inget runner-overhead — projektet har ingen test-runner och inte
 * heller behöver en just för dessa rena helpers. Samma mönster som
 * scripts/test-parser-webolia.ts.
 */

import {
  assessConfidence,
  getDataWindow,
  PATTERN_THRESHOLDS,
} from '../lib/patterns/sample-thresholds'
import {
  applyExclusions,
  summarizeExclusions,
  type ExclusionRule,
} from '../lib/patterns/exclusions'
import { extractAgentId } from '../lib/patterns/utils/extract-agent-id'

let failed = 0
let passed = 0

function assertEqual<T>(actual: T, expected: T, label: string) {
  const actualStr = JSON.stringify(actual)
  const expectedStr = JSON.stringify(expected)
  if (actualStr === expectedStr) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.log(`  ✗ ${label}`)
    console.log(`    förväntat: ${expectedStr}`)
    console.log(`    faktiskt:  ${actualStr}`)
  }
}

function section(name: string) {
  console.log(`\n=== ${name} ===`)
}

// ─────────────────────────────────────────────────────────────────
// assessConfidence
// ─────────────────────────────────────────────────────────────────

section('assessConfidence — approve_rate (thresholds 5/15/30)')

assertEqual(
  assessConfidence(0, 'approve_rate'),
  { confidence: 'preliminary', is_stale: true, threshold_used: 0, next_threshold: 5 },
  'n=0 → is_stale=true, next=5',
)

assertEqual(
  assessConfidence(4, 'approve_rate'),
  { confidence: 'preliminary', is_stale: true, threshold_used: 0, next_threshold: 5 },
  'n=4 → is_stale=true (under preliminary)',
)

assertEqual(
  assessConfidence(5, 'approve_rate'),
  { confidence: 'preliminary', is_stale: false, threshold_used: 5, next_threshold: 15 },
  'n=5 → preliminary nåd, is_stale=false',
)

assertEqual(
  assessConfidence(14, 'approve_rate'),
  { confidence: 'preliminary', is_stale: false, threshold_used: 5, next_threshold: 15 },
  'n=14 → fortfarande preliminary (under medium)',
)

assertEqual(
  assessConfidence(15, 'approve_rate'),
  { confidence: 'medium', is_stale: false, threshold_used: 15, next_threshold: 30 },
  'n=15 → medium nåd',
)

assertEqual(
  assessConfidence(29, 'approve_rate'),
  { confidence: 'medium', is_stale: false, threshold_used: 15, next_threshold: 30 },
  'n=29 → fortfarande medium',
)

assertEqual(
  assessConfidence(30, 'approve_rate'),
  { confidence: 'high', is_stale: false, threshold_used: 30, next_threshold: null },
  'n=30 → high nåd, next=null',
)

assertEqual(
  assessConfidence(1000, 'approve_rate'),
  { confidence: 'high', is_stale: false, threshold_used: 30, next_threshold: null },
  'n=1000 → high (oförändrat över taket)',
)

section('assessConfidence — deal_cycle (thresholds 10/25/50)')

assertEqual(
  assessConfidence(9, 'deal_cycle'),
  { confidence: 'preliminary', is_stale: true, threshold_used: 0, next_threshold: 10 },
  'n=9 → is_stale=true',
)

assertEqual(
  assessConfidence(10, 'deal_cycle'),
  { confidence: 'preliminary', is_stale: false, threshold_used: 10, next_threshold: 25 },
  'n=10 → preliminary nåd',
)

assertEqual(
  assessConfidence(50, 'deal_cycle'),
  { confidence: 'high', is_stale: false, threshold_used: 50, next_threshold: null },
  'n=50 → high',
)

section('assessConfidence — ata_frequency (thresholds 10/25/50)')

assertEqual(
  assessConfidence(10, 'ata_frequency'),
  { confidence: 'preliminary', is_stale: false, threshold_used: 10, next_threshold: 25 },
  'n=10 → preliminary nåd (matchar Bee:s 24 projekt-prediktion)',
)

// ─────────────────────────────────────────────────────────────────
// getDataWindow
// ─────────────────────────────────────────────────────────────────

section('getDataWindow')

const FIXED_NOW = new Date('2026-05-30T12:00:00Z')

const approveWindow = getDataWindow('approve_rate', FIXED_NOW)
const approveDays = Math.round((approveWindow.end.getTime() - approveWindow.start.getTime()) / 86400000)
assertEqual(approveDays, 30, 'approve_rate window = 30 dagar')

const dealWindow = getDataWindow('deal_cycle', FIXED_NOW)
const dealDays = Math.round((dealWindow.end.getTime() - dealWindow.start.getTime()) / 86400000)
assertEqual(dealDays, 90, 'deal_cycle window = 90 dagar')

const ataWindow = getDataWindow('ata_frequency', FIXED_NOW)
const ataDays = Math.round((ataWindow.end.getTime() - ataWindow.start.getTime()) / 86400000)
assertEqual(ataDays, 365, 'ata_frequency window = 365 dagar')

assertEqual(approveWindow.end.toISOString(), FIXED_NOW.toISOString(), 'window.end = now')

// ─────────────────────────────────────────────────────────────────
// applyExclusions
// ─────────────────────────────────────────────────────────────────

section('applyExclusions')

interface SampleRow {
  id: string
  cycle_days: number
  has_customer: boolean
}

const samples: SampleRow[] = [
  { id: 'a', cycle_days: 5, has_customer: true },   // behåll
  { id: 'b', cycle_days: 0, has_customer: true },   // exkludera (cycle<1)
  { id: 'c', cycle_days: 12, has_customer: true },  // behåll
  { id: 'd', cycle_days: 0.5, has_customer: true }, // exkludera (cycle<1)
  { id: 'e', cycle_days: 3, has_customer: false },  // beror på vilken regel
]

// Inga rules → alla kept
{
  const result = applyExclusions(samples, [])
  assertEqual(result.kept.length, 5, 'inga rules → 5 kept')
  assertEqual(result.excluded.length, 0, 'inga rules → 0 excluded')
  assertEqual(result.excluded_by_reason, {}, 'inga rules → tomt reason-map')
}

// En rule, ingen träff
{
  const noop: ExclusionRule<SampleRow>[] = [
    { predicate: () => false, reason: 'never' },
  ]
  const result = applyExclusions(samples, noop)
  assertEqual(result.kept.length, 5, 'rule matchar inget → 5 kept')
  assertEqual(result.excluded.length, 0, 'rule matchar inget → 0 excluded')
}

// En rule, alla matchar
{
  const all: ExclusionRule<SampleRow>[] = [
    { predicate: () => true, reason: 'always' },
  ]
  const result = applyExclusions(samples, all)
  assertEqual(result.kept.length, 0, 'rule matchar alla → 0 kept')
  assertEqual(result.excluded.length, 5, 'rule matchar alla → 5 excluded')
  assertEqual(result.excluded_by_reason, { always: 5 }, 'reason-count = 5')
}

// Mönster-test: DEAL_CYCLE_EXCLUSIONS från Dag 6 spec
{
  const dealCycleRules: ExclusionRule<SampleRow>[] = [
    { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' },
  ]
  const result = applyExclusions(samples, dealCycleRules)
  assertEqual(result.kept.length, 3, 'deal_cycle: 3 kept (a, c, e)')
  assertEqual(result.excluded.length, 2, 'deal_cycle: 2 excluded (b, d)')
  assertEqual(result.excluded_by_reason, { 'cycle < 1 day': 2 }, 'reason-count = 2')
  assertEqual(
    result.kept.map(s => s.id).sort(),
    ['a', 'c', 'e'],
    'rätt samples kept',
  )
}

// Två rules, första vinner
{
  const rules: ExclusionRule<SampleRow>[] = [
    { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' },
    { predicate: d => !d.has_customer, reason: 'missing customer' },
  ]
  const result = applyExclusions(samples, rules)
  // a, c kept (uppfyller båda)
  // b, d exkluderas av 'cycle < 1 day'
  // e exkluderas av 'missing customer'
  assertEqual(result.kept.length, 2, '2 kept (a, c)')
  assertEqual(result.excluded.length, 3, '3 excluded (b, d, e)')
  assertEqual(
    result.excluded_by_reason,
    { 'cycle < 1 day': 2, 'missing customer': 1 },
    'split reason-counts korrekt',
  )
}

// Två rules där samme sample triggar båda — första vinner
{
  const sample: SampleRow = { id: 'z', cycle_days: 0, has_customer: false }
  const rules: ExclusionRule<SampleRow>[] = [
    { predicate: d => d.cycle_days < 1, reason: 'cycle < 1 day' },
    { predicate: d => !d.has_customer, reason: 'missing customer' },
  ]
  const result = applyExclusions([sample], rules)
  assertEqual(result.excluded.length, 1, '1 excluded')
  assertEqual(
    result.excluded_by_reason,
    { 'cycle < 1 day': 1 },
    'första rule vinner (cycle < 1 day, inte missing customer)',
  )
}

// Tom samples
{
  const result = applyExclusions([], [{ predicate: () => true, reason: 'never-applied' }])
  assertEqual(result.kept.length, 0, 'tom input → 0 kept')
  assertEqual(result.excluded.length, 0, 'tom input → 0 excluded')
  assertEqual(result.excluded_by_reason, {}, 'tom input → tomt reason-map')
}

// ─────────────────────────────────────────────────────────────────
// summarizeExclusions
// ─────────────────────────────────────────────────────────────────

section('summarizeExclusions')

assertEqual(
  summarizeExclusions({ kept: [1, 2, 3], excluded: [], excluded_by_reason: {} }),
  { excluded_outliers: 0 },
  'inga exklueringar → bara excluded_outliers=0',
)

assertEqual(
  summarizeExclusions({
    kept: [1, 2],
    excluded: [3, 4],
    excluded_by_reason: { 'cycle < 1 day': 2 },
  }),
  {
    excluded_outliers: 2,
    exclusion_reason: 'cycle < 1 day',
    excluded_by_reason: { 'cycle < 1 day': 2 },
  },
  'en reason → exclusion_reason = den reason',
)

assertEqual(
  summarizeExclusions({
    kept: [1],
    excluded: [2, 3, 4, 5],
    excluded_by_reason: { 'cycle < 1 day': 2, 'missing customer': 2 },
  }),
  {
    excluded_outliers: 4,
    exclusion_reason: 'mixed',
    excluded_by_reason: { 'cycle < 1 day': 2, 'missing customer': 2 },
  },
  'flera reasons → exclusion_reason = "mixed"',
)

// ─────────────────────────────────────────────────────────────────
// extractAgentId
// ─────────────────────────────────────────────────────────────────

section('extractAgentId')

assertEqual(
  extractAgentId({ payload: { agent_id: 'karin' } }),
  'karin',
  'agent_id direkt',
)

assertEqual(
  extractAgentId({ payload: { agent_id: 'Karin' } }),
  'karin',
  'agent_id lowercase-normaliserad',
)

assertEqual(
  extractAgentId({ payload: { agent_id: '  daniel  ' } }),
  'daniel',
  'agent_id trimmad',
)

assertEqual(
  extractAgentId({ payload: { routed_agent: 'lars' } }),
  'lars',
  'routed_agent fallback när agent_id saknas',
)

assertEqual(
  extractAgentId({ payload: { agent_id: 'karin', routed_agent: 'daniel' } }),
  'karin',
  'agent_id vinner över routed_agent (typed actions har prioritet)',
)

assertEqual(
  extractAgentId({ payload: {} }),
  null,
  'tomt payload → null',
)

assertEqual(
  extractAgentId({ payload: null }),
  null,
  'null payload → null',
)

assertEqual(
  extractAgentId({ payload: { agent_id: '' } }),
  null,
  'tom string-agent_id → fallback (här null eftersom inget routed_agent)',
)

assertEqual(
  extractAgentId({ payload: { agent_id: '   ' } }),
  null,
  'whitespace-only agent_id → fallback',
)

assertEqual(
  extractAgentId({ payload: { agent_id: 123 } as Record<string, unknown> }),
  null,
  'non-string agent_id → null (defensiv)',
)

assertEqual(
  extractAgentId({ payload: { agent_id: '', routed_agent: 'lisa' } }),
  'lisa',
  'tom agent_id → fallback till routed_agent',
)

// ─────────────────────────────────────────────────────────────────
// Pattern-config sanity
// ─────────────────────────────────────────────────────────────────

section('PATTERN_THRESHOLDS sanity')

const keys = Object.keys(PATTERN_THRESHOLDS) as Array<keyof typeof PATTERN_THRESHOLDS>
for (const key of keys) {
  const cfg = PATTERN_THRESHOLDS[key]
  if (cfg.preliminary >= cfg.medium) {
    failed++
    console.log(`  ✗ ${key}: preliminary (${cfg.preliminary}) >= medium (${cfg.medium})`)
  } else if (cfg.medium >= cfg.high) {
    failed++
    console.log(`  ✗ ${key}: medium (${cfg.medium}) >= high (${cfg.high})`)
  } else if (cfg.window_days <= 0) {
    failed++
    console.log(`  ✗ ${key}: window_days (${cfg.window_days}) <= 0`)
  } else {
    passed++
    console.log(`  ✓ ${key}: trösklar och window monotont ökande`)
  }
}

// ─────────────────────────────────────────────────────────────────
// Resultat
// ─────────────────────────────────────────────────────────────────

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`)
console.log(`Resultat: ${passed} passed, ${failed} failed`)

if (failed > 0) {
  process.exit(1)
}
process.exit(0)
