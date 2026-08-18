/**
 * FACIT — Etapp B (verktyg + chattintegration), Goal-to-Plan V1
 * (tasks/jaunty-pondering-hummingbird.md).
 *
 * Två delar:
 *  1. Direkta facit för de rena hjälparna i lib/mission/mission-summary.ts
 *     (buildMissionSummaryText, buildMissionHeadline).
 *  2. Källskanning av de tre levande produktionsfilerna verktygen faktiskt
 *     bor i (tool-definitions.ts, tool-router.ts, matte/chat/route.ts) —
 *     samma idiom som tests/ett-projekt-per-offert.spec.ts och
 *     tests/mission-truth-guard.spec.ts. Det finns ingen egen testbar modul
 *     för själva verktygsregistreringen, så skanningen LÅSER de kritiska
 *     invarianterna: item_id kommer bara från portföljen, belopp kan aldrig
 *     smugglas in, confirm_mission omvaliderar färskt, och klassöverskridande
 *     summor förekommer ingenstans.
 *
 * Körs: npx playwright test tests/mission-tools.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildMissionSummaryText, buildMissionHeadline } from '../lib/mission/mission-summary'
import { assembleOpportunityPortfolio } from '../lib/mission/opportunity-portfolio'
import { validateMissionPlan, type MissionPlanInput } from '../lib/mission/plan-validation'
import type { MissionPlanPresentation } from '../lib/mission/mission-presentation'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const NOW = new Date('2026-08-17T12:00:00Z')

// ─────────────────────────────────────────────────────────────────────────
// 1. buildMissionSummaryText / buildMissionHeadline — rena facit
// ─────────────────────────────────────────────────────────────────────────

function presentationWithTwoKrClassesAndACountClass(): MissionPlanPresentation {
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
    quietGroups: [{ job_type: 'badrum', count: 7 }],
    marginWarnings: [],
  }, NOW)

  const plan: MissionPlanInput = {
    goal_kr: 72000,
    deadline: '2026-09-30',
    steps: [
      { item_id: portfolio.by_class.indrivningsbart[0].id, motivation: 'Förfallet, drivs in' },
      { item_id: portfolio.by_class.faktureringsklart[0].id, motivation: 'Klart att fakturera' },
      { item_id: portfolio.by_class.ateraktivering[0].id, motivation: 'Väck badrumskunderna' },
    ],
  }
  const res = validateMissionPlan(plan, portfolio, NOW)
  if (!res.ok) throw new Error(`förutsättning brast: planen skulle vara giltig — ${res.detail}`)
  return {
    kind: 'mission_plan',
    version: 1,
    state: 'proposal',
    mission_id: null,
    goal_kr: plan.goal_kr!,
    deadline: plan.deadline,
    headline: buildMissionHeadline(plan.goal_kr!, plan.deadline),
    steps: res.steps,
    degraded_sources: [],
  }
}

test.describe('buildMissionSummaryText — klasserna redovisas var för sig', () => {
  test('två kr-klasser (40 000 + 32 000) visar båda beloppen, aldrig en hopslagen summa', () => {
    // toLocaleString('sv-SE') infogar en icke-brytande blanksteg som ser ut
    // som " " men inte är det (samma lärdom som tests/mandagsmote-takeover.spec.ts)
    // — jämför mot samma formattering, inte mot en literal sträng.
    const text = buildMissionSummaryText(presentationWithTwoKrClassesAndACountClass())
    expect(text).toContain(`${(40000).toLocaleString('sv-SE')} kr`)
    expect(text).toContain(`${(32000).toLocaleString('sv-SE')} kr`)
    expect(text).not.toContain(`${(72000).toLocaleString('sv-SE')}`)
  })

  test('antalsklass (återaktivering) visas som "X st", aldrig som kr', () => {
    const text = buildMissionSummaryText(presentationWithTwoKrClassesAndACountClass())
    expect(text).toContain('7 st')
  })

  test('klasserna hamnar på separata rader/segment, inte ihopblandade', () => {
    const text = buildMissionSummaryText(presentationWithTwoKrClassesAndACountClass())
    expect(text).toContain('Indrivningsbart:')
    expect(text).toContain('Faktureringsklart:')
    expect(text).toContain('Återaktivering:')
  })

  test('tom plan ger tom text (inget kraschar)', () => {
    const empty: MissionPlanPresentation = {
      kind: 'mission_plan', version: 1, state: 'proposal', mission_id: null,
      goal_kr: 1, deadline: '2026-09-30', headline: 'x', steps: [], degraded_sources: [],
    }
    expect(buildMissionSummaryText(empty)).toBe('')
  })
})

test.describe('buildMissionHeadline', () => {
  test('formaterar belopp i sv-SE och returnerar deadline ordagrant', () => {
    expect(buildMissionHeadline(150000, '2026-09-30'))
      .toBe(`Frigöra ${(150000).toLocaleString('sv-SE')} kr före 2026-09-30`)
  })

  test('Etapp F: goalType capacity bygger "Boka N timmar till vecka V", ignorerar goalKr helt', () => {
    // 2026-09-30 ligger i ISO-vecka 40.
    const headline = buildMissionHeadline(999999, '2026-09-30', { goalType: 'capacity', goalHours: 12 })
    expect(headline).toBe('Boka 12 timmar till vecka 40')
    expect(headline).not.toContain('999999')
    expect(headline).not.toContain('kr')
  })

  test('Etapp F: utan opts (eller goalType money) är beteendet bakåtkompatibelt oförändrat', () => {
    expect(buildMissionHeadline(72000, '2026-09-30', { goalType: 'money' }))
      .toBe(`Frigöra ${(72000).toLocaleString('sv-SE')} kr före 2026-09-30`)
  })

  test('Etapp I: goalType contact bygger "Kontakta N kunder före DATUM", ignorerar goalKr/goalHours helt', () => {
    const headline = buildMissionHeadline(999999, '2026-09-30', { goalType: 'contact', goalCount: 10 })
    expect(headline).toBe('Kontakta 10 kunder före 2026-09-30')
    expect(headline).not.toContain('999999')
    expect(headline).not.toContain('kr')
  })
})

test.describe('källskanning — lib/mission/mission-summary.ts summerar aldrig klassbelopp', () => {
  test('filen innehåller ingen reduce( över steg/belopp', () => {
    const src = read('lib/mission/mission-summary.ts')
    expect(src).not.toContain('reduce(')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 2. Källskanning — tool-definitions.ts
// ─────────────────────────────────────────────────────────────────────────

function sliceBetween(src: string, startMarker: string, endMarker: string, label: string): string {
  const start = src.indexOf(startMarker)
  expect(start, `${label}: startmarkören "${startMarker}" hittades inte`).toBeGreaterThan(-1)
  const end = src.indexOf(endMarker, start + startMarker.length)
  expect(end, `${label}: slutmarkören "${endMarker}" hittades inte efter start`).toBeGreaterThan(start)
  return src.slice(start, end)
}

/**
 * Steg-schemats EGNA properties-block (item_id/motivation) — INTE hela
 * tool-blocket. Beskrivningsprosan FÅR (ska!) säga "hitta aldrig på
 * belopp" som instruktion till modellen; det är schemats fält som aldrig
 * får bära ett amount/belopp-fält. Isolerar därför just
 * "items: { ... required: [...] }"-biten.
 */
function stepsPropertiesBlock(toolBlock: string, label: string): string {
  const start = toolBlock.indexOf('items: {')
  expect(start, `${label}: hittar inte steps.items-schemat`).toBeGreaterThan(-1)
  const end = toolBlock.indexOf('required: ["item_id", "motivation"]', start)
  expect(end, `${label}: hittar inte required-listan efter items-schemat`).toBeGreaterThan(start)
  return toolBlock.slice(start, end)
}

test.describe('tool-definitions.ts — propose_mission_plan / confirm_mission', () => {
  const defsSrc = read('app/api/agent/trigger/tool-definitions.ts')

  test('båda verktygen är registrerade', () => {
    expect(defsSrc).toContain('name: "propose_mission_plan"')
    expect(defsSrc).toContain('name: "confirm_mission"')
  })

  test('propose_mission_plan: steg-schemats properties är ENDAST item_id + motivation, inget belopp-fält', () => {
    const block = sliceBetween(defsSrc, 'name: "propose_mission_plan"', 'name: "confirm_mission"', 'propose_mission_plan')
    expect(block).toContain('item_id')
    expect(block).toContain('required: ["item_id", "motivation"]')
    const propsBlock = stepsPropertiesBlock(block, 'propose_mission_plan')
    expect(/amount|belopp/i.test(propsBlock), 'steg-schemats properties får inte bära ett belopp/amount-fält').toBe(false)
  })

  test('confirm_mission: samma disciplin — steg-schemats properties är ENDAST item_id + motivation', () => {
    const start = defsSrc.indexOf('name: "confirm_mission"')
    expect(start).toBeGreaterThan(-1)
    // Blocket sträcker sig till nästa toolnamn i arrayen (send_agent_message,
    // se app/api/agent/trigger/tool-definitions.ts) eller filens slut.
    const nextTool = defsSrc.indexOf('name: "send_agent_message"', start)
    const end = nextTool > -1 ? nextTool : defsSrc.length
    const block = defsSrc.slice(start, end)
    expect(block).toContain('item_id')
    expect(block).toContain('required: ["item_id", "motivation"]')
    const propsBlock = stepsPropertiesBlock(block, 'confirm_mission')
    expect(/amount|belopp/i.test(propsBlock), 'steg-schemats properties får inte bära ett belopp/amount-fält').toBe(false)
  })

  test('beskrivningarna instruerar: item_id från portföljen, hitta aldrig på belopp, max 5 steg', () => {
    const block = sliceBetween(defsSrc, 'name: "propose_mission_plan"', 'name: "confirm_mission"', 'propose_mission_plan')
    const lower = block.toLowerCase()
    expect(lower).toContain('portfölj')
    expect(lower).toMatch(/aldrig.*(belopp|hitta)|hitta.*aldrig/)
    expect(block).toMatch(/5/)
  })

  test('Etapp F: båda verktygen har valfria goal_type/goal_hours-fält, och goal_kr är INTE längre obligatoriskt', () => {
    for (const [start, end] of [
      ['name: "propose_mission_plan"', 'name: "confirm_mission"'],
      ['name: "confirm_mission"', 'name: "send_agent_message"'],
    ] as const) {
      const block = sliceBetween(defsSrc, start, end, start)
      expect(block).toContain('goal_type')
      expect(block).toContain('goal_hours')
      expect(block.toLowerCase()).toContain('capacity')
      // goal_kr krävs bara villkorat (pengamål) — required-listan på
      // toppnivå ska INTE tvinga fram goal_kr längre.
      expect(block).toContain('required: ["deadline", "steps"]')
    }
  })

  test('Etapp I: båda verktygen har ett valfritt goal_count-fält och "contact" i goal_type-enumet', () => {
    for (const [start, end] of [
      ['name: "propose_mission_plan"', 'name: "confirm_mission"'],
      ['name: "confirm_mission"', 'name: "send_agent_message"'],
    ] as const) {
      const block = sliceBetween(defsSrc, start, end, start)
      expect(block).toContain('goal_count')
      expect(block).toContain('"contact"')
      expect(block).toContain('required: ["deadline", "steps"]')
    }
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 3. Källskanning — tool-router.ts
// ─────────────────────────────────────────────────────────────────────────

function functionBody(src: string, fnName: string): string {
  const marker = `async function ${fnName}`
  const start = src.indexOf(marker)
  expect(start, `${fnName} hittades inte i tool-router.ts`).toBeGreaterThan(-1)
  const nextFn = src.indexOf('\nasync function ', start + marker.length)
  const end = nextFn > -1 ? nextFn : src.length
  return src.slice(start, end)
}

test.describe('tool-router.ts — propose_mission_plan / confirm_mission', () => {
  const routerSrc = read('app/api/agent/trigger/tool-router.ts')

  test('switchen har cases för båda verktygen', () => {
    expect(routerSrc).toContain("case 'propose_mission_plan':")
    expect(routerSrc).toContain("case 'confirm_mission':")
  })

  test('propose_mission_plan-implementationen läser portföljen och validerar planen', () => {
    const body = functionBody(routerSrc, 'proposeMissionPlanTool')
    expect(body).toContain('loadOpportunityPortfolioForBusiness')
    expect(body).toContain('validateMissionPlan')
  })

  test('confirm_mission räknar om portföljen FÄRSKT och omvaliderar (dödar inaktuella belopp)', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain('loadOpportunityPortfolioForBusiness')
    expect(body).toContain('validateMissionPlan')
  })

  test('confirm_mission hanterar unik-index-krocken (max ett aktivt uppdrag) vänligt', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    const harKod = body.includes("'23505'") || body.includes('idx_mission_one_active')
    expect(harKod, 'ska känna igen 23505 eller idx_mission_one_active').toBe(true)
  })

  test('confirm_mission hanterar saknad mission-tabell (42P01) utan att krascha', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain("'42P01'")
  })

  // ── Etapp D — härdning (tasks/jaunty-pondering-hummingbird.md) ─────────

  test('confirm_mission läser befintlig aktiv rad och jämför deadline datum-bara (slice(0,10)) innan INSERT', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    const insertIdx = body.indexOf(".from('mission').insert(")
    expect(insertIdx, 'INSERT-anropet hittades inte').toBeGreaterThan(-1)
    const before = body.slice(0, insertIdx)
    expect(before).toContain(".eq('status', 'active')")
    expect(before).toContain('.slice(0, 10)')
    expect(before).toContain("status: 'expired'")
    expect(before).toContain('resolved_at')
  })

  test('confirm_mission ger Matte en koordineringsstart (next_instruction) med mission_id + truth_class-stämpling', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain('next_instruction')
    expect(body).toContain('truth_class')
  })

  // ── Etapp F — kapacitetsmål (tasks/jaunty-pondering-hummingbird.md) ────

  test('confirm_mission grenar INSERT:en på goalType: kapacitetsvägen skriver goal_type/goal_hours/goal_kr:null, pengavägen lämnar dem orörda', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain("insertPayload.goal_type = 'capacity'")
    expect(body).toContain('insertPayload.goal_hours = plan.goal_hours')
    expect(body).toContain('insertPayload.goal_kr = null')
    expect(body).toContain('insertPayload.goal_kr = plan.goal_kr')
  })

  test('confirm_mission hanterar saknade kapacitetskolumner (v145 ej körd) vänligt, utan att fälla pengavägen', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain("'42703'")
    expect(body.toLowerCase()).toContain('v145')
  })

  // ── Etapp I — kontaktmål (tasks/jaunty-pondering-hummingbird.md) ───────

  test('confirm_mission grenar INSERT:en på goalType "contact": goal_type/goal_count/goal_kr:null', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body).toContain("insertPayload.goal_type = 'contact'")
    expect(body).toContain('insertPayload.goal_count = plan.goal_count')
  })

  test('confirm_mission hanterar saknade kontaktkolumner (v146 ej körd) vänligt, utan att fälla pengavägen', () => {
    const body = functionBody(routerSrc, 'confirmMissionTool')
    expect(body.toLowerCase()).toContain('v146')
  })

  test('propose_mission_plan och confirm_mission bygger presentationen via resolveGoalType (samma fail-soft-default som läsvägarna)', () => {
    const propose = functionBody(routerSrc, 'proposeMissionPlanTool')
    const confirm = functionBody(routerSrc, 'confirmMissionTool')
    expect(propose).toContain('resolveGoalType(')
    expect(confirm).toContain('resolveGoalType(')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 4. Källskanning — verktygen är Matte-scopade (inga andra agenter)
// ─────────────────────────────────────────────────────────────────────────

test.describe('propose_mission_plan / confirm_mission är Matte-scopade', () => {
  test('personalities.ts ger INGEN specialist (karin/hanna/daniel/lars/lisa) dessa verktyg', () => {
    const src = read('lib/agents/personalities.ts')
    expect(src).not.toContain('propose_mission_plan')
    expect(src).not.toContain('confirm_mission')
  })

  test('matte/chat/route.ts kurerar in båda verktygen — annars ser Matte dem aldrig i chatten', () => {
    const src = read('app/api/matte/chat/route.ts')
    expect(src).toContain("'propose_mission_plan'")
    expect(src).toContain("'confirm_mission'")
  })
})

// ─────────────────────────────────────────────────────────────────────────
// 5. Källskanning — matte/chat/route.ts: portföljkontext + aktivt uppdrag
// ─────────────────────────────────────────────────────────────────────────

test.describe('matte/chat/route.ts — möjlighetsportfölj-kontextblock', () => {
  const chatSrc = read('app/api/matte/chat/route.ts')

  test('läser den delade portföljen och känner igen mission-presentationen', () => {
    expect(chatSrc).toContain('loadOpportunityPortfolioForBusiness')
    expect(chatSrc).toContain('isMissionPlanPresentation')
  })

  test('kontextblocket bär ärlighetsklausulen ordagrant', () => {
    expect(chatSrc).toContain('Referera ENDAST')
    expect(chatSrc).toContain('hitta aldrig på egna')
  })

  test('kontextblocket gates:as på riktig data (minst ett item ELLER aktivt uppdrag)', () => {
    expect(chatSrc).toContain('portfolioHasItems')
  })

  test('aktivt-uppdrag-blocket instruerar mission_id + truth_class-stämpling och enuppdrags-regeln', () => {
    expect(chatSrc).toContain('payload.mission_id')
    expect(chatSrc).toContain('truth_class')
    expect(chatSrc).toContain('Bara ETT uppdrag kan vara aktivt')
  })

  test('mission-läsningen är fail-soft på 42P01 (tabellen kan sakna innan v144 körs)', () => {
    expect(chatSrc).toContain("42P01")
  })

  test('runAgentTurn fångar mission-presentationen i samma verktygsloop som business-scenario', () => {
    const idx = chatSrc.indexOf("block.name === 'simulate_business_scenario'")
    expect(idx).toBeGreaterThan(-1)
    const idx2 = chatSrc.indexOf('propose_mission_plan', idx)
    expect(idx2, 'mission-presentation-fångsten ska ligga efter business-scenario-fångsten i samma loop').toBeGreaterThan(idx)
  })

  test('känd kostnadspunkt är kommenterad (portföljen kör flera queries per Matte-tur)', () => {
    expect(chatSrc.toLowerCase()).toContain('känd kostnadspunkt')
  })

  test('Etapp F: kontextblocket instruerar Matte om kapacitetsmål (goal_type capacity + goal_hours)', () => {
    expect(chatSrc).toContain('goal_type "capacity"')
    expect(chatSrc).toContain('goal_hours')
    expect(chatSrc.toLowerCase()).toContain('nästa veckas luckor')
  })

  test('Etapp F: mission-selecten är select(\'*\') — inte en explicit kolumnlista som fallerar pre-v145', () => {
    expect(chatSrc).toContain(".from('mission')\n            .select('*')")
  })

  test('Etapp I: kontextblocket instruerar Matte om kontaktmål (goal_type contact + goal_count)', () => {
    expect(chatSrc).toContain('goal_type "contact"')
    expect(chatSrc).toContain('goal_count')
  })
})

test.describe('Mission Control är ägar-/admin-låst i chatten (Andreas fynd 2026-08-18)', () => {
  const fs = require('fs')
  const path = require('path')
  const routeSrc = fs.readFileSync(path.join(__dirname, '..', 'app', 'api', 'matte', 'chat', 'route.ts'), 'utf8') as string

  test('rollgrinden finns — isOwnerOrAdmin importeras och missionBehorig beräknas', () => {
    expect(routeSrc).toContain('isOwnerOrAdmin')
    expect(routeSrc).toContain('missionBehorig')
  })

  test('portföljblocket (bär fakturabelopp) byggs bara för behöriga', () => {
    expect(routeSrc).toContain("currentAgent === 'matte' && missionBehorig")
  })

  test('dubbelgrind: verktygslistan filtreras OCH exekveringen vägrar', () => {
    expect(routeSrc).toContain('MISSION_TOOL_NAMES')
    expect(routeSrc).toContain('missionToolsAllowed || !MISSION_TOOL_NAMES.has')
    expect(routeSrc).toContain('Endast ägare och administratör kan skapa eller bekräfta uppdrag.')
  })
})
