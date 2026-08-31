/**
 * Vaktpost mot logotypbuggen (rotorsak 2026-08-06).
 *
 * Pilotkunden Bee hade sin logotyp inlagd men den syntes aldrig på offerter.
 * Orsaken var att fyra klient-selecter mot business_config begärde kolumnen
 * `vat_number`, som ingen migration skapar. PostgREST 400:ar HELA frågan när
 * en kolumn saknas → businessConfig blev null → logoUrl blev null.
 *
 * Det avgörande: commit 69b4bc5b, som SKULLE laga loggan, la in `logo_url` och
 * `vat_number` i samma select. Fixen kunde aldrig fungera — och mönstret
 * kopierades sedan till tre filer till.
 *
 * Testet låser fast att dashboardens klient-ytor läser business_config med
 * `select('*')`. En kolumnlista där är en tickande bomb: varje fält någon
 * lägger till i förhoppning om att det finns kan tysta HELA dokumenthuvudet.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/business-config-select.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { QUOTE_SURFACE_BUSINESS_SELECT } from '../lib/business/quote-surface-select'

const ROOT = path.resolve(__dirname, '..')

/** Klient-ytor ('use client') som läser business_config direkt via anon-nyckeln.
 *  FAS 1+2 (offert-omtaget, 2026-08-31): new/page.tsx och [id]/edit/page.tsx
 *  är båda tunna wrappers (QuoteBuilder mode="create"/"edit") — läsningen
 *  bor bara i den delade orkestratorn. */
const CLIENT_SURFACES = [
  'app/dashboard/quotes/_shared/QuoteBuilder.tsx',
  'app/dashboard/quotes/[id]/page.tsx',
  'app/dashboard/invoices/_shared/InvoiceEditor.tsx',
]

function read(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8')
}

test.describe('business_config-läsning från webbläsaren', () => {
  test('konstanten är * — en kolumnlista kan inte 400:a', () => {
    expect(QUOTE_SURFACE_BUSINESS_SELECT).toBe('*')
  })

  test('alla offert- och fakturaytor använder den delade konstanten', () => {
    for (const file of CLIENT_SURFACES) {
      const source = read(file)
      expect(source, `${file} importerar inte den delade konstanten`).toContain(
        'QUOTE_SURFACE_BUSINESS_SELECT',
      )
    }
  })

  test('ingen av ytorna har en hårdkodad kolumnlista mot business_config', () => {
    // Fångar `.from('business_config').select('kolumn, kolumn, ...')` oavsett
    // radbrytningar mellan anropen.
    const pattern = /\.from\(\s*'business_config'\s*\)[\s\S]{0,120}?\.select\(\s*(['"`])([^'"`]*)\1/g

    for (const file of CLIENT_SURFACES) {
      const source = read(file)
      for (const match of Array.from(source.matchAll(pattern))) {
        const selectArg = match[2]
        expect(
          selectArg,
          `${file} har en hårdkodad kolumnlista mot business_config: "${selectArg}". ` +
            'Använd QUOTE_SURFACE_BUSINESS_SELECT — en saknad kolumn tystar hela dokumenthuvudet.',
        ).toBe('*')
      }
    }
  })

  test('vat_number begärs inte längre från klienten — kolumnen finns inte i sql/', () => {
    for (const file of CLIENT_SURFACES) {
      const source = read(file)
      // Fältet får läsas ur svaret (cfg.vat_number) men aldrig BEGÄRAS i en select.
      const selectLines = source
        .split('\n')
        .filter(line => line.includes('.select(') && line.includes('vat_number'))
      expect(selectLines, `${file} begär vat_number i en select`).toEqual([])
    }
  })

  test('felet loggas — tystnaden var halva buggen', () => {
    for (const file of CLIENT_SURFACES) {
      expect(read(file), `${file} loggar inte fel från business_config-läsningen`).toContain(
        'logBusinessConfigError',
      )
    }
  })
})
