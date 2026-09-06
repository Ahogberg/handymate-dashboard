/**
 * Facit: F04 ur Codex livegenomgång (2026-09-06). Tidrapporter från söndagen
 * 6 september visades under V36 i veckovyn men "Vecka 37" i attestvyn.
 * Attestrutten räknade veckor från 1 januari med söndag som veckostart.
 * Nu ISO-vecka via samma hjälpare som veckovyn och måndagskortet.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { isoWeekInfo } from '../lib/jarvis/monday-brief'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test('söndag 6 september 2026 hör till vecka 36, och årsskiftet följer ISO', () => {
  expect(isoWeekInfo('2026-08-31')).toEqual({ isoYear: 2026, isoWeek: 36 })
  expect(isoWeekInfo('2026-09-07')).toEqual({ isoYear: 2026, isoWeek: 37 })
  // 2026 har 53 ISO-veckor (1 jan är en torsdag); 4 jan 2027 är vecka 1.
  expect(isoWeekInfo('2026-12-28')).toEqual({ isoYear: 2026, isoWeek: 53 })
  expect(isoWeekInfo('2027-01-04')).toEqual({ isoYear: 2027, isoWeek: 1 })
})

test('attestrutten räknar måndag i UTC ur datumsträngen och tar veckan ur isoWeekInfo', () => {
  const src = utanKommentarer(read('app/api/time-reports/approve/route.ts'))
  expect(src).toContain("import { isoWeekInfo } from '@/lib/jarvis/monday-brief'")
  expect(src).toContain('const { isoYear, isoWeek: weekNum } = isoWeekInfo(mondayStr)')
  expect(src).toContain('const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000)')
  expect(src).toContain('year: isoYear,')
  expect(src).not.toContain('yearStart.getDay()')
  expect(src).not.toMatch(/const d = new Date\(entry\.work_date\)/)
})

test('samma söndag ger samma vecka i attest- och veckovyns beräkning', () => {
  // Attestrutten: måndag ur söndagen 2026-09-06
  const d = new Date(Date.UTC(2026, 8, 6))
  const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86400000)
  expect(monday.toISOString().slice(0, 10)).toBe('2026-08-31')
  expect(isoWeekInfo('2026-08-31').isoWeek).toBe(36)
})
