/**
 * FACIT — Etapp L, Ask-täckningsmätningen (Mission Control, instrument,
 * inte produktfunktion). tasks/jaunty-pondering-hummingbird.md.
 *
 * lib/matte/ask-coverage.ts härleder en mekanisk klassificering av vad som
 * FAKTISKT hände i en Matte-chattur — inget språkmodellsomdöme, ingen fri
 * slutanvändartext. Det här facit täcker:
 *
 *   1. Varje funnelflagga, en i taget (tom tur, blandade utfall,
 *      godkännande-vägen, misslyckad-vägen).
 *   2. presentation_kind — business_scenario / mission_plan / null.
 *   3. En källskanning som förbjuder identifierarna `content`, `userMessage`
 *      och `text:` i själva den rena filen — den signalen som skulle avslöja
 *      att fri text smugit sig in i ett rent klassificeringslager.
 *
 * Körs: npx playwright test tests/ask-coverage.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggAskCoverage, type AskCoverage } from '../lib/matte/ask-coverage'
import type { AgentResult } from '../lib/agent/orchestration'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function step(agent: AgentResult['agent'], actions: AgentResult['actions'], status: AgentResult['status'] = 'completed'): AgentResult {
  return { agent, status, summary: '', actions }
}

test.describe('byggAskCoverage — tom tur', () => {
  test('inga steg, inga handoffs → ingen_atgard true, hade_verktyg false, allt annat noll/null', () => {
    const c: AskCoverage = byggAskCoverage({ steps: [], handoffCount: 0, presentation: null })
    expect(c).toEqual({
      version: 1,
      tool_calls: 0,
      outcomes: { completed: 0, awaiting_approval: 0, failed: 0 },
      handoff_count: 0,
      presentation_kind: null,
      hade_verktyg: false,
      kravde_beslut: false,
      utfordes: false,
      ingen_atgard: true,
    })
  })

  test('handoff utan verktyg (specialist svarade rent resonerande) → INTE ingen_atgard, men hade_verktyg fortfarande false', () => {
    const c = byggAskCoverage({
      steps: [step('lars', [])],
      handoffCount: 1,
      presentation: null,
    })
    expect(c.hade_verktyg).toBe(false)
    expect(c.ingen_atgard).toBe(false)
    expect(c.handoff_count).toBe(1)
  })
})

test.describe('byggAskCoverage — verktygsanrop, en klassificering per utfall', () => {
  test('ett lyckat verktygsanrop → hade_verktyg + utfordes, inte kravde_beslut', () => {
    const c = byggAskCoverage({
      steps: [step('lars', [{ tool: 'create_invoice', status: 'completed' }])],
      handoffCount: 1,
      presentation: null,
    })
    expect(c.hade_verktyg).toBe(true)
    expect(c.utfordes).toBe(true)
    expect(c.kravde_beslut).toBe(false)
    expect(c.tool_calls).toBe(1)
    expect(c.outcomes).toEqual({ completed: 1, awaiting_approval: 0, failed: 0 })
  })

  test('ett verktygsanrop som köades för godkännande → kravde_beslut, inte utfordes', () => {
    const c = byggAskCoverage({
      steps: [step('hanna', [{ tool: 'send_sms', status: 'awaiting_approval' }], 'awaiting_approval')],
      handoffCount: 1,
      presentation: null,
    })
    expect(c.hade_verktyg).toBe(true)
    expect(c.kravde_beslut).toBe(true)
    expect(c.utfordes).toBe(false)
    expect(c.outcomes).toEqual({ completed: 0, awaiting_approval: 1, failed: 0 })
  })

  test('ett misslyckat verktygsanrop → hade_verktyg true, men varken kravde_beslut eller utfordes', () => {
    const c = byggAskCoverage({
      steps: [step('daniel', [{ tool: 'analyze_photo', status: 'failed', error: 'timeout' }], 'failed')],
      handoffCount: 1,
      presentation: null,
    })
    expect(c.hade_verktyg).toBe(true)
    expect(c.kravde_beslut).toBe(false)
    expect(c.utfordes).toBe(false)
    expect(c.outcomes).toEqual({ completed: 0, awaiting_approval: 0, failed: 1 })
  })

  test('blandade utfall över flera steg summeras korrekt, och alla tre flaggor kan vara sanna samtidigt', () => {
    const c = byggAskCoverage({
      steps: [
        step('lars', [
          { tool: 'create_quote', status: 'completed' },
          { tool: 'send_email', status: 'awaiting_approval' },
        ]),
        step('karin', [{ tool: 'update_invoice', status: 'failed', error: 'boom' }], 'partial'),
      ],
      handoffCount: 2,
      presentation: null,
    })
    expect(c.tool_calls).toBe(3)
    expect(c.outcomes).toEqual({ completed: 1, awaiting_approval: 1, failed: 1 })
    expect(c.hade_verktyg).toBe(true)
    expect(c.kravde_beslut).toBe(true)
    expect(c.utfordes).toBe(true)
    expect(c.ingen_atgard).toBe(false)
    expect(c.handoff_count).toBe(2)
  })
})

test.describe('byggAskCoverage — presentation_kind', () => {
  test('business_scenario presentation klassificeras som business_scenario', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: 0, presentation: { kind: 'business_scenario' } })
    expect(c.presentation_kind).toBe('business_scenario')
  })

  test('mission_plan presentation klassificeras som mission_plan', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: 0, presentation: { kind: 'mission_plan' } })
    expect(c.presentation_kind).toBe('mission_plan')
  })

  test('null presentation → null', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: 0, presentation: null })
    expect(c.presentation_kind).toBeNull()
  })

  test('okänt kind-värde (framtida presentation-typ) faller tillbaka till null i stället för att krascha eller smuggla igenom en okänd sträng', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: 0, presentation: { kind: 'något_okänt' } })
    expect(c.presentation_kind).toBeNull()
  })
})

test.describe('byggAskCoverage — version + robusthet', () => {
  test('version är alltid 1', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: 0, presentation: null })
    expect(c.version).toBe(1)
  })

  test('negativ handoffCount (skulle aldrig hända, men) klampas till 0 i stället för att bli en negativ statistik', () => {
    const c = byggAskCoverage({ steps: [], handoffCount: -1, presentation: null })
    expect(c.handoff_count).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Källskanning — instrumentet får ALDRIG bära fri slutanvändartext
// ─────────────────────────────────────────────────────────────────────────

test.describe('källskanning — lib/matte/ask-coverage.ts lagrar aldrig meddelandeinnehåll', () => {
  const src = read('lib/matte/ask-coverage.ts')

  test('filen refererar aldrig identifieraren "content"', () => {
    expect(src).not.toContain('content')
  })

  test('filen refererar aldrig identifieraren "userMessage"', () => {
    expect(src).not.toContain('userMessage')
  })

  test('filen bygger aldrig ett text-fält (mönstret "text:")', () => {
    expect(src).not.toContain('text:')
  })
})

// ─────────────────────────────────────────────────────────────────────────
// Källskanning — chattroute:n kopplar in coverage i samma meteringskanal
// ─────────────────────────────────────────────────────────────────────────

test.describe('källskanning — app/api/matte/chat/route.ts bokför coverage via meterDirectLlmCall-meta', () => {
  const chatSrc = read('app/api/matte/chat/route.ts')

  test('importerar byggAskCoverage', () => {
    expect(chatSrc).toContain('byggAskCoverage')
    expect(chatSrc).toContain("from '@/lib/matte/ask-coverage'")
  })

  test('bokforMatteUsage bygger coverage och lägger den i meta INNAN meterDirectLlmCall anropas', () => {
    const start = chatSrc.indexOf('const bokforMatteUsage')
    expect(start).toBeGreaterThan(-1)
    const end = chatSrc.indexOf('\n    }', start)
    const body = chatSrc.slice(start, end > start ? end : undefined)
    const coverageIdx = body.indexOf('byggAskCoverage(')
    const meterIdx = body.indexOf('meterDirectLlmCall(')
    expect(coverageIdx).toBeGreaterThan(-1)
    expect(meterIdx).toBeGreaterThan(-1)
    expect(coverageIdx).toBeLessThan(meterIdx)
    expect(body).toContain('coverage')
  })

  test('meta-objektet till meterDirectLlmCall bär coverage bredvid thread_id/specialist_steps', () => {
    const start = chatSrc.indexOf('meta: { thread_id:')
    expect(start, 'meta-objektet hittades inte oförändrat — kolla att specialist_steps fortfarande skickas').toBeGreaterThan(-1)
    const lineEnd = chatSrc.indexOf('\n', start)
    const line = chatSrc.slice(start, lineEnd)
    expect(line).toContain('specialist_steps')
    expect(line).toContain('coverage')
  })
})
