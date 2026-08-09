/**
 * Facit för det härledda driftläget (2026-08-09, projektauditen P1-2).
 *
 * Fem representationer konkurrerade om var ett projekt står. Driftläget
 * härleds nu ur FAKTA — status/avslut + fakturornas tillstånd — i en ren
 * funktion. Facitet ÄR sanningstabellen.
 *
 *   npx playwright test tests/driftlaget.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { deriveProjectLifecycle } from '../lib/projects/derive-lifecycle'

const ROOT = path.resolve(__dirname, '..')
const kod = (p: string) =>
  fs.readFileSync(path.join(ROOT, p), 'utf8')
    .replace(/^[ \t]*\/\*[\s\S]*?\*\//gm, '')
    .replace(/^\s*\/\/.*$/gm, '')

const inga: Array<{ status: string | null }> = []
const fall = (status: string | null, completed: string | null, fakturor: Array<{ status: string | null }>) =>
  deriveProjectLifecycle({ status, completed_at: completed, invoices: fakturor })

test.describe('sanningstabellen — pengarnas ordning', () => {
  test('planering: varken igång eller fakturerat', () => {
    expect(fall('planning', null, inga).phase).toBe('planering')
  })

  test('pågår: aktivt projekt, oavsett delfakturor', () => {
    expect(fall('active', null, inga).phase).toBe('pagar')
    expect(fall('active', null, [{ status: 'sent' }]).phase).toBe('pagar')
    expect(fall('active', null, [{ status: 'paid' }]).phase).toBe('pagar')
  })

  test('klart utan faktura är fasen som ska göra ont', () => {
    const d = fall('completed', '2026-08-01', inga)
    expect(d.phase).toBe('klart_ofakturerat')
    expect(d.needsAction).toBe(true)
  })

  test('utkastet räknas inte som fakturerat — det har inte lämnat huset', () => {
    const d = fall('completed', '2026-08-01', [{ status: 'draft' }])
    expect(d.phase).toBe('klart_ofakturerat')
    expect(d.needsAction).toBe(true)
    expect(d.label).toContain('granskning')
  })

  test('skickad faktura = fakturerat; betald = betalt — betalt vinner', () => {
    expect(fall('completed', '2026-08-01', [{ status: 'sent' }]).phase).toBe('fakturerat')
    expect(fall('completed', '2026-08-01', [{ status: 'overdue' }]).phase).toBe('fakturerat')
    expect(fall('completed', '2026-08-01', [{ status: 'sent' }, { status: 'paid' }]).phase).toBe('betalt')
  })

  test('completed_at räcker — status kan ljuga åt andra hållet', () => {
    // Ett projekt med completed_at men status 'active' (reopen-buggen,
    // auditens P2-4) ska ändå bedömas på avslutsfaktumet.
    expect(fall('active', '2026-08-01', inga).phase).toBe('klart_ofakturerat')
  })

  test('avbrutet kräver ingenting', () => {
    const d = fall('cancelled', null, inga)
    expect(d.phase).toBe('avbrutet')
    expect(d.needsAction).toBe(false)
  })

  test('tål skräp: null-status, tom lista, okända fakturastatusar', () => {
    expect(fall(null, null, inga).phase).toBe('planering')
    expect(fall('completed', '2026-08-01', [{ status: 'påhittad' }]).phase).toBe('klart_ofakturerat')
  })
})

test.describe('härledningen läser fakta, inte påståenden', () => {
  test('progress_percent och workflow-steget deltar inte', () => {
    const s = kod('lib/projects/derive-lifecycle.ts')
    expect(s).not.toContain('progress_percent')
    expect(s).not.toContain('workflow_stage')
  })

  test('projektlistan bär driftläget, härlett ur fakturatabellen', () => {
    const s = kod('app/api/projects/route.ts')
    expect(s).toContain('deriveProjectLifecycle({')
    expect(s, 'fakturafakta hämtas inte').toContain("select('project_id, status')")
  })
})

test.describe('listan svarar "vad behöver jag göra?" (P2-1)', () => {
  test('raden bär driftläges-badgen, med statusfältet bara som fallback', () => {
    const s = kod('app/dashboard/projects/page.tsx')
    expect(s).toContain('project.lifecycle ? (')
    expect(s).toContain('getLifecycleStyle(project.lifecycle.phase, project.lifecycle.needsAction)')
  })

  test('needsAction sorteras överst — pengar som väntar syns först', () => {
    const s = kod('app/dashboard/projects/page.tsx')
    expect(s).toContain('needsAction ?? false')
  })

  test('fasen som gör ont är visuellt varm, inte grå', () => {
    const s = kod('app/dashboard/projects/page.tsx')
    const fn = s.slice(s.indexOf('getLifecycleStyle'))
    const vakt = fn.indexOf('needsAction) return')
    expect(vakt, 'needsAction har ingen egen stil').toBeGreaterThan(-1)
    expect(fn.slice(vakt, vakt + 120)).toContain('amber')
  })
})
