/**
 * Facit för lib/customers/reactivation-signal.ts ("Låt Matte väga in det",
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Testar bara den RENA grupperings-/räknings-/filtrerings-/sorteringsdelen
 * (groupByJobType) — samma stil som summarizeByPattern i
 * lib/playbook/checkpoint-outcomes.ts facit-testas: synteska
 * indata-arrayer, ingen mockad Supabase-klient.
 *
 * Körs: npx playwright test tests/reactivation-signal.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { groupByJobType, MIN_REACTIVATION_GROUP_SIZE } from '../lib/customers/reactivation-signal'

test.describe('groupByJobType — ren gruppering/räkning/filtrering/sortering', () => {
  test('tom lista ger tom lista', () => {
    expect(groupByJobType([])).toEqual([])
  })

  test('grupperar och räknar per job_type', () => {
    const entries = [
      ...Array(6).fill({ job_type: 'badrum' }),
      ...Array(3).fill({ job_type: 'kök' }),
    ]
    // 'kök' hamnar under tröskeln (3 < 5) och filtreras bort.
    expect(groupByJobType(entries)).toEqual([{ job_type: 'badrum', count: 6 }])
  })

  test(`grupp under MIN_REACTIVATION_GROUP_SIZE (${MIN_REACTIVATION_GROUP_SIZE}) filtreras bort`, () => {
    const entries = Array(MIN_REACTIVATION_GROUP_SIZE - 1).fill({ job_type: 'tak' })
    expect(groupByJobType(entries)).toEqual([])
  })

  test('grupp exakt på MIN_REACTIVATION_GROUP_SIZE inkluderas (inklusiv gräns)', () => {
    const entries = Array(MIN_REACTIVATION_GROUP_SIZE).fill({ job_type: 'tak' })
    expect(groupByJobType(entries)).toEqual([{ job_type: 'tak', count: MIN_REACTIVATION_GROUP_SIZE }])
  })

  test('sorterar fallande efter count', () => {
    const entries = [
      ...Array(5).fill({ job_type: 'el' }),
      ...Array(9).fill({ job_type: 'badrum' }),
      ...Array(7).fill({ job_type: 'kök' }),
    ]
    const result = groupByJobType(entries)
    expect(result.map(g => g.job_type)).toEqual(['badrum', 'kök', 'el'])
    expect(result.map(g => g.count)).toEqual([9, 7, 5])
  })

  test('vid oavgjort mellan grupper behålls stabil insättningsordning', () => {
    const entries = [
      ...Array(5).fill({ job_type: 'kök' }),
      ...Array(5).fill({ job_type: 'badrum' }),
    ]
    const result = groupByJobType(entries)
    expect(result.map(g => g.job_type)).toEqual(['kök', 'badrum'])
  })

  test('flera jobbtyper blandade — resultatet innehåller bara grupper på/över tröskeln, sorterat', () => {
    const entries = [
      ...Array(3).fill({ job_type: 'vvs' }),
      ...Array(5).fill({ job_type: 'tak' }),
      ...Array(10).fill({ job_type: 'badrum' }),
    ]
    expect(groupByJobType(entries)).toEqual([
      { job_type: 'badrum', count: 10 },
      { job_type: 'tak', count: 5 },
    ])
  })
})
