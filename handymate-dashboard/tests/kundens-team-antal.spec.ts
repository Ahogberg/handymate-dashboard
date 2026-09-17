import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { AI_KOLLEGOR, TEAM } from '../lib/agents/team'

/**
 * Fynd 2 ur UI-genomgången i 375 px (docs/ui/genomgang-375px-2026-09-17.md).
 *
 * Nya kundens sista onboardingsteg visade "6 på plats" bredvid
 * "AI-kollegor 7 i ditt team" — två tal för samma sak, tjugo pixlar från
 * varandra. Båda var tekniskt sanna (TEAM har sju poster, raden uteslöt
 * Matte) och därför var ingen av dem fel att rätta var för sig. Felet var
 * att det fanns två.
 *
 * Dessutom räknade båda `support` — Handymate Support är VÅR kundtjänst,
 * inte hantverkarens anställda — och "på plats" med grön prick var ett
 * ogrindat påstående om arbete på ett konto utan kopplade kanaler.
 */

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const utanKommentarer = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '')

test.describe('kundens team räknas på ett sätt', () => {
  test('AI_KOLLEGOR är TEAM utan vår egen kundtjänst', () => {
    expect(TEAM.some(a => a.id === 'support'), 'support ska finnas kvar i TEAM').toBe(true)
    expect(AI_KOLLEGOR.some(a => a.id === 'support'), 'support får inte räknas som kundens kollega').toBe(false)
    expect(AI_KOLLEGOR).toHaveLength(TEAM.length - 1)
    // Matte ingår — hon är chefsagenten kunden pratar med, inte en extern part.
    expect(AI_KOLLEGOR.some(a => a.id === 'matte')).toBe(true)
  })

  test('live-turen har EXAKT ett tal för teamets storlek', () => {
    const kod = utanKommentarer(read('app/onboarding/components/Step6LiveTour.tsx'))
    // Rutan bär numret…
    expect(kod).toContain("['AI-kollegor', String(AI_KOLLEGOR.length), 'i ditt team', true]")
    // …och ingen annan yta i filen säger ett antal om teamet.
    expect(kod, 'TEAM.length beskriver kunden igen').not.toContain('TEAM.length')
    expect(kod, '"N på plats" är tillbaka').not.toMatch(/\{teamRow\.length\}\s*på plats/)
    expect(kod, 'ett antal specialister konkurrerar med rutan').not.toMatch(/\{teamRow\.length\}/)
  })

  test('specialistraden visar kundens kollegor, inte vår support', () => {
    const kod = utanKommentarer(read('app/onboarding/components/Step6LiveTour.tsx'))
    expect(kod).toContain("const teamRow = AI_KOLLEGOR.filter(a => a.id !== 'matte')")
    // Raden är Matte + fem specialister; ändras uppsättningen ska det vara ett val.
    expect(AI_KOLLEGOR.filter(a => a.id !== 'matte')).toHaveLength(5)
  })

  test('teamrubriken bär ingen grön antalsbricka', () => {
    const kod = utanKommentarer(read('app/onboarding/components/Step6LiveTour.tsx'))
    // Brickan bredvid "Ditt AI-team idag" var både ett konkurrerande tal och
    // ett ogrindat påstående om arbete. Testet vaktar RUBRIKEN, inte varje
    // grön prick i filen: raden "AI-teamet är på plats" högre upp är ett eget
    // fynd (7 i genomgången) och ett eget beslut — den smyger inte tillbaka
    // hit genom att testet är luddigt.
    const rubrik = kod.slice(kod.indexOf('Ditt AI-team idag'))
    const block = rubrik.slice(0, rubrik.indexOf('</div>'))
    expect(block, 'antalsbrickan är tillbaka i teamrubriken').not.toMatch(/på plats/)
    expect(block).not.toContain('ob-green-600')
  })

  test('kundvänd text räknar inte heller support', () => {
    // Partnermaterialet säger "Sex AI-kollegor" — samma tal som
    // AI_KOLLEGOR.length. Faller det här: texten och listan har glidit isär.
    const ord = ['noll', 'en', 'två', 'tre', 'fyra', 'fem', 'sex', 'sju', 'åtta']
    expect(read('app/partners/material/leave-behind/page.tsx'))
      .toContain(`${ord[AI_KOLLEGOR.length].charAt(0).toUpperCase()}${ord[AI_KOLLEGOR.length].slice(1)} AI-kollegor`)
  })
})
