/**
 * FACIT — lib/mission/plan-validation.ts + lib/mission/mission-presentation.ts
 * (Goal-to-Plan V1, Etapp A).
 *
 * Vaktposten som låses här: LLM:en får bara peka på portföljens item-id:n och
 * motivera — måttet på varje steg KOPIERAS från portföljen server-side. Ett
 * insmugglat belopp på inputsteget ignoreras helt.
 *
 * Körs: npx playwright test tests/mission-plan-validation.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { assembleOpportunityPortfolio } from '../lib/mission/opportunity-portfolio'
import { validateMissionPlan, type MissionPlanInput } from '../lib/mission/plan-validation'
import { isMissionPlanPresentation, type MissionPlanPresentation } from '../lib/mission/mission-presentation'

const NOW = new Date('2026-08-17T12:00:00Z')

function portfolio() {
  return assembleOpportunityPortfolio({
    overdueInvoices: [
      { invoice_id: 'inv_1', invoice_number: '2024-118', total: 40000, customer_name: 'Andersson' },
    ],
    missedRevenue: [],
    staleQuotes: [
      { quote_id: 'q_1', quote_number: 'OFF-42', total: 55000, customer_name: 'Svensson' },
    ],
    quietGroups: [{ job_type: 'badrum', count: 7 }],
    marginWarnings: [],
  }, NOW)
}

function giltigPlan(p = portfolio()): MissionPlanInput {
  return {
    goal_kr: 150000,
    deadline: '2026-09-30',
    steps: [
      { item_id: p.by_class.indrivningsbart[0].id, motivation: 'Redan intjänade pengar först' },
      { item_id: p.by_class.pipeline[0].id, motivation: 'Offerten är stor och färsk nog' },
    ],
  }
}

test.describe('validateMissionPlan — avvisningar', () => {
  test('okänt item_id avvisas', () => {
    const plan = giltigPlan()
    plan.steps[0].item_id = 'pf_finnsinte000'
    const res = validateMissionPlan(plan, portfolio(), NOW)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('unknown_item')
  })

  test('6 steg avvisas', () => {
    const p = portfolio()
    const plan = giltigPlan(p)
    plan.steps = Array(6).fill(null).map((_, i) => ({
      item_id: p.by_class.indrivningsbart[0].id,
      motivation: `steg ${i}`,
    }))
    const res = validateMissionPlan(plan, p, NOW)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('too_many_steps')
  })

  test('0 steg avvisas', () => {
    const plan = giltigPlan()
    plan.steps = []
    const res = validateMissionPlan(plan, portfolio(), NOW)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('no_steps')
  })

  test('dubblerat item_id avvisas med egen reason', () => {
    const p = portfolio()
    const plan = giltigPlan(p)
    plan.steps = [
      { item_id: p.by_class.indrivningsbart[0].id, motivation: 'en gång' },
      { item_id: p.by_class.indrivningsbart[0].id, motivation: 'två gånger' },
    ]
    const res = validateMissionPlan(plan, p, NOW)
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.reason).toBe('duplicate_item')
  })

  test('mål 0, negativt eller NaN avvisas', () => {
    for (const goal of [0, -5, NaN, Infinity]) {
      const plan = giltigPlan()
      plan.goal_kr = goal
      const res = validateMissionPlan(plan, portfolio(), NOW)
      expect(res.ok).toBe(false)
      if (!res.ok) expect(res.reason).toBe('bad_goal')
    }
  })

  test('deadline i dåtid eller idag avvisas (strikt efter idag, datumjämförelse)', () => {
    for (const deadline of ['2026-08-10', '2026-08-17', '2020-01-01', 'inte-ett-datum', '']) {
      const plan = giltigPlan()
      plan.deadline = deadline
      const res = validateMissionPlan(plan, portfolio(), NOW)
      expect(res.ok, `deadline "${deadline}" skulle avvisas`).toBe(false)
      if (!res.ok) expect(res.reason).toBe('bad_deadline')
    }
  })

  test('imorgon accepteras (gränsen är strikt efter idag)', () => {
    const plan = giltigPlan()
    plan.deadline = '2026-08-18'
    expect(validateMissionPlan(plan, portfolio(), NOW).ok).toBe(true)
  })
})

test.describe('validateMissionPlan — berikning ur portföljen', () => {
  test('giltig plan → steg berikade med portföljens mått, klass och kortkoppling', () => {
    const p = portfolio()
    const res = validateMissionPlan(giltigPlan(p), p, NOW)
    expect(res.ok).toBe(true)
    if (!res.ok) return
    expect(res.steps).toHaveLength(2)

    const [indriv, pipe] = res.steps
    expect(indriv.truth_class).toBe('indrivningsbart')
    expect(indriv.measure).toEqual({ kind: 'kr', amountKr: 40000 })
    expect(indriv.evidence).toEqual({ table: 'invoice', ref_id: 'inv_1' })
    expect(indriv.approval_type).toBe('invoice_reminder')
    expect(indriv.motivation).toBe('Redan intjänade pengar först')

    expect(pipe.truth_class).toBe('pipeline')
    expect(pipe.measure).toEqual({ kind: 'kr', amountKr: 55000 })
    expect(pipe.evidence).toEqual({ table: 'quotes', ref_id: 'q_1' })
  })

  test('antalsmätt item (återaktivering) behåller sitt antalsmått genom valideringen', () => {
    const p = portfolio()
    const plan: MissionPlanInput = {
      goal_kr: 50000,
      deadline: '2026-09-30',
      steps: [{ item_id: p.by_class.ateraktivering[0].id, motivation: 'Väck badrumskunderna' }],
    }
    const res = validateMissionPlan(plan, p, NOW)
    expect(res.ok).toBe(true)
    if (res.ok) expect(res.steps[0].measure).toEqual({ kind: 'count', count: 7 })
  })

  test('insmugglat belopp på inputsteget IGNORERAS — måttet är portföljens', () => {
    const p = portfolio()
    const plan = giltigPlan(p)
    // En LLM som försöker skicka med ett eget (uppblåst) mått.
    ;(plan.steps[0] as any).amountKr = 999999
    ;(plan.steps[0] as any).measure = { kind: 'kr', amountKr: 999999 }
    const res = validateMissionPlan(plan, p, NOW)
    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.steps[0].measure).toEqual({ kind: 'kr', amountKr: 40000 })
      expect((res.steps[0] as any).amountKr).toBeUndefined()
    }
  })
})

test.describe('isMissionPlanPresentation — metadata-kontraktets vakt', () => {
  function giltigPresentation(): MissionPlanPresentation {
    const p = portfolio()
    const res = validateMissionPlan(giltigPlan(p), p, NOW)
    if (!res.ok) throw new Error('förutsättning brast: planen skulle vara giltig')
    return {
      kind: 'mission_plan',
      version: 1,
      state: 'proposal',
      mission_id: null,
      goal_kr: 150000,
      deadline: '2026-09-30',
      headline: 'Frigöra 150 000 kr före 30 september',
      steps: res.steps,
      degraded_sources: [],
    }
  }

  test('giltigt objekt accepteras (proposal och confirmed)', () => {
    expect(isMissionPlanPresentation(giltigPresentation())).toBe(true)
    const confirmed = { ...giltigPresentation(), state: 'confirmed', mission_id: 'mis_abc123def456' }
    expect(isMissionPlanPresentation(confirmed)).toBe(true)
  })

  test('fel kind avvisas', () => {
    expect(isMissionPlanPresentation({ ...giltigPresentation(), kind: 'business_scenario' })).toBe(false)
  })

  test('fel version avvisas', () => {
    expect(isMissionPlanPresentation({ ...giltigPresentation(), version: 2 })).toBe(false)
  })

  test('saknade eller icke-array steps avvisas', () => {
    const utanSteps: any = giltigPresentation()
    delete utanSteps.steps
    expect(isMissionPlanPresentation(utanSteps)).toBe(false)
    expect(isMissionPlanPresentation({ ...giltigPresentation(), steps: 'inte-en-array' })).toBe(false)
  })

  test('okänt state avvisas, liksom null/primitiver', () => {
    expect(isMissionPlanPresentation({ ...giltigPresentation(), state: 'draft' })).toBe(false)
    expect(isMissionPlanPresentation(null)).toBe(false)
    expect(isMissionPlanPresentation('mission_plan')).toBe(false)
    expect(isMissionPlanPresentation(42)).toBe(false)
  })
})
