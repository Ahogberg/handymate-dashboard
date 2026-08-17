/**
 * FACIT — components/agents/MissionPlanCard.tsx + lib/mission/plan-contract-view.ts
 * (Goal-to-Plan V1, Etapp C, tasks/jaunty-pondering-hummingbird.md).
 *
 * Tre delar:
 *  1. groupStepsByClass — ren gruppering, egna facit.
 *  2. Renderingsfacit: två kr-klasser (40 000 + 32 000) ska visa BÅDA
 *     beloppen, aldrig en hopslagen "72 000".
 *  3. Källskanning: filerna får aldrig innehålla en klassöverskridande
 *     summeringsoperation.
 *
 * Körs: npx playwright test tests/mission-plan-card.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { groupStepsByClass } from '../lib/mission/plan-contract-view'
import { MissionPlanCard } from '../components/agents/MissionPlanCard'
import { assembleOpportunityPortfolio } from '../lib/mission/opportunity-portfolio'
import { validateMissionPlan, type MissionPlanInput } from '../lib/mission/plan-validation'
import { buildMissionHeadline } from '../lib/mission/mission-summary'
import type { MissionPlanPresentation } from '../lib/mission/mission-presentation'
import type { ValidatedMissionStep } from '../lib/mission/plan-validation'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const NOW = new Date('2026-08-17T12:00:00Z')

// ─────────────────────────────────────────────────────────────────────────
// 1. groupStepsByClass — ren gruppering
// ─────────────────────────────────────────────────────────────────────────

function step(overrides: Partial<ValidatedMissionStep> = {}): ValidatedMissionStep {
  return {
    item_id: 'pf_x',
    truth_class: 'indrivningsbart',
    title: 'Test',
    measure: { kind: 'kr', amountKr: 100 },
    evidence: { table: 'invoice', ref_id: 'inv_1' },
    agent_key: 'karin',
    approval_type: 'invoice_reminder',
    motivation: '',
    ...overrides,
  }
}

test.describe('groupStepsByClass', () => {
  test('tom lista → tom lista', () => {
    expect(groupStepsByClass([])).toEqual([])
  })

  test('grupperar per klass i TRUTH_CLASSES-ordning, oavsett indata-ordning', () => {
    const steps = [
      step({ item_id: 'a', truth_class: 'marginalskydd' }),
      step({ item_id: 'b', truth_class: 'indrivningsbart' }),
      step({ item_id: 'c', truth_class: 'pipeline' }),
    ]
    const sections = groupStepsByClass(steps)
    expect(sections.map(s => s.truth_class)).toEqual(['indrivningsbart', 'pipeline', 'marginalskydd'])
  })

  test('flera steg i samma klass hamnar i samma sektion, i ursprungsordning', () => {
    const steps = [
      step({ item_id: 'a', truth_class: 'faktureringsklart', title: 'Först' }),
      step({ item_id: 'b', truth_class: 'faktureringsklart', title: 'Sedan' }),
    ]
    const sections = groupStepsByClass(steps)
    expect(sections).toHaveLength(1)
    expect(sections[0].steps.map(s => s.title)).toEqual(['Först', 'Sedan'])
  })

  test('en klass utan steg får ingen (tom) sektion', () => {
    const sections = groupStepsByClass([step({ truth_class: 'ateraktivering' })])
    expect(sections).toHaveLength(1)
    expect(sections[0].truth_class).toBe('ateraktivering')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Renderingsfacit — två kr-klasser, aldrig en hopslagen summa
// ─────────────────────────────────────────────────────────────────────────

function presentationWithTwoKrClasses(state: 'proposal' | 'confirmed' = 'proposal'): MissionPlanPresentation {
  const portfolio = assembleOpportunityPortfolio({
    overdueInvoices: [
      { invoice_id: 'inv_1', invoice_number: '2024-118', total: 40000, customer_name: 'Andersson' },
    ],
    missedRevenue: [
      {
        kind: 'material_ej_fakturerat',
        projectId: 'proj_1',
        projectName: 'Kök',
        amountKr: 32000,
        sourceAmountKr: 32000,
        confidence: 'LIKELY_UNBILLED',
        action: 'REVIEW_ONLY',
        sourceIds: ['mat_1'],
        evidence: 'test',
        dedupeKey: 'material:proj_1',
      },
    ],
    staleQuotes: [],
    quietGroups: [],
    marginWarnings: [],
  }, NOW)

  // goal_kr är MEDVETET != 40 000 + 32 000: headlinen citerar ägarens eget
  // mål (en legitim siffra), och testet ska bara döda en HOPLAGD klassumma
  // — inte krocka med den legitima målsiffran råkar bli samma tal.
  const plan: MissionPlanInput = {
    goal_kr: 100000,
    deadline: '2026-09-30',
    steps: [
      { item_id: portfolio.by_class.indrivningsbart[0].id, motivation: 'Förfallet, drivs in' },
      { item_id: portfolio.by_class.faktureringsklart[0].id, motivation: 'Klart att fakturera' },
    ],
  }
  const res = validateMissionPlan(plan, portfolio, NOW)
  if (!res.ok) throw new Error(`förutsättning brast: ${res.detail}`)

  return {
    kind: 'mission_plan',
    version: 1,
    state,
    mission_id: state === 'confirmed' ? 'mis_abc123def456' : null,
    goal_kr: plan.goal_kr,
    deadline: plan.deadline,
    headline: buildMissionHeadline(plan.goal_kr, plan.deadline),
    steps: res.steps,
    degraded_sources: [],
  }
}

test.describe('MissionPlanCard — rendering', () => {
  test('två kr-klasser (40 000 + 32 000) visar båda beloppen, aldrig "72 000"', () => {
    const markup = renderToStaticMarkup(createElement(MissionPlanCard, { presentation: presentationWithTwoKrClasses() }))
    expect(markup).toContain(`${(40000).toLocaleString('sv-SE')} kr`)
    expect(markup).toContain(`${(32000).toLocaleString('sv-SE')} kr`)
    expect(markup).not.toContain(`${(72000).toLocaleString('sv-SE')}`)
  })

  test('proposal-läget visar "Starta uppdraget" och "Justera"', () => {
    const markup = renderToStaticMarkup(createElement(MissionPlanCard, { presentation: presentationWithTwoKrClasses('proposal') }))
    expect(markup).toContain('Starta uppdraget')
    expect(markup).toContain('Justera')
  })

  test('confirmed-läget visar bekräftelsechippet och inga knappar', () => {
    const markup = renderToStaticMarkup(createElement(MissionPlanCard, { presentation: presentationWithTwoKrClasses('confirmed') }))
    expect(markup).toContain('Uppdraget startat')
    expect(markup).not.toContain('Starta uppdraget')
    expect(markup).not.toContain('Justera')
  })

  test('degraded_sources renderas som en ärlig notis när den finns', () => {
    const p = { ...presentationWithTwoKrClasses(), degraded_sources: ['stale_quotes'] }
    const markup = renderToStaticMarkup(createElement(MissionPlanCard, { presentation: p }))
    expect(markup).toContain('stale_quotes')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Källskanning — inga klassöverskridande summeringsoperationer
// ─────────────────────────────────────────────────────────────────────────

const BANNED = ['totalt', 'sammanlagt', 'summa', 'reduce(']

test.describe('källskanning — ingen klassöverskridande summa', () => {
  for (const file of ['components/agents/MissionPlanCard.tsx', 'lib/mission/plan-contract-view.ts']) {
    test(`${file} är fri från bannade ord`, () => {
      const src = read(file)
      for (const banned of BANNED) {
        expect(src.toLowerCase().includes(banned), `${file} innehåller "${banned}"`).toBe(false)
      }
    })
  }
})
