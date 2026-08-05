/**
 * Per-person-medveten kapacitet — facit-tester för de rena delarna
 * (tasks/resurs-masterplan.md, R5, Etapp 8 ur multi-employee-parity-plan.md).
 * Körs: npx playwright test tests/kapacitet-fyllnad-per-person.spec.ts --no-deps
 *
 * Egen fil (rör INTE tests/kapacitet-fyllnad.spec.ts) — det beviset ska
 * fortsätta passera oförändrat, det är beviset på att business-aggregatet
 * (computeWeekCapacity/getWeekCapacity, THIN_WEEK_UTILIZATION_THRESHOLD) är
 * orört av denna sprint. computeNextWeekPersonBreakdown (I/O-wrappern) testas
 * INTE här — den kräver en riktig Supabase-klient, samma princip som
 * runCapacityFill i den andra spec-filen.
 */
import { test, expect } from '@playwright/test'
import {
  identifyThinPeople,
  formatPersonUtilizationBreakdown,
  PERSON_BREAKDOWN_MAX_NAMES,
  type PersonWeekSnapshot,
} from '../lib/agents/hanna/capacity-fill'
import { THIN_WEEK_UTILIZATION_THRESHOLD } from '../lib/capacity/week-capacity'

function snapshot(overrides: Partial<PersonWeekSnapshot> = {}): PersonWeekSnapshot {
  return {
    business_user_id: 'user_1',
    name: 'Micke',
    utilization_pct: 20,
    ...overrides,
  }
}

test.describe('identifyThinPeople', () => {
  test('återanvänder SAMMA tröskel som business-aggregatet (40%)', () => {
    expect(THIN_WEEK_UTILIZATION_THRESHOLD).toBe(40)
  })

  test('filtrerar bort personer på eller över tröskeln', () => {
    const result = identifyThinPeople([
      snapshot({ business_user_id: 'u1', name: 'Micke', utilization_pct: 20 }),
      snapshot({ business_user_id: 'u2', name: 'Johan', utilization_pct: 85 }),
      snapshot({ business_user_id: 'u3', name: 'Anna', utilization_pct: 39 }),
      snapshot({ business_user_id: 'u4', name: 'Erik', utilization_pct: 40 }),
    ])
    expect(result.map((p) => p.name)).toEqual(['Micke', 'Anna'])
  })

  test('sorterar tunnast beläggning först', () => {
    const result = identifyThinPeople([
      snapshot({ name: 'Anna', utilization_pct: 35 }),
      snapshot({ name: 'Micke', utilization_pct: 5 }),
      snapshot({ name: 'Erik', utilization_pct: 20 }),
    ])
    expect(result.map((p) => p.name)).toEqual(['Micke', 'Erik', 'Anna'])
  })

  test('anpassningsbar tröskel (egen parameter) för framtida bruk', () => {
    const result = identifyThinPeople(
      [snapshot({ name: 'Anna', utilization_pct: 55 }), snapshot({ name: 'Micke', utilization_pct: 20 })],
      60,
    )
    expect(result.map((p) => p.name)).toEqual(['Micke', 'Anna'])
  })

  test('tom lista in → tom lista ut, ingen krasch', () => {
    expect(identifyThinPeople([])).toEqual([])
  })

  test('muterar inte originallistan', () => {
    const original = [snapshot({ name: 'Anna', utilization_pct: 35 }), snapshot({ name: 'Micke', utilization_pct: 5 })]
    const copy = [...original]
    identifyThinPeople(original)
    expect(original).toEqual(copy)
  })

  test('ingen under tröskeln → tom lista', () => {
    const result = identifyThinPeople([snapshot({ utilization_pct: 85 }), snapshot({ utilization_pct: 92 })])
    expect(result).toEqual([])
  })
})

test.describe('formatPersonUtilizationBreakdown', () => {
  test('tom lista → tom sträng', () => {
    expect(formatPersonUtilizationBreakdown([])).toBe('')
  })

  test('en person → "Namn X%"', () => {
    const text = formatPersonUtilizationBreakdown([snapshot({ name: 'Micke', utilization_pct: 20 })])
    expect(text).toBe('Micke 20%')
  })

  test('flera personer → kommaseparerad, tunnast först', () => {
    const text = formatPersonUtilizationBreakdown([
      snapshot({ name: 'Johan', utilization_pct: 30 }),
      snapshot({ name: 'Micke', utilization_pct: 5 }),
    ])
    expect(text).toBe('Micke 5%, Johan 30%')
  })

  test(`klipper till max ${PERSON_BREAKDOWN_MAX_NAMES} namn`, () => {
    const people = [
      snapshot({ name: 'A', utilization_pct: 10 }),
      snapshot({ name: 'B', utilization_pct: 20 }),
      snapshot({ name: 'C', utilization_pct: 30 }),
      snapshot({ name: 'D', utilization_pct: 5 }),
    ]
    const text = formatPersonUtilizationBreakdown(people)
    const names = text.split(', ').map((s) => s.split(' ')[0])
    expect(names).toHaveLength(PERSON_BREAKDOWN_MAX_NAMES)
    // Tunnast (D, 5%) måste finnas kvar efter klippningen.
    expect(names).toContain('D')
    expect(names).not.toContain('C')
  })

  test('muterar inte originallistan', () => {
    const original = [snapshot({ name: 'Johan', utilization_pct: 30 }), snapshot({ name: 'Micke', utilization_pct: 5 })]
    const copy = [...original]
    formatPersonUtilizationBreakdown(original)
    expect(original).toEqual(copy)
  })
})
