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
    // Föråldrat facit uppdaterat 2026-08-25: create-from-quote.ts SKÄRPTE
    // felhanteringen (commit 2c5d7994, "log soft-fail explicit") — den läser
    // numera stageResult.moved och loggar båda felgrenarna explicit
    // ("returnerade moved:false" + "kastade"), vilket är STARKARE än den
    // gamla catch-only-texten facitet letade efter. Acceptera båda formerna.
    for (const fil of ['lib/projects/create-from-quote.ts', 'lib/autopilot/trigger.ts', 'lib/e2e-deal-flow.ts']) {
      const s = kod(fil)
      const init = s.indexOf('SYSTEM_STAGES.CONTRACT_SIGNED')
      const gamlaFormen = s.indexOf('stage init error (non-blocking)', init - 800)
      const skarptaFormen = s.indexOf('stage init kastade (non-blocking)', init - 800)
      expect(
        gamlaFormen > -1 || skarptaFormen > -1,
        `${fil}: stegfel skulle krascha skapandet`,
      ).toBe(true)
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

test.describe('Jobb igång har verkliga producenter (2026-08-10)', () => {
  test('framåt-vakten backar aldrig och rör aldrig egna steg', () => {
    const s = kod('lib/project-stages/automation-engine.ts')
    const fn = s.slice(s.indexOf('export async function advanceProjectStageForward'))
    // Eget (icke-ps-) steg → rör inte; redan där eller längre → ingen flytt.
    expect(fn).toContain('/^ps-\\d\\d$/')
    expect(fn).toContain('current >= stageId')
  })

  test('incheckningen flyttar projektet till Jobb igång — fire-and-forget', () => {
    const s = kod('app/api/time-entry/check-in/route.ts')
    expect(s).toContain('advanceProjectStageForward')
    expect(s).toContain('SYSTEM_STAGES.JOB_STARTED')
    expect(s, 'ett stegfel får aldrig fälla incheckningen').toContain('non-blocking')
  })

  test('det dagliga svepet fångar tidrapporter OCH passerade bokningsstarter', () => {
    const s = kod('app/api/cron/maintenance/route.ts')
    expect(s).toContain('SYSTEM_STAGES.JOB_STARTED')
    expect(s).toContain("from('time_entry')")
    expect(s).toContain(".lte('scheduled_start'")
    // Fel läses — ett tyst misslyckat uppslag får inte se ut som "inget arbete".
    expect(s).toContain('if (teRes.error) throw teRes.error')
  })

  test('sidoflödena läser flytt-resultatet — motorn kastar inte', () => {
    // Motorn svarar { moved, error }; try/catch räcker inte. Utan läsningen
    // är ett misslyckande osynligt i just pengavägarna.
    // 2026-08-25: fakturasändningens stegflytt bor sedan Etapp Q (TD-86,
    // 2026-08-18) i den delade sändkärnan lib/invoices/send-invoice.ts —
    // rutten är numera tunn (auth/validering) och rör inte stegmotorn.
    // Facitet pekade kvar på rutten och låg rött sedan dess.
    // 2026-08-25: complete-job-rutten delegerar sedan kanoniseringen
    // (d53c90d4) hela stängningskedjan till lib/projects/complete-project.ts
    // — det är DÄR stegflytten görs och .moved läses numera (effects-raden i
    // runCompletionEffects). Facitet pekade kvar på rutten.
    // 2026-08-26: Fortnox-betalsynken (lib/fortnox/sync-payments.ts) rör
    // inte stegmotorn själv längre — den går genom applyInvoicePayment,
    // vars runPostPaymentAutomations är den enda kopian av kedjan och
    // läser .moved. Låses nedan i stället för via sync-payments.
    for (const fil of [
      'lib/invoices/send-invoice.ts',
      'lib/invoices/apply-payment.ts',
      'lib/projects/complete-project.ts',
      'app/api/bookings/route.ts',
    ]) {
      expect(kod(fil), `${fil} läser inte flytt-resultatet`).toContain('.moved')
    }
    expect(kod('lib/fortnox/sync-payments.ts'), 'synken ska gå genom betal-kärnan').toContain('applyInvoicePayment(')
    expect(kod('lib/fortnox/sync-payments.ts'), 'ingen egen stegflytt i synken').not.toContain('advanceProjectStage')
  })
})
