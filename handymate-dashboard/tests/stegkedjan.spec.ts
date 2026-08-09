/**
 * Facit för stegkedjans start (2026-08-09, projektauditen P1-1).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Ingen av projektskaparna initierade workflow-steget. Ett projekt föddes med
 * stage null och stod så tills första fakturahändelsen — projektlistan kunde
 * inte svara på var jobbet står, trots att svaret var känt vid födseln:
 * kommer projektet ur en signerad offert ÄR avtalet tecknat.
 *
 * Fakturaövergångarna (INVOICE_SENT/PAID) var redan lagade via
 * findProjectForEntity (invoice.project_id) — det här stänger andra halvan.
 *
 *   npx playwright test tests/stegkedjan.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const kod = (p: string) =>
  read(p)
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

test.describe('stegkedjan startar vid födseln', () => {
  const OFFERTSKAPARNA = [
    'lib/projects/create-from-quote.ts',
    'lib/autopilot/trigger.ts',
    'lib/e2e-deal-flow.ts',
  ]

  for (const fil of OFFERTSKAPARNA) {
    test(`${fil} initierar Avtal signerat`, () => {
      // Alla tre föder projekt ur en signerad offert — första steget är känt.
      const s = kod(fil)
      expect(s, `${fil} initierar inget steg`).toContain('SYSTEM_STAGES.CONTRACT_SIGNED')
      expect(s).toContain('advanceProjectStage')
    })
  }

  test('manuell skapare väljer steg efter vad som är SANT', () => {
    // from_quote → avtal tecknat; manuellt aktivt → jobb igång; manuell
    // planering → INGET steg. Ett projekt utan känd historia ska inte påstå en.
    const s = kod('app/api/projects/route.ts')
    expect(s).toContain("? 'CONTRACT_SIGNED'")
    expect(s).toContain("? 'JOB_STARTED'")
    expect(s, 'planeringsprojekt måste kunna förbli steglösa').toContain(': null')
  })

  test('initieringen är fire-and-forget — får aldrig sinka skapandet', () => {
    for (const fil of ['lib/projects/create-from-quote.ts', 'lib/autopilot/trigger.ts', 'lib/e2e-deal-flow.ts']) {
      const s = kod(fil)
      const init = s.indexOf('SYSTEM_STAGES.CONTRACT_SIGNED')
      const felhantering = s.indexOf('stage init error (non-blocking)', init - 800)
      expect(felhantering, `${fil}: stegfel skulle krascha skapandet`).toBeGreaterThan(-1)
    }
  })

  test('motorn är idempotent — dubbelinit är ofarlig', () => {
    // Skaparnas init + en senare händelse på samma steg får inte ge dubbla
    // history-rader. Motorns skip-regel är kontraktet initieringen vilar på.
    const s = read('lib/project-stages/automation-engine.ts')
    expect(s).toContain('if (project.current_workflow_stage_id === stageId) return { moved: true }')
  })

  test('fakturaövergångarna slår upp via invoice.project_id — inte en död kolumn', () => {
    const s = kod('lib/project-stages/automation-engine.ts')
    const fn = s.slice(s.indexOf('export async function findProjectForEntity'))
    expect(fn).toContain("from('invoice')")
    expect(fn).toContain("select('project_id')")
  })
})
