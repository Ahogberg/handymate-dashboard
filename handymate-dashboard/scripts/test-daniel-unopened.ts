/**
 * Unit-tester för Daniel obeöppnad-offert-trigger (2026-06-03).
 *
 * Rena funktioner — predikatet isUnopenedActionable och helpern daysSinceSent.
 * Inga DB-anrop, inget supabase-mock.
 *
 * Körning:  npx tsx scripts/test-daniel-unopened.ts
 * Exit 0 = alla passerade. 1 = något fail:ade.
 *
 * Same pattern som scripts/test-patterns.ts.
 */

import {
  isUnopenedActionable,
  daysSinceSent,
  UNOPENED_WINDOW_MIN_DAYS,
  UNOPENED_WINDOW_MAX_DAYS,
  type UnopenedCandidate,
} from '../lib/agents/daniel/unopened-quotes'

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
// Tidshjälp: bygg ISO-sträng N dagar bakåt från `now`-anchor
// ─────────────────────────────────────────────────────────────────

const NOW = new Date('2026-06-03T10:00:00.000Z').getTime()

function daysAgo(days: number): string {
  return new Date(NOW - days * 86400000).toISOString()
}

function quote(overrides: Partial<UnopenedCandidate>): UnopenedCandidate {
  return {
    quote_id: 'q_test',
    status: 'sent',
    view_count: 0,
    sent_at: daysAgo(7),
    ...overrides,
  }
}

// ─────────────────────────────────────────────────────────────────
// Konstanter
// ─────────────────────────────────────────────────────────────────

section('konstanter — fönster 5-14d per spec')
assertEqual(UNOPENED_WINDOW_MIN_DAYS, 5, 'min-fönster = 5 dagar')
assertEqual(UNOPENED_WINDOW_MAX_DAYS, 14, 'max-fönster = 14 dagar')

// ─────────────────────────────────────────────────────────────────
// daysSinceSent
// ─────────────────────────────────────────────────────────────────

section('daysSinceSent — null + floor-avrundning')

assertEqual(daysSinceSent(null, NOW), null, 'sent_at=null → null')
assertEqual(
  daysSinceSent(daysAgo(5), NOW),
  5,
  'exakt 5 dagar sedan → 5',
)
assertEqual(
  daysSinceSent(new Date(NOW - 5 * 86400000 - 60 * 60 * 1000).toISOString(), NOW),
  5,
  '5d + 1h sedan → 5 (floor)',
)
assertEqual(
  daysSinceSent(new Date(NOW + 86400000).toISOString(), NOW),
  null,
  'sent_at i framtiden → null (skydd)',
)

// ─────────────────────────────────────────────────────────────────
// isUnopenedActionable — predikat-tester (spec-fall)
// ─────────────────────────────────────────────────────────────────

section('isUnopenedActionable — spec-tester (alla 5 fall)')

// 1. sent + view_count=0 + 5 dagar → trigger
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: daysAgo(5) }), NOW),
  true,
  '5d gammal sent + view_count=0 → TRIGGER',
)

// 2. sent + view_count=0 + 3 dagar → ingen trigger (för färsk)
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: daysAgo(3) }), NOW),
  false,
  '3d gammal → ingen trigger (under min-fönster)',
)

// 3. sent + view_count=0 + 15 dagar → ingen trigger (utanför fönster)
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: daysAgo(15) }), NOW),
  false,
  '15d gammal → ingen trigger (över max-fönster)',
)

// 4. sent + view_count=1 + 7 dagar → ingen trigger (öppnad, stale-opens-pathen)
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 1, sent_at: daysAgo(7) }), NOW),
  false,
  '7d gammal med view_count=1 → ingen trigger (öppnad)',
)

// 5. accepted + view_count=0 + 7 dagar → ingen trigger (fel status)
assertEqual(
  isUnopenedActionable(quote({ status: 'accepted', view_count: 0, sent_at: daysAgo(7) }), NOW),
  false,
  'accepted-status → ingen trigger',
)

// ─────────────────────────────────────────────────────────────────
// Edge-cases bortom spec
// ─────────────────────────────────────────────────────────────────

section('isUnopenedActionable — edge-cases')

// Fönster-gränser inklusiva båda sidor
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: daysAgo(5) }), NOW),
  true,
  'dag 5 (min-gräns) → trigger',
)
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: daysAgo(14) }), NOW),
  true,
  'dag 14 (max-gräns) → trigger',
)

// view_count null behandlas som 0
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: null, sent_at: daysAgo(7) }), NOW),
  true,
  'view_count=null behandlas som 0 → trigger',
)

// sent_at null → skip (data-issue)
assertEqual(
  isUnopenedActionable(quote({ status: 'sent', view_count: 0, sent_at: null }), NOW),
  false,
  'sent_at=null → skip (skydd mot data-issue)',
)

// Andra status-värden
for (const status of ['draft', 'expired', 'declined', 'signed', 'pending_approval']) {
  assertEqual(
    isUnopenedActionable(quote({ status, view_count: 0, sent_at: daysAgo(7) }), NOW),
    false,
    `status='${status}' → ingen trigger`,
  )
}

// ─────────────────────────────────────────────────────────────────
// Resultat
// ─────────────────────────────────────────────────────────────────

console.log(`\n${passed} passed, ${failed} failed`)
process.exit(failed > 0 ? 1 : 0)
