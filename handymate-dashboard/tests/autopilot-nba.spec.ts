/**
 * Facit: Pass D — NBA får sina principer, kill-switchen täcker allt
 * (2026-09-04, tasks/plan-autopilot-D-nba.md). Källskanning, browserlöst:
 * inga sessioner, inga nätanrop.
 *
 *   npx playwright test tests/autopilot-nba.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'
import { HUSREGLER } from '../lib/jarvis/husregler'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('husregler.ts — standardprinciper när kontot saknar egna', () => {
  test('HUSREGLER exporterar exakt tre strängar', () => {
    expect(Array.isArray(HUSREGLER)).toBe(true)
    expect(HUSREGLER).toHaveLength(3)
    for (const regel of HUSREGLER) {
      expect(typeof regel).toBe('string')
      expect(regel.trim().length).toBeGreaterThan(0)
    }
  })

  test('riktiga å/ä/ö-tecken, aldrig unicode-escapes', () => {
    const källa = read('lib/jarvis/husregler.ts')
    expect(källa).not.toMatch(/\\u00[e6][0-9a-f]/i) // å, ä, ö osv
    expect(/[åäö]/.test(HUSREGLER.join(' '))).toBe(true)
  })
})

test.describe('next-best-action.ts — husregler som fallback, spärren kvar', () => {
  const källa = read('lib/jarvis/next-best-action.ts')

  test('importerar HUSREGLER', () => {
    expect(källa).toContain("from './husregler'")
    expect(källa).toMatch(/import\s*\{\s*HUSREGLER\s*\}/)
  })

  test('principles_source skrivs (husregler | kontot)', () => {
    expect(källa).toContain('principles_source')
    expect(källa).toContain("'husregler'")
    expect(källa).toContain("'kontot'")
  })

  test('MIN_PRINCIPLES-kontrollen finns kvar och kan aldrig slå till när kontot saknar egna principer', () => {
    expect(källa).toContain('principles.length < MIN_PRINCIPLES')
    // Husreglerna används bara som fallback, INTE i tillägg till kontots egna.
    expect(källa).toMatch(/principlesSource === 'kontot' \? accountPrinciples : HUSREGLER/)
  })

  test('spärren körs fortfarande FÖRE målkontexten hämtas', () => {
    const spärr = källa.indexOf('principles.length < MIN_PRINCIPLES')
    const målkontext = källa.indexOf('getGoalContext(')
    expect(spärr).toBeGreaterThan(-1)
    expect(målkontext).toBeGreaterThan(spärr)
  })
})

test.describe('evaluate-thresholds — agents_globally_paused-grinden', () => {
  const källa = read('app/api/cron/evaluate-thresholds/route.ts')

  test('agents_globally_paused selectas från business_config', () => {
    expect(källa).toMatch(/\.select\(['"]business_id,\s*agents_globally_paused['"]\)/)
  })

  test('pausade konton hoppas över', () => {
    expect(källa).toMatch(/agents_globally_paused === true/)
  })

  test('skipped_paused räknas och finns i svaret', () => {
    expect(källa).toContain('skipped_paused')
    expect(källa).toMatch(/skipped_paused,?\s*\n/) // med i return NextResponse.json({...})
  })
})
