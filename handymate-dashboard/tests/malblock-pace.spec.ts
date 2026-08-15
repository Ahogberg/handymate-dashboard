/**
 * Facit för MalBlock.tsx:s takt-beräkning (2026-08-15) — bytt ut den grova
 * "denna månad / (årsmål÷12)"-uppskattningen mot den delade dag-i-året-
 * matematiken i lib/economy/revenue-pace.ts (samma som Next Best Action
 * redan använder). Källskanning, browserlöst.
 *
 *   npx playwright test tests/malblock-pace.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const malBlock = read('components/value/MalBlock.tsx')

test.describe('MalBlock — takten kommer från den delade matematiken, inte en egen uppskattning', () => {
  test('den gamla grova /12-uträkningen är borta', () => {
    expect(malBlock).not.toContain('revenueTargetAnnual / 12')
    expect(malBlock).not.toContain('av månadsmålet')
  })

  test('computeRevenuePace importeras och används', () => {
    expect(malBlock).toContain("import { computeRevenuePace } from '@/lib/economy/revenue-pace'")
    expect(malBlock).toContain('computeRevenuePace({')
  })

  test('YTD-uppslaget är tenant-filtrerat och körs bara när ett mål är satt', () => {
    const effectStart = malBlock.indexOf("if (revenueTargetAnnual == null) return")
    expect(effectStart, 'YTD-hämtningen körs oavsett om ett mål är satt').toBeGreaterThan(-1)
    const query = malBlock.indexOf("from('invoice')", effectStart)
    expect(query).toBeGreaterThan(effectStart)
    const tenantFilter = malBlock.indexOf("eq('business_id', business.business_id)", query)
    expect(tenantFilter, 'YTD-frågan saknar tenant-filter').toBeGreaterThan(query)
  })

  test('laddningsläget visar en neutral text, aldrig en halvfärdig/gissad siffra', () => {
    expect(malBlock).toContain('Räknar takt…')
  })

  test('svDateStr används för dagens datum, inte en rå UTC new Date()', () => {
    expect(malBlock).toContain("import { svDateStr } from '@/lib/dates'")
    expect(malBlock).toContain('todayIso: svDateStr()')
  })
})
