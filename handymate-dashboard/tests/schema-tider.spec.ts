/**
 * Facit: schemats tider överlever sparning och syns hela valda intervallet
 * (driftfynd F08/F09 i PR #16, 2026-09-06), plus två skyddsnät som samma
 * genomgång visade saknades:
 *
 *  - F08: formuläret skickar naiv lokaltid "2026-09-06T08:00:00"; utan
 *    offset lagrar Postgres (timestamptz, session UTC) den som 08:00Z och
 *    Stockholm visar 10:00. Servern stämplar nu Stockholm-offsetet.
 *  - F09: veckovyn frågar end_date=2026-09-06 (= midnatt) och söndagens
 *    poster föll bort. Servern använder halvöppet dygnsintervall i svensk tid.
 *  - F01: project_checklist.order_id var NOT NULL i produktion fast alla
 *    skrivvägar skapar checklistor per projekt (v215).
 *  - F02: rate_limit_check fanns inte i produktion och den publika grinden
 *    är fail-closed ⇒ tolv publika rutter nekade. Varje .rpc('x') i koden
 *    måste ha en CREATE FUNCTION x i sql/ — det fångar "aldrig skriven",
 *    produktionskontrollen görs mot information_schema vid deploy.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { svOffsetForDate, svNaiveToIso, svDayRange, svDatePlusDays } from '../lib/dates'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test.describe('Stockholm-offset per kalenderdag', () => {
  test('sommartid +02:00, normaltid +01:00', () => {
    expect(svOffsetForDate('2026-09-06')).toBe('+02:00')
    expect(svOffsetForDate('2026-01-15')).toBe('+01:00')
    expect(svOffsetForDate('2026-07-01')).toBe('+02:00')
  })
  test('DST-bytesdagarna räknas från midnatt: 29 mars är fortfarande +01:00, 25 oktober fortfarande +02:00', () => {
    expect(svOffsetForDate('2026-03-29')).toBe('+01:00')
    expect(svOffsetForDate('2026-10-25')).toBe('+02:00')
    expect(svOffsetForDate('2026-03-30')).toBe('+02:00')
    expect(svOffsetForDate('2026-10-26')).toBe('+01:00')
  })
})

test.describe('svNaiveToIso — F08', () => {
  test('naiv lokaltid får Stockholm-offset, sekunder fylls i', () => {
    expect(svNaiveToIso('2026-09-06T08:00')).toBe('2026-09-06T08:00:00+02:00')
    expect(svNaiveToIso('2026-09-06T08:00:00')).toBe('2026-09-06T08:00:00+02:00')
    expect(svNaiveToIso('2026-12-24T15:30:00')).toBe('2026-12-24T15:30:00+01:00')
  })
  test('08:00 i Stockholm blir 06:00Z i september — inte 08:00Z', () => {
    expect(new Date(svNaiveToIso('2026-09-06T08:00:00')).toISOString()).toBe('2026-09-06T06:00:00.000Z')
  })
  test('strängar med Z eller offset lämnas orörda, skräp likaså', () => {
    expect(svNaiveToIso('2026-09-06T06:00:00.000Z')).toBe('2026-09-06T06:00:00.000Z')
    expect(svNaiveToIso('2026-09-06T08:00:00+02:00')).toBe('2026-09-06T08:00:00+02:00')
    expect(svNaiveToIso('inte ett datum')).toBe('inte ett datum')
    expect(svNaiveToIso('')).toBe('')
  })
})

test.describe('svDayRange — F09', () => {
  test('veckan 31 aug–6 sep täcker söndagen till midnatt, halvöppet', () => {
    const r = svDayRange('2026-08-31', '2026-09-06')
    expect(r.from).toBe('2026-08-31T00:00:00+02:00')
    expect(r.toExclusive).toBe('2026-09-07T00:00:00+02:00')
    // Söndag 6 sep 16:00 lokal ligger inom intervallet
    const sondag = new Date('2026-09-06T16:00:00+02:00').getTime()
    expect(sondag).toBeGreaterThanOrEqual(new Date(r.from).getTime())
    expect(sondag).toBeLessThan(new Date(r.toExclusive).getTime())
  })
  test('svDatePlusDays över månads- och årsskifte', () => {
    expect(svDatePlusDays('2026-09-30', 1)).toBe('2026-10-01')
    expect(svDatePlusDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(svDatePlusDays('2026-03-01', -1)).toBe('2026-02-28')
  })
})

test.describe('Inkoppling i schemarutterna', () => {
  test('POST och PUT normaliserar start_datetime/end_datetime med svNaiveToIso', () => {
    const post = utanKommentarer(read('app/api/schedule/route.ts'))
    expect(post).toMatch(/from ['"]@\/lib\/dates['"]/)
    expect(post).toContain("const start_datetime = typeof body.start_datetime === 'string' ? svNaiveToIso(body.start_datetime)")
    expect(post).toContain("const end_datetime = typeof body.end_datetime === 'string' ? svNaiveToIso(body.end_datetime)")
    const put = utanKommentarer(read('app/api/schedule/[id]/route.ts'))
    expect(put).toContain("for (const f of ['start_datetime', 'end_datetime'] as const)")
    expect(put).toContain('updates[f] = svNaiveToIso(updates[f])')
  })
  test('GET använder halvöppet dygnsintervall för datumparametrar', () => {
    const src = utanKommentarer(read('app/api/schedule/route.ts'))
    expect(src).toContain("query.gte('end_datetime', DATUM.test(startDate) ? svDayRange(startDate, startDate).from : startDate)")
    expect(src).toContain("query.lt('start_datetime', svDayRange(endDate, endDate).toExclusive)")
    // Den gamla råa strängjämförelsen får inte finnas kvar som eget villkor
    expect(src).not.toMatch(/if \(endDate\) \{\s*query = query\.lte\('start_datetime', endDate\)/)
  })
})

test.describe('F01 — checklistor per projekt', () => {
  test('v215 finns och släpper NOT NULL på order_id med projekt-eller-order-villkor', () => {
    const sql = read('sql/v215_project_checklist_order_optional.sql')
    expect(sql).toContain('ALTER COLUMN order_id DROP NOT NULL')
    expect(sql).toContain('CHECK (project_id IS NOT NULL OR order_id IS NOT NULL)')
  })
  test('skrivvägarna i approvals sätter project_id, aldrig order_id', () => {
    const src = utanKommentarer(read('app/api/approvals/[id]/route.ts'))
    const inserts = src.split(".from('project_checklist').insert(").slice(1)
    expect(inserts.length).toBeGreaterThanOrEqual(2)
    for (const block of inserts) {
      const payload = block.slice(0, block.indexOf('})'))
      expect(payload).toContain('project_id:')
      expect(payload).not.toContain('order_id')
    }
  })
})

test.describe('F02 — varje RPC koden anropar är definierad i sql/', () => {
  test('.rpc(namn) ⇒ CREATE FUNCTION namn finns', () => {
    const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => {
      const p = path.join(d, e.name)
      if (e.isDirectory()) return e.name === 'node_modules' ? [] : walk(p)
      return /\.tsx?$/.test(e.name) ? [p] : []
    })
    const names = new Set<string>()
    for (const dir of ['app', 'lib']) for (const f of walk(path.join(ROOT, dir))) {
      for (const m of Array.from(utanKommentarer(fs.readFileSync(f, 'utf8')).matchAll(/\.rpc\('([a-z_0-9]+)'/g))) names.add(m[1])
    }
    expect(names.size).toBeGreaterThan(5)
    const sqlAll = fs.readdirSync(path.join(ROOT, 'sql')).filter(f => f.endsWith('.sql')).map(f => read(`sql/${f}`)).join('\n')
    const saknas = Array.from(names).filter(n => !new RegExp(`FUNCTION\\s+(public\\.)?${n}\\s*\\(`, 'i').test(sqlAll))
    expect(saknas, 'RPC utan CREATE FUNCTION i sql/ — den kan inte finnas i produktion').toEqual([])
  })
})
