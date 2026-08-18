/**
 * Facit för Analys & Ekonomi-sidans strukturlyft mot Command Center-språket
 * (Etapp L2b2, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md).
 *
 * Ren visuell reskin — ZERO nya beräkningar/summeringar, ZERO ändrad
 * data/handlers. Testet är därför ett käll-scan (samma idiom som
 * tests/bookings-page-design.spec.ts), inte ett DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/analytics-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/analytics/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Analys & Ekonomi — strukturlyft', () => {
  test('sidbakgrunden matchar huset (#F8FAFC) — inte längre bg-gray-50', () => {
    expect(source).not.toContain('min-h-screen bg-gray-50')
    expect(source).toContain('min-h-screen bg-[#F8FAFC]')
  })

  test('ljust sidhuvud i approvals anda — ikon-platta + font-heading-titel', () => {
    expect(source).toContain('bg-primary-100 rounded-xl flex items-center justify-center shrink-0')
    expect(source).toContain('font-heading text-xl sm:text-2xl font-bold text-slate-900')
  })

  test('de mörk-era-eyebrow-sektionsrubrikerna (Ekonomi/Försäljningsinsikter) är font-heading nu, inte gray-400', () => {
    expect(source).not.toContain('text-sm font-semibold text-gray-400 uppercase tracking-wider')
    expect(source).toContain('font-heading text-sm font-bold text-slate-700 uppercase tracking-wide')
  })

  test('gray-400-bruset är kraftigt neddraget — brödtext till gray-600/700', () => {
    const grey400 = source.match(/text-gray-400/g) || []
    // Baslinjen var 31 st. Kvar ska bara vara ett fåtal genuint dekorativa
    // fall (t.ex. tomma "-"-platshållare) — långt under hälften.
    expect(grey400.length).toBeLessThanOrEqual(6)
  })

  test('fotnoten är läsbar — inte längre osynlig text-gray-300', () => {
    expect(source).not.toContain('text-gray-300')
  })

  test('ingen lila rest kvar — Zap-ikonen på Svarstid-kortet är inte purple', () => {
    expect(source).not.toContain('bg-purple-100')
    expect(source).not.toContain('text-purple-600')
  })

  test('sektionerna har rounded-card-inramning — samma antal som innan (13), bara upplyfta', () => {
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBe(13)
    expect(source).not.toContain('rounded-xl border border-[#E2E8F0]')
  })

  test('inga nya beräkningar/summeringar — samma datakällor och fetch-anrop som innan', () => {
    expect(source).toContain('fetch(`/api/analytics/speed-to-lead?period=${period}&business_id=${business.business_id}`)')
    expect(source).toContain('fetch(`/api/analytics/win-loss?period=${period}&business_id=${business.business_id}`)')
    expect(source).toContain('fetch(`/api/analytics/insights?business_id=${business.business_id}`)')
    expect(source).toContain('fetch(`/api/analytics/economics?business_id=${business.business_id}`)')
    expect(source).toContain("fetch(`/api/analytics/job-types`)")
    const fetchCalls = source.match(/fetch\(`\/api\/analytics/g) || []
    expect(fetchCalls.length).toBe(5)
  })

  test('period-väljaren (onChange) är oförändrad', () => {
    expect(source).toContain('onChange={e => setPeriod(e.target.value)}')
  })

  test('ingen mörk hero läggs till — Analys & Ekonomi är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
