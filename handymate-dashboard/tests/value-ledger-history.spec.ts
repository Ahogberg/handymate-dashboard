/**
 * Facit för GET /api/value/ledger/history (Etapp B5, 2026-08-17).
 *
 * Rutten är ett tunt uppslagsskal utan egen matte (den loopar
 * getManadsLedger bakåt), så facit är källskannande — samma stil som
 * tests/cron-auth.spec.ts och tests/permission-contract.spec.ts använder
 * för rutt-kontrakt. Det som låses:
 *
 *   1. Auth-blocket är IDENTISKT med systerrutten /api/value/ledger:
 *      getAuthenticatedBusiness + isOwnerOrAdmin på anropsstället.
 *   2. months-parametern klampas 1–12 med default 7 — en request kan
 *      aldrig tvinga fram en obegränsad omberäkningsloop.
 *   3. Perioderna byggs äldst-först (loopindex räknar bakåt från den
 *      äldsta månaden) — svaret är stigande i tid, redo för stapelraden.
 *   4. Ärlighetsbrasklappen finns i filhuvudet: allt är ren omberäkning,
 *      inget lagras, och en framtida method_version-bump ändrar
 *      historiska siffror.
 *
 *   npx playwright test tests/value-ledger-history.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE = path.join(
  __dirname, '..', 'app', 'api', 'value', 'ledger', 'history', 'route.ts',
)

function routeBody(): string {
  // Stryk importrader — en import är inget skydd (samma regel som
  // permission-contract.spec.ts).
  return fs
    .readFileSync(ROUTE, 'utf8')
    .split('\n')
    .filter(line => !/^\s*import\b/.test(line))
    .join('\n')
}

test.describe('history-rutten — auth-kontraktet', () => {
  test('filen finns', () => {
    expect(fs.existsSync(ROUTE), `saknas: ${ROUTE}`).toBe(true)
  })

  test('grindas med getAuthenticatedBusiness + isOwnerOrAdmin på anropsstället', () => {
    const body = routeBody()
    expect(body).toMatch(/\bgetAuthenticatedBusiness\s*\(/)
    expect(body).toMatch(/\bisOwnerOrAdmin\s*\(/)
    // 401 före 403 — samma ordning som systerrutten /api/value/ledger.
    expect(body.indexOf('getAuthenticatedBusiness(')).toBeLessThan(
      body.indexOf('isOwnerOrAdmin('),
    )
  })
})

test.describe('history-rutten — clamp och ordning', () => {
  test('months klampas 1–12 med default 7', () => {
    const body = routeBody()
    expect(body).toMatch(/DEFAULT_MANADER\s*=\s*7/)
    expect(body).toMatch(/MAX_MANADER\s*=\s*12/)
    expect(body).toMatch(/Math\.min\(\s*MAX_MANADER\s*,\s*Math\.max\(\s*1\s*,/)
  })

  test('perioderna byggs äldst-först', () => {
    // Loopen räknar från (manader - 1) månader bakåt ned till 0 = nu, så
    // rader pushas i stigande tidsordning utan efterhandssortering.
    expect(routeBody()).toMatch(/for\s*\(\s*let\s+i\s*=\s*manader\s*-\s*1\s*;\s*i\s*>=\s*0\s*;\s*i--\s*\)/)
  })

  test('ärlighetsbrasklappen — ren omberäkning + method_version-brasklapp dokumenteras', () => {
    const source = fs.readFileSync(ROUTE, 'utf8')
    expect(source).toContain('method_version')
    expect(source.toLowerCase()).toContain('omberäkning')
    expect(source.toLowerCase()).toContain('inget lagras')
  })
})
