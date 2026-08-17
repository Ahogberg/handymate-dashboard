/**
 * FACIT — lib/mission/progress-parts.ts (Etapp E: Hero-integrationen,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Extraherad ur components/jarvis/home/Uppdragsrad.tsx när MatteHero tog
 * över det aktiva uppdragets huvudbudskap (rubrik + statistik) — samma rena
 * progressParts-funktion behövs nu av heron. EN sträng per klass-fakta,
 * ALDRIG en klassöverskridande siffra: se mission-truth-guard.spec.ts för
 * den bredare vaktposten.
 *
 * Körs: npx playwright test tests/progress-parts.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { progressParts } from '../lib/mission/progress-parts'
import type { MissionProgress } from '../lib/mission/mission-progress'

function progress(overrides: Partial<MissionProgress> = {}): MissionProgress {
  return {
    per_class: {},
    decisions_outstanding: 0,
    is_expired: false,
    gap_kr: 0,
    ...overrides,
  }
}

test.describe('progressParts — en sträng per klass-fakta', () => {
  test('inga klasser, inget gap, inga beslut → bara "inget väntar"-raden', () => {
    expect(progressParts(progress())).toEqual(['inget väntar på dig just nu'])
  })

  test('verifierat betalt i en klass ger en egen rad', () => {
    const p = progress({
      per_class: { indrivningsbart: { verified_paid_kr: 12000, invoiced_kr: 12000, moved_count: 0, step_count: 1 } },
    })
    expect(progressParts(p)).toContain(`${(12000).toLocaleString('sv-SE')} kr verifierat betalt`)
  })

  test('fakturerat utöver betalt ger en egen rad (delmängd, aldrig hopslaget)', () => {
    const p = progress({
      per_class: { faktureringsklart: { verified_paid_kr: 5000, invoiced_kr: 18000, moved_count: 0, step_count: 1 } },
    })
    const parts = progressParts(p)
    expect(parts).toContain(`${(5000).toLocaleString('sv-SE')} kr verifierat betalt`)
    expect(parts).toContain(`${(18000).toLocaleString('sv-SE')} kr fakturerat`)
  })

  test('två kr-klasser (40 000 + 32 000 betalt) redovisas som två separata rader, aldrig "72 000"', () => {
    const p = progress({
      per_class: {
        indrivningsbart: { verified_paid_kr: 40000, invoiced_kr: 40000, moved_count: 0, step_count: 1 },
        faktureringsklart: { verified_paid_kr: 32000, invoiced_kr: 32000, moved_count: 0, step_count: 1 },
      },
    })
    const parts = progressParts(p)
    expect(parts).toContain(`${(40000).toLocaleString('sv-SE')} kr verifierat betalt`)
    expect(parts).toContain(`${(32000).toLocaleString('sv-SE')} kr verifierat betalt`)
    expect(parts.join(' · ')).not.toContain(`${(72000).toLocaleString('sv-SE')}`)
  })

  test('gap_kr > 0 → "kr kvar till målet"', () => {
    expect(progressParts(progress({ gap_kr: 8000 }))).toContain(`${(8000).toLocaleString('sv-SE')} kr kvar till målet`)
  })

  test('gap_kr === 0 men något verifierat betalt → "målet nått"', () => {
    const p = progress({
      gap_kr: 0,
      per_class: { indrivningsbart: { verified_paid_kr: 5000, invoiced_kr: 5000, moved_count: 0, step_count: 1 } },
    })
    expect(progressParts(p)).toContain('målet nått')
  })

  test('gap_kr === 0 och inget verifierat betalt → varken "kvar till målet" eller "målet nått"', () => {
    const parts = progressParts(progress({ gap_kr: 0 }))
    expect(parts.some(p => p.includes('kvar till målet'))).toBe(false)
    expect(parts.some(p => p.includes('målet nått'))).toBe(false)
  })

  test('decisions_outstanding > 0 → "N beslut återstår"', () => {
    expect(progressParts(progress({ decisions_outstanding: 2 }))).toContain('2 beslut återstår')
  })

  test('decisions_outstanding === 0 → "inget väntar på dig just nu"', () => {
    expect(progressParts(progress({ decisions_outstanding: 0 }))).toContain('inget väntar på dig just nu')
  })
})

test.describe('källskanning — progress-parts.ts lägger aldrig ihop klassbelopp', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'lib', 'mission', 'progress-parts.ts'), 'utf8')

  test('ingen reduce( över klassbelopp', () => {
    expect(src).not.toContain('reduce(')
  })

  test('inga bannade hopslagna kronfält (samma namn som mission-truth-guard.spec.ts)', () => {
    for (const banned of ['totalKr', 'grandTotal', 'total_kr']) {
      expect(src.includes(banned), `progress-parts.ts innehåller "${banned}"`).toBe(false)
    }
  })
})
