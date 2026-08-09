/**
 * Facit för four-eyes-grinden på projektstängning (2026-08-09,
 * projektauditen P1-5).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * Grinden löd `body.budget_amount || 0` och tröskelkontrollen kördes bara när
 * det var falsy. Ett anrop med {status:'completed', budget_amount: 1} hoppade
 * över HELA kontrollen — klienten kunde stänga vilket projekt som helst förbi
 * fyra ögon genom att skicka en krona. En policygrind som frågar den grindade
 * parten om värdet är ingen grind.
 *
 *   npx playwright test tests/fyra-ogon.spec.ts --no-deps --project=chromium
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

const PUT = 'app/api/projects/route.ts'
const APPROVE = 'app/api/approvals/[id]/route.ts'

/** Grindblocket: från completed-kontrollen till completed_at-sättningen. */
function grinden(): string {
  const s = kod(PUT)
  const start = s.indexOf("if (body.status === 'completed')")
  expect(start, 'completed-grenen hittas inte').toBeGreaterThan(-1)
  return s.slice(start, s.indexOf('updates.completed_at', start))
}

test.describe('grinden frågar databasen, aldrig klienten', () => {
  const GATE = 'lib/projects/four-eyes-gate.ts'

  test('body.budget_amount deltar inte i beslutet', () => {
    expect(grinden(), 'klientens belopp styr fortfarande grinden').not.toContain('body.budget_amount')
    expect(kod(GATE), 'helpern läser klientdata').not.toContain('body.')
  })

  test('projektvärdet hämtas ur databasen, tenantfiltrerat', () => {
    const g = kod(GATE)
    expect(g).toContain("select('budget_amount")
    expect(g, 'projektuppslaget saknar tenantfilter').toContain("eq('business_id', businessId)")
  })

  test('tröskeln prövas ovillkorligt när fyra ögon är på', () => {
    // Den gamla formen prövade bara i en gren som gick att undvika. Nu:
    // enabled → slå upp → jämför. Ingen väg runt.
    const g = kod(GATE)
    const enabled = g.indexOf('four_eyes_enabled')
    const uppslag = g.indexOf("from('project')")
    const jamforelse = g.indexOf('budgetAmount < threshold')
    expect(enabled).toBeGreaterThan(-1)
    expect(uppslag).toBeGreaterThan(enabled)
    expect(jamforelse).toBeGreaterThan(uppslag)
  })

  test('upprepad stängning ger samma kort, inte ett nytt per försök', () => {
    const g = kod(GATE)
    expect(g, 'ingen dedup mot befintligt pending-kort').toContain("eq('approval_type', 'four_eyes_project_close')")
    expect(g).toContain('return { gated: true, approvalId: existing.id')
  })
})

test.describe('en policy, ett lås — alla dörrar', () => {
  test('grinden har EN definition som båda dörrarna använder', () => {
    // PUT /api/projects och mobilens complete-job stänger projekt. Två
    // kopior av grinden hade glidit isär — precis som de redan gjort en gång.
    expect(kod('lib/projects/four-eyes-gate.ts')).toContain('export async function checkFourEyesGate')
    expect(kod(PUT)).toContain('checkFourEyesGate(')
    expect(kod('app/api/booking/complete-job/route.ts')).toContain('checkFourEyesGate(')
  })

  test('sidodörren grindar FÖRE projektskrivningen, men bokningen bockas ändå', () => {
    const s = kod('app/api/booking/complete-job/route.ts')
    const bokning = s.indexOf("job_status: 'completed'")
    const grind = s.indexOf('checkFourEyesGate(')
    const stangning = s.indexOf("status: 'completed'", grind)
    expect(bokning, 'bokningen bockas inte av före grinden').toBeLessThan(grind)
    expect(grind, 'grinden ligger efter projektstängningen').toBeLessThan(stangning)
    expect(s).toContain('project_completed: false')
  })

  test('ett trasigt kort öppnar inte låset', () => {
    // Kan kortet inte skapas GÄLLER grinden ändå — felet får inte bli en
    // gräddfil förbi policyn.
    const s = kod('lib/projects/four-eyes-gate.ts')
    const insertFel = s.indexOf('if (insertError)')
    const svar = s.indexOf('return { gated: true', insertFel)
    expect(insertFel).toBeGreaterThan(-1)
    expect(svar, 'insert-fel släpper igenom stängningen').toBeGreaterThan(insertFel)
  })
})

test.describe('godkännandet är en utväg, inte en återvändsgränd', () => {
  test('godkänt kort stänger projektet — i rätt företag', () => {
    // Utan utföraren hade den lagade grinden skapat en evighetsloop:
    // PUT grindar → kort → godkänn → PUT grindar igen. Caset måste finnas
    // och uppdateringen måste bära kortets businessId.
    const s = kod(APPROVE)
    const fall = s.indexOf("case 'four_eyes_project_close'")
    expect(fall, 'utföraren saknas — godkännandet leder ingenvart').toBeGreaterThan(-1)
    const block = s.slice(fall, s.indexOf('case ', fall + 10))
    expect(block).toContain("update({ status: 'completed'")
    expect(block, 'stängningen saknar tenantfilter').toContain("eq('business_id', businessId)")
  })
})
