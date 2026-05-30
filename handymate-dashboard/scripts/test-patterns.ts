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
import { computeApproveRate, type ApprovalSample } from '../lib/patterns/calculators/approve-rate'

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
// computeApproveRate (ren funktion — DB-fritt)
// ─────────────────────────────────────────────────────────────────

section('computeApproveRate')

const WINDOW_START = '2026-04-30T00:00:00Z'
const WINDOW_END = '2026-05-30T00:00:00Z'

function makeApproval(
  status: string,
  agentId: string | null,
  created_at: string,
  approval_type: string = 'send_sms',  // default actionable för existerande tester
): ApprovalSample {
  return {
    id: `appr_${Math.random().toString(36).slice(2, 8)}`,
    status,
    approval_type,
    payload: agentId ? { agent_id: agentId } : {},
    created_at,
  }
}

// Tom samples-array
{
  const result = computeApproveRate([], WINDOW_START, WINDOW_END)
  assertEqual(result.sample_size, 0, 'tom array → sample_size=0')
  assertEqual(result.pattern_key, 'approve_rate', 'pattern_key korrekt')
  assertEqual((result.value as { overall_rate: number | null }).overall_rate, null, 'overall_rate=null vid n=0')
  assertEqual((result.value as { overall_n: number }).overall_n, 0, 'overall_n=0')
}

// Bara null-agent approvals (autopilot etc) → räknas i overall men ej per-agent
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', null, '2026-05-29T10:00:00Z'),
    makeApproval('rejected', null, '2026-05-29T11:00:00Z'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, unknown>; overall_rate: number; overall_n: number }
  assertEqual(result.sample_size, 2, 'sample_size=2 trots null-agents')
  assertEqual(Object.keys(val.per_agent).length, 0, 'per_agent tomt (null exkluderas)')
  assertEqual(val.overall_n, 2, 'overall_n=2')
  assertEqual(val.overall_rate, 0.5, 'overall_rate=0.5 (1 approved av 2)')
}

// Karin: 3 approved, 1 rejected → rate 75%
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'karin', '2026-05-29T10:00:00Z'),
    makeApproval('approved', 'karin', '2026-05-29T11:00:00Z'),
    makeApproval('approved', 'karin', '2026-05-29T12:00:00Z'),
    makeApproval('rejected', 'karin', '2026-05-29T13:00:00Z'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, { approved: number; rejected: number; edited: number; rate: number | null; n: number }> }
  assertEqual(val.per_agent.karin.approved, 3, 'Karin approved=3')
  assertEqual(val.per_agent.karin.rejected, 1, 'Karin rejected=1')
  assertEqual(val.per_agent.karin.edited, 0, 'Karin edited=0')
  assertEqual(val.per_agent.karin.rate, 0.75, 'Karin rate=0.75')
  assertEqual(val.per_agent.karin.n, 4, 'Karin n=4')
}

// Mix av agenter + edited
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'karin', '2026-05-29T10:00:00Z'),
    makeApproval('approved', 'karin', '2026-05-29T11:00:00Z'),
    makeApproval('edited', 'karin', '2026-05-29T12:00:00Z'),
    makeApproval('approved', 'daniel', '2026-05-29T13:00:00Z'),
    makeApproval('rejected', 'daniel', '2026-05-29T14:00:00Z'),
    makeApproval('rejected', 'daniel', '2026-05-29T15:00:00Z'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, { approved: number; rejected: number; edited: number; rate: number | null; n: number }>; overall_rate: number; overall_n: number }

  // Karin: 2 approved + 1 edited → rate = 2/3
  assertEqual(val.per_agent.karin.approved, 2, 'Karin approved=2')
  assertEqual(val.per_agent.karin.edited, 1, 'Karin edited=1')
  assertEqual(val.per_agent.karin.rate, 2 / 3, 'Karin rate = 2/3 (edited räknas inte som approved)')

  // Daniel: 1 approved + 2 rejected → rate = 1/3
  assertEqual(val.per_agent.daniel.approved, 1, 'Daniel approved=1')
  assertEqual(val.per_agent.daniel.rejected, 2, 'Daniel rejected=2')
  assertEqual(val.per_agent.daniel.rate, 1 / 3, 'Daniel rate = 1/3')

  // Overall: 3 approved + 2 rejected + 1 edited = 6 → rate 3/6 = 0.5
  assertEqual(val.overall_n, 6, 'overall_n=6')
  assertEqual(val.overall_rate, 0.5, 'overall_rate=0.5')
}

// Defensiv: icke-resolved status (pending, expired) ska ignoreras
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'karin', '2026-05-29T10:00:00Z'),
    makeApproval('pending', 'karin', '2026-05-29T11:00:00Z'),  // exkluderas
    makeApproval('expired', 'karin', '2026-05-29T12:00:00Z'),  // exkluderas
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, { n: number }> }
  assertEqual(result.sample_size, 1, 'bara approved räknas (pending/expired exkluderade)')
  assertEqual(val.per_agent.karin.n, 1, 'Karin n=1')
}

// routed_agent-fallback fungerar för legacy (men typed action — agent_observation
// exkluderas separat nedan)
{
  const samples: ApprovalSample[] = [
    {
      id: 'a1',
      status: 'approved',
      approval_type: 'send_sms',  // typed → räknas
      payload: { routed_agent: 'lars' },  // legacy: bara routed_agent
      created_at: '2026-05-29T10:00:00Z',
    },
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, { approved: number }> }
  assertEqual(val.per_agent.lars.approved, 1, 'routed_agent → lars räknad (typed action)')
}

// Andreas-spec (2026-05-30): agent_observation EXKLUDERAS
section('computeApproveRate — APPROVE_RATE_EXCLUSIONS')

// 5 Lars agent_observation + 3 Karin send_sms → bara Karin räknas
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'lars', '2026-05-29T10:00:00Z', 'agent_observation'),
    makeApproval('approved', 'lars', '2026-05-29T11:00:00Z', 'agent_observation'),
    makeApproval('approved', 'lars', '2026-05-29T12:00:00Z', 'agent_observation'),
    makeApproval('approved', 'lars', '2026-05-29T13:00:00Z', 'agent_observation'),
    makeApproval('approved', 'lars', '2026-05-29T14:00:00Z', 'agent_observation'),
    makeApproval('approved', 'karin', '2026-05-29T15:00:00Z', 'send_sms'),
    makeApproval('rejected', 'karin', '2026-05-29T16:00:00Z', 'send_sms'),
    makeApproval('approved', 'karin', '2026-05-29T17:00:00Z', 'send_sms'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { per_agent: Record<string, unknown>; overall_n: number }

  assertEqual(result.sample_size, 3, 'sample_size=3 (5 Lars exkluderade)')
  assertEqual(val.overall_n, 3, 'overall_n=3 (bara Karin send_sms räknas)')
  assertEqual(
    (val.per_agent.lars as undefined),
    undefined,
    'Lars finns inte i per_agent (alla agent_observation exkluderade)',
  )

  const meta = result.metadata as { excluded_outliers: number; exclusion_reason?: string }
  assertEqual(meta.excluded_outliers, 5, 'metadata.excluded_outliers=5')
  assertEqual(
    meta.exclusion_reason,
    'generic_observation_not_actionable',
    'exclusion_reason satt',
  )
}

// agent_insight exkluderas också
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'hanna', '2026-05-29T10:00:00Z', 'agent_insight'),
    makeApproval('approved', 'karin', '2026-05-29T11:00:00Z', 'send_invoice'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  assertEqual(result.sample_size, 1, 'sample_size=1 (Hanna agent_insight exkluderad)')
  const meta = result.metadata as { excluded_outliers: number }
  assertEqual(meta.excluded_outliers, 1, 'excluded_outliers=1')
}

// Bee:s reality-test: bara Lars agent_observation + null testdata
// → 0 mätbara samples (replikerar dagens A/B-resultat)
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'lars', '2026-05-30T06:10:57Z', 'agent_observation'),
    makeApproval('approved', 'lars', '2026-05-30T06:10:56Z', 'agent_observation'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const val = result.value as { overall_n: number; overall_rate: number | null }
  assertEqual(result.sample_size, 0, 'Bee-reality: 0 mätbara approve_rate-samples')
  assertEqual(val.overall_rate, null, 'overall_rate=null (inget att räkna)')
  assertEqual(val.overall_n, 0, 'overall_n=0')
}

// Inga exklueringar när alla samples är actionable
{
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'karin', '2026-05-29T10:00:00Z', 'send_sms'),
    makeApproval('rejected', 'karin', '2026-05-29T11:00:00Z', 'send_invoice'),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const meta = result.metadata as { excluded_outliers: number; exclusion_reason?: string }
  assertEqual(meta.excluded_outliers, 0, 'inga exklueringar → 0')
  assertEqual(meta.exclusion_reason, undefined, 'inget reason när 0 exklueringar')
}

// Metadata: oldest_sample_days_ago
{
  const oldDate = new Date(Date.now() - 25 * 86400000).toISOString()  // 25 dagar sen
  const samples: ApprovalSample[] = [
    makeApproval('approved', 'karin', oldDate),
    makeApproval('approved', 'karin', new Date().toISOString()),
  ]
  const result = computeApproveRate(samples, WINDOW_START, WINDOW_END)
  const meta = result.metadata as { oldest_sample_days_ago?: number }
  // Tillåt ±1 dag drift
  const age = meta.oldest_sample_days_ago || 0
  if (age >= 24 && age <= 26) {
    passed++
    console.log(`  ✓ oldest_sample_days_ago ~25 dagar (faktiskt: ${age})`)
  } else {
    failed++
    console.log(`  ✗ oldest_sample_days_ago = ${age}, förväntat 24-26`)
  }
}

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
