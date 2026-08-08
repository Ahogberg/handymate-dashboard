/**
 * Facit för sekventiell multi-agent V1 (Codex orkestreringsaudit, Epic 2).
 *
 * Auditens Storgatan-exempel är måttstocken: "Vi är klara på Storgatan, det
 * blev fyra timmar extra och kunden vill ha fakturan idag" rör tre domäner.
 * Förut klarade chatten en överlämning per tur och Matte kom aldrig tillbaka.
 *
 * Fyra saker måste hålla, och de testas här mot de rena funktionerna — inte
 * mot källtext, eftersom de faktiskt går att köra:
 *
 *   1. planen släpper igenom 1–3 specialister och stoppar loopen
 *   2. status härleds ur verktygsutfall, aldrig ur modellens text
 *   3. ursprungsärendet följer med ordagrant genom hela kedjan
 *   4. sammanfattningen kan inte påstå "klart" om något felade
 *
 *   npx playwright test tests/orchestration.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  validateNextStep,
  deriveStepStatus,
  toAgentResult,
  buildHandoffBriefing,
  buildOrchestrationSummary,
  shouldMatteSummarize,
  MAX_SPECIALIST_STEPS,
  type AgentResult,
  type OrchestrationIntent,
} from '../lib/agent/orchestration'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const STORGATAN: OrchestrationIntent = {
  text: 'Vi är klara på Storgatan, det blev fyra timmar extra och kunden vill ha fakturan idag.',
  customerId: 'cust_1',
  projectId: 'proj_1',
}

test.describe('planen — 1–3 steg, aldrig en loop', () => {
  test('Storgatan-kedjan matte→lars→karin godkänns', () => {
    const visited: any[] = []
    const steg1 = validateNextStep({ from: 'matte', target: 'lars', visited })
    expect(steg1.ok).toBe(true)
    visited.push('lars')
    const steg2 = validateNextStep({ from: 'lars', target: 'karin', visited })
    expect(steg2.ok).toBe(true)
  })

  test('fjärde specialisten nekas — taket är tre', () => {
    const visited: any[] = ['karin', 'daniel', 'hanna']
    expect(visited.length).toBe(MAX_SPECIALIST_STEPS)
    // hanna→lars är en tillåten riktning; det enda som stoppar den är taket.
    const r = validateNextStep({ from: 'hanna', target: 'lars', visited })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('max_steps')
  })

  test('A→B→A nekas — det är loopens första varv, inte ett steg', () => {
    const r = validateNextStep({ from: 'karin', target: 'lars', visited: ['lars', 'karin'] })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('agent_repeat')
  })

  test('Matte får återkomma — koordinatorn räknas inte som specialiststeg', () => {
    const r = validateNextStep({ from: 'karin', target: 'matte', visited: ['lars', 'karin', 'daniel'] })
    expect(r.ok).toBe(true)
  })

  test('påhittad agent och otillåten riktning nekas', () => {
    const påhittad = validateNextStep({ from: 'matte', target: 'rickard', visited: [] })
    expect(påhittad.ok).toBe(false)
    if (!påhittad.ok) expect(påhittad.reason).toBe('invalid_agent')

    const själv = validateNextStep({ from: 'karin', target: 'karin', visited: [] })
    expect(själv.ok).toBe(false)
  })
})

test.describe('status härleds ur utfallen, inte ur texten', () => {
  test('ett felat verktyg bland flera ger partial — aldrig completed', () => {
    expect(deriveStepStatus([
      { tool: 'log_time', ok: true },
      { tool: 'create_invoice', ok: false, error: 'Kunden finns inte i det här företaget' },
    ])).toBe('partial')
  })

  test('bara fel ger failed, godkännandekö ger awaiting_approval', () => {
    expect(deriveStepStatus([{ tool: 'create_invoice', ok: false, error: 'x' }])).toBe('failed')
    expect(deriveStepStatus([{ tool: 'create_approval_request', ok: true, awaitingApproval: true }]))
      .toBe('awaiting_approval')
  })

  test('inget verktyg alls = resonemang, inget påstående om världen', () => {
    expect(deriveStepStatus([])).toBe('completed')
  })

  test('modellens ord kan inte höja statusen', () => {
    const r = toAgentResult('karin', 'Klart! Fakturan är skickad till kunden.', [
      { tool: 'create_invoice', ok: false, error: 'Kunden finns inte i det här företaget' },
    ])
    expect(r.status).toBe('failed')
    expect(r.actions[0].status).toBe('failed')
  })
})

test.describe('ursprungsärendet överlever kedjan', () => {
  test('briefingen bär användarens egna ord ordagrant', () => {
    const brief = buildHandoffBriefing(STORGATAN, [], 'förbered fakturaunderlaget')
    expect(brief).toContain('fyra timmar extra')
    expect(brief).toContain('kunden vill ha fakturan idag')
    expect(brief).toContain('förbered fakturaunderlaget')
  })

  test('nästa specialist får veta vad kollegan faktiskt gjorde — och vad som felade', () => {
    const tidigare: AgentResult[] = [
      toAgentResult('lars', 'Registrerade fyra extra timmar på projektet.', [{ tool: 'log_time', ok: true }]),
      toAgentResult('daniel', 'Skulle lägga till materialet.', [
        { tool: 'create_ata_draft', ok: false, error: 'Hittade inget projekt' },
      ]),
    ]
    const brief = buildHandoffBriefing(STORGATAN, tidigare, 'gör fakturan')
    expect(brief).toContain('Lars')
    expect(brief).toContain('klart')
    expect(brief).toContain('gick inte')
    // Instruktionen som gör kedjan ärlig hela vägen ner:
    expect(brief).toContain('Påstå aldrig att något är gjort som du inte själv gjort')
  })
})

test.describe('Mattes sammanfattning kan inte ljuga', () => {
  const klart = toAgentResult('lars', 'Fyra extra timmar registrerade.', [{ tool: 'log_time', ok: true }])
  const väntar = toAgentResult('karin', 'Fakturan är förberedd.', [
    { tool: 'create_approval_request', ok: true, awaitingApproval: true },
  ])
  const fel = toAgentResult('daniel', 'Klart, allt är fixat!', [
    { tool: 'create_ata_draft', ok: false, error: 'Hittade inget projekt' },
  ])

  test('väntande godkännande redovisas som väntande — inte som klart', () => {
    const s = buildOrchestrationSummary([klart, väntar])
    expect(s).toContain('Klart:')
    expect(s).toContain('Väntar på ditt godkännande:')
    expect(s.indexOf('Väntar')).toBeGreaterThan(s.indexOf('Klart:'))
  })

  test('ett felat steg hamnar under "Gick inte" med det riktiga felet', () => {
    const s = buildOrchestrationSummary([klart, fel])
    expect(s).toContain('Gick inte:')
    expect(s).toContain('Hittade inget projekt')
    // Daniels egen "Klart, allt är fixat!" får aldrig bli sammanfattningens ord.
    expect(s).not.toContain('allt är fixat')
  })

  test('en ensam lyckad specialist får behålla ordet — ingen brus-summering', () => {
    expect(shouldMatteSummarize([klart])).toBe(false)
    expect(shouldMatteSummarize([klart, väntar])).toBe(true)
    expect(shouldMatteSummarize([fel])).toBe(true)
    expect(shouldMatteSummarize([])).toBe(false)
  })
})

test.describe('chattrutten använder lagret', () => {
  const s = read('app/api/matte/chat/route.ts')

  test('varje steg bokförs och planen validerar bytet', () => {
    expect(s).toContain('steps.push(toAgentResult(currentAgent, turn.text, turn.toolOutcomes))')
    expect(s).toContain('validateNextStep({ from: currentAgent')
    // Det gamla ettstegs-taket får inte smyga tillbaka.
    expect(s).not.toContain('MAX_PER_TURN_HANDOFFS')
  })

  test('nästa agent får briefingen, inte bara avgående agents fritext', () => {
    expect(s).toContain('buildHandoffBriefing(intent, steps,')
    expect(s, 'gamla handoff-kontexten kvar som enda överföring')
      .not.toContain('[Handoff-kontext: ${turn.handoff.context_for_next_agent}]')
  })

  test('Matte återtar tråden när hen summerar', () => {
    const i = s.indexOf('shouldMatteSummarize(redovisade)')
    expect(i).toBeGreaterThan(-1)
    const efter = s.slice(i, i + 1600)
    expect(efter).toContain('restoreThreadOwner(thread.id')
    expect(efter).toContain("currentAgent = 'matte'")
  })

  test('verktygsutfallen registreras där verktygen faktiskt körs', () => {
    expect(s).toContain('toolOutcomes.push({')
    expect(s).toContain("block.name === 'create_approval_request' ? { awaitingApproval: true }")
  })
})

test.describe('trådtaket är en backstop, inte planens loopskydd', () => {
  test('dygnstaket rymmer en trestegskedja', () => {
    const h = read('lib/agent/handoff.ts')
    const m = h.match(/MAX_HANDOFFS_PER_THREAD = (\d+)/)
    expect(m).toBeTruthy()
    expect(Number(m![1]), 'ett tak på 3 låser tråden ett dygn efter ETT tvärdomänärende')
      .toBeGreaterThan(MAX_SPECIALIST_STEPS)
  })

  test('återlämningen till Matte loggas inte som handoff — den får inte äta kvoten', () => {
    const h = read('lib/agent/handoff.ts')
    const i = h.indexOf('export async function restoreThreadOwner')
    expect(i).toBeGreaterThan(-1)
    const kropp = h.slice(i, i + 700)
    expect(kropp).not.toContain('agent_handoffs')
    expect(kropp).toContain('current_agent_id')
  })
})
