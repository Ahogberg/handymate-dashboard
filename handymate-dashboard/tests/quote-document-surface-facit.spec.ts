/**
 * Facit-spec (Del 3, offertytan 2026-09-01) — "dokumentet ÄR ytan".
 *
 * Del 3 tog bort Live/Slutdesign-flikarna och den kollapsbara
 * "Förhandsgranska"-panelen: offerten renderas alltid, direkt i huvudytan
 * (QuoteDocumentSurface.tsx, InvoiceEditor-precedenten). Det här provet
 * låser tre invarianter från den commiten (husets källskannings-stil, se
 * tests/quote-builder-single-cta-surface.spec.ts — ingen mount/render):
 *
 *   1. Grep-gaten som bestående invariant: flik-UI:ts identifierare får
 *      inte smyga tillbaka någonstans under app/dashboard/quotes/.
 *   2. Iframe-grenens mobilhöjdfix: BÅDA max-lg-klasserna krävs — var och
 *      en ensam är otillräcklig.
 *   3. Fullskärmsknappens hidden lg:-gate (mobil-överlappsmotiveringen).
 *
 *   npx playwright test tests/quote-document-surface-facit.spec.ts --no-deps
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const QUOTES_DIR = path.join(__dirname, '..', 'app', 'dashboard', 'quotes')
const SURFACE_PATH = path.join(QUOTES_DIR, '_shared', 'QuoteDocumentSurface.tsx')
const SURFACE = fs.readFileSync(SURFACE_PATH, 'utf8')

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name)
    return entry.isDirectory() ? walk(full) : [full]
  })
}

// Strängarna byggs med join('') så den här specen aldrig matchar SIG SJÄLV
// om skanningen någonsin breddas till att omfatta tests/ — idag ligger den
// utanför det skannade trädet (app/dashboard/quotes/), men bältet är gratis.
const FORBIDDEN = [
  ['preview', 'Mode'].join(''),
  ['setShow', 'Preview', 'Panel'].join(''),
  ['Quote', 'Preview', 'Panel'].join(''),
  ['Slut', 'design'].join(''),
]

test.describe('Grep-gaten som invariant — flik-UI:t får inte smyga tillbaka', () => {
  test('ingen fil under app/dashboard/quotes/ innehåller någon av de fyra borttagna strängarna', () => {
    const files = walk(QUOTES_DIR)
    expect(files.length, 'skanningsroten är tom — har quotes-trädet flyttat?').toBeGreaterThan(0)
    for (const file of files) {
      const src = fs.readFileSync(file, 'utf8')
      for (const needle of FORBIDDEN) {
        expect(
          src.includes(needle),
          `${path.relative(QUOTES_DIR, file)} innehåller "${needle}" — Live/Slutdesign-flik-UI:t ` +
            'togs bort i Del 3 (offertytan): dokumentet ÄR ytan, ingen flikväxling eller panelstate får återinföras',
        ).toBe(false)
      }
    }
  })
})

test.describe('Iframe-grenens mobilhöjd (Premium/Friendly under lg)', () => {
  test('TemplatePreviewFrame-anropet i QuoteDocumentSurface.tsx bär BÅDA max-lg-klasserna', () => {
    // Under lg saknar sticky-wrappern höjd (lg:h-[calc(...)] gäller inte) —
    // flex-1 i en auto-höjdskolumn löses då till 0px. Klasserna är ett PAR:
    // utan max-lg:flex-none vinner flex-1 över aspect-ration i huvudaxeln
    // (höjden) och nollar den; utan max-lg:aspect-[210/297] finns ingen
    // höjdkälla alls. Var och en ensam ger en osynlig iframe på mobil.
    const start = SURFACE.indexOf('<TemplatePreviewFrame')
    expect(start, 'TemplatePreviewFrame monteras inte längre i QuoteDocumentSurface.tsx').toBeGreaterThan(-1)
    const end = SURFACE.indexOf('/>', start)
    expect(end, 'hittade inte anropets slut').toBeGreaterThan(start)
    const call = SURFACE.slice(start, end)
    expect(call, 'max-lg:flex-none saknas — flex-1 nollar iframehöjden under lg').toContain('max-lg:flex-none')
    expect(call, 'max-lg:aspect-[210/297] saknas — ingen höjdkälla under lg').toContain('max-lg:aspect-[210/297]')
  })
})

test.describe('Fullskärmsknappen är desktop-only', () => {
  test('Maximera-knappen behåller sin hidden lg:-gate', () => {
    // På mobil ligger den skalade A4:an mot ytans högerkant — en absolut
    // positionerad knapp i hörnet hade överlappat dokumentinnehållet.
    // Medvetet beslut i Del 3: fullskärm är en desktop-affordans.
    const idx = SURFACE.indexOf('aria-label="Maximera"')
    expect(idx, 'Maximera-knappen hittades inte i QuoteDocumentSurface.tsx').toBeGreaterThan(-1)
    const btnStart = SURFACE.lastIndexOf('<button', idx)
    const btnEnd = SURFACE.indexOf('>', idx)
    const tag = SURFACE.slice(btnStart, btnEnd)
    expect(
      tag,
      'fullskärmsknappen har tappat "hidden lg:inline-flex" — på mobil överlappar den den skalade A4:an',
    ).toContain('hidden lg:inline-flex')
  })
})
