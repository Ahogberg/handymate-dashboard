/**
 * Facit för projektstängningens övergångssemantik (2026-08-09,
 * projektauditen P2-4).
 *
 * ═══ VAD SOM VAR FEL ═══
 *
 * PUT /api/projects eldade ALLA stängnings-sidoeffekter varje gång
 * body.status var 'completed' — även när projektet redan var stängt.
 * job_completed-eventet dubblerade recensionsbegäran och nurture per klick.
 * Och en återöppning nollade completed_at helt tyst, medan fakturan, det
 * frysta utfallet och recensionsbegäran låg kvar.
 *
 *   npx playwright test tests/projektstangningen.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const PUT = 'app/api/projects/route.ts'

/** PUT-hanteraren — från föregående-uppslaget och nedåt. */
function hanteraren(): string {
  const s = kod(PUT)
  const i = s.indexOf('const varRedanKlart')
  expect(i, 'föregående-tillstånd-vakten saknas').toBeGreaterThan(-1)
  return s.slice(i)
}

test.describe('sidoeffekter eldas på övergången, inte på statusen', () => {
  test('föregående tillstånd hämtas FÖRE uppdateringen', () => {
    const s = kod(PUT)
    const uppslag = s.indexOf("select('status, completed_at')")
    const uppdatering = s.indexOf('.update(updates)')
    expect(uppslag, 'föregående status slås aldrig upp').toBeGreaterThan(-1)
    expect(uppslag).toBeLessThan(uppdatering)
  })

  test('job_completed-kedjan vaktas av blirKlart', () => {
    const h = hanteraren()
    // Inga sidoeffektsblock får längre trigga på body.status === completed.
    const eventBlock = h.indexOf('fireEvent')
    expect(eventBlock).toBeGreaterThan(-1)
    const fore = h.slice(0, eventBlock)
    const vakt = fore.lastIndexOf('blirKlart && project')
    expect(vakt, 'eventkedjan vaktas inte av övergången').toBeGreaterThan(-1)
    expect(h, "gamla villkoret är kvar någonstans").not.toContain("body.status === 'completed' && project")
  })

  test('four-eyes-grinden prövas bara på övergången', () => {
    // Ett redan stängt projekt som PUT:as igen ska inte generera nya kort.
    const h = hanteraren()
    const grind = h.indexOf('checkFourEyesGate(')
    const vakt = h.indexOf('if (blirKlart)')
    expect(vakt).toBeGreaterThan(-1)
    expect(vakt).toBeLessThan(grind)
  })

  test('upprepad stängning skriver inte om stängningsdatumet', () => {
    // completed_at är datumet projektet stängdes — inte senaste klicket.
    // Sätts bara inne i blirKlart-grenen.
    const h = hanteraren()
    const satt = h.indexOf('updates.completed_at = new Date()')
    const vakt = h.lastIndexOf('if (blirKlart)', satt)
    expect(satt).toBeGreaterThan(-1)
    expect(vakt, 'completed_at sätts utanför övergångsvakten').toBeGreaterThan(-1)
  })
})

test.describe('återöppning är synlig, inte tyst', () => {
  test('reopen loggar vad som INTE rullas tillbaka', () => {
    const h = hanteraren()
    expect(h).toContain('aterOppnas')
    expect(h).toContain('rullas INTE tillbaka')
  })
})

test.describe('detaljen skiljer tomt från trasigt (P2-3)', () => {
  test('barnfrågorna körs parallellt och delfel redovisas', () => {
    const s = kod('app/api/projects/[id]/route.ts')
    expect(s).toContain('Promise.all')
    expect(s).toContain('partial_errors: partialErrors')
    // Varje failad sektion loggas med namn — inte sväljs.
    expect(s).toContain('partialErrors.push(namn)')
  })
})
