/**
 * FACIT — lib/mission/mission-outreach.ts (Goal-to-Plan V2, Etapp J).
 *
 * Vaktposterna som låses här:
 *  - budgeten (remaining) blir aldrig negativ
 *  - en redan kontaktad/öppen-korts-kund riktas aldrig mot igen
 *  - segmentfilter appliceras BARA när uppdragets plansteg bär job_type-bevis
 *  - inget segment → segment-agnostisk default (alla tysta kunder kvalificerar)
 *  - taket (max) respekteras alltid, kandidatordningen bevaras
 *
 * Körs: npx playwright test tests/mission-outreach.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  beraknaOutreachBudget,
  filtreraMissionKandidater,
  stepJobTypesForMission,
} from '../lib/mission/mission-outreach'
import type { QuietCustomerRow } from '../lib/customers/quiet-customer'

function kund(overrides: Partial<QuietCustomerRow>): QuietCustomerRow {
  return {
    customer_id: 'c_1',
    name: 'Andersson',
    phone_number: '+46701234567',
    last_job_date: '2026-01-01',
    ...overrides,
  }
}

test.describe('beraknaOutreachBudget', () => {
  test('remaining = goal_count − contacted_distinct − open_mission_cards', () => {
    const budget = beraknaOutreachBudget({ goal_count: 10, contacted_distinct: 3, open_mission_cards: 2 })
    expect(budget.remaining).toBe(5)
  })

  test('remaining blir aldrig negativ, även när kontaktade+öppna överstiger målet', () => {
    const budget = beraknaOutreachBudget({ goal_count: 5, contacted_distinct: 4, open_mission_cards: 3 })
    expect(budget.remaining).toBe(0)
  })

  test('nollmål → noll utrymme', () => {
    expect(beraknaOutreachBudget({ goal_count: 0, contacted_distinct: 0, open_mission_cards: 0 }).remaining).toBe(0)
  })

  test('exakt uppnått mål → noll kvar', () => {
    expect(beraknaOutreachBudget({ goal_count: 10, contacted_distinct: 10, open_mission_cards: 0 }).remaining).toBe(0)
  })

  test('rapporterar tillbaka indata oförändrade (rundat, aldrig negativa) i svaret', () => {
    const budget = beraknaOutreachBudget({ goal_count: 12, contacted_distinct: 4, open_mission_cards: 1 })
    expect(budget).toEqual({ goal_count: 12, contacted_distinct: 4, open_mission_cards: 1, remaining: 7 })
  })
})

test.describe('filtreraMissionKandidater — dedup', () => {
  test('en redan kontaktad kund väljs aldrig igen', () => {
    const candidates = [kund({ customer_id: 'c_1' }), kund({ customer_id: 'c_2' })]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(['c_1']),
      max: 5,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_2'])
  })

  test('en kund med öppet mission-kort väljs aldrig igen (samma spärr som exekverad kontakt)', () => {
    const candidates = [kund({ customer_id: 'c_1' })]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(['c_1']),
      max: 5,
    })
    expect(result).toEqual([])
  })
})

test.describe('filtreraMissionKandidater — segment', () => {
  test('inga job_type-segment → alla tysta kunder kvalificerar (segment-agnostisk default)', () => {
    const candidates = [kund({ customer_id: 'c_1' }), kund({ customer_id: 'c_2' })]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(), // ingen känd job_type alls
      alreadyTargetedCustomerIds: new Set(),
      max: 5,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_1', 'c_2'])
  })

  test('job_type-segment satt → bara matchande kunder kvalificerar', () => {
    const candidates = [
      kund({ customer_id: 'c_badrum' }),
      kund({ customer_id: 'c_kok' }),
      kund({ customer_id: 'c_okand' }),
    ]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: ['badrum'],
      latestJobTypeByCustomer: new Map([
        ['c_badrum', 'badrum'],
        ['c_kok', 'kok'],
        // c_okand saknar entry helt
      ]),
      alreadyTargetedCustomerIds: new Set(),
      max: 5,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_badrum'])
  })

  test('flera segment i planen → matchning mot vilket som helst av dem', () => {
    const candidates = [
      kund({ customer_id: 'c_badrum' }),
      kund({ customer_id: 'c_kok' }),
      kund({ customer_id: 'c_el' }),
    ]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: ['badrum', 'kok'],
      latestJobTypeByCustomer: new Map([
        ['c_badrum', 'badrum'],
        ['c_kok', 'kok'],
        ['c_el', 'el'],
      ]),
      alreadyTargetedCustomerIds: new Set(),
      max: 5,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_badrum', 'c_kok'])
  })

  test('kund med null-job_type i mappen räknas som okänd → exkluderas när segment är satt', () => {
    const candidates = [kund({ customer_id: 'c_1' })]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: ['badrum'],
      latestJobTypeByCustomer: new Map([['c_1', null]]),
      alreadyTargetedCustomerIds: new Set(),
      max: 5,
    })
    expect(result).toEqual([])
  })
})

test.describe('filtreraMissionKandidater — taket och ordningen', () => {
  test('max respekteras även när fler kvalificerar', () => {
    const candidates = [
      kund({ customer_id: 'c_1' }),
      kund({ customer_id: 'c_2' }),
      kund({ customer_id: 'c_3' }),
    ]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(),
      max: 2,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_1', 'c_2'])
  })

  test('max 0 → tom lista, ingen krasch', () => {
    const candidates = [kund({ customer_id: 'c_1' })]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(),
      max: 0,
    })
    expect(result).toEqual([])
  })

  test('kandidaternas inbördes ordning bevaras (mest inaktiva-först kommer in oförändrad)', () => {
    const candidates = [
      kund({ customer_id: 'c_3', last_job_date: '2025-01-01' }),
      kund({ customer_id: 'c_1', last_job_date: '2024-01-01' }),
      kund({ customer_id: 'c_2', last_job_date: '2024-06-01' }),
    ]
    const result = filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(),
      max: 10,
    })
    expect(result.map(c => c.customer_id)).toEqual(['c_3', 'c_1', 'c_2'])
  })

  test('muterar inte input-listan', () => {
    const candidates = [kund({ customer_id: 'c_1' }), kund({ customer_id: 'c_2' })]
    const copy = [...candidates]
    filtreraMissionKandidater({
      candidates,
      stepJobTypes: [],
      latestJobTypeByCustomer: new Map(),
      alreadyTargetedCustomerIds: new Set(),
      max: 1,
    })
    expect(candidates).toEqual(copy)
  })
})

test.describe('stepJobTypesForMission', () => {
  test('läser job_type ur customer_group-bevis (opportunity-portfolio.ts-konventionen)', () => {
    const result = stepJobTypesForMission([
      { evidence: { table: 'customer_group', ref_id: 'badrum' } },
      { evidence: { table: 'invoice', ref_id: 'inv_1' } },
    ])
    expect(result).toEqual(['badrum'])
  })

  test('flera återaktiveringssteg → unika job_types, ingen dubblett', () => {
    const result = stepJobTypesForMission([
      { evidence: { table: 'customer_group', ref_id: 'badrum' } },
      { evidence: { table: 'customer_group', ref_id: 'kok' } },
      { evidence: { table: 'customer_group', ref_id: 'badrum' } },
    ])
    expect(result.sort()).toEqual(['badrum', 'kok'])
  })

  test('inga customer_group-steg → tom lista (segment-agnostisk default uppströms)', () => {
    const result = stepJobTypesForMission([
      { evidence: { table: 'invoice', ref_id: 'inv_1' } },
      { evidence: { table: 'quotes', ref_id: 'q_1' } },
    ])
    expect(result).toEqual([])
  })

  test('tom/saknad steg-lista → tom lista, ingen krasch', () => {
    expect(stepJobTypesForMission([])).toEqual([])
    expect(stepJobTypesForMission(undefined)).toEqual([])
    expect(stepJobTypesForMission(null)).toEqual([])
  })

  test('steg utan evidence → hoppas defensivt över', () => {
    const result = stepJobTypesForMission([{ evidence: null }, { evidence: { table: 'customer_group', ref_id: 'badrum' } }])
    expect(result).toEqual(['badrum'])
  })
})
