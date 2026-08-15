/**
 * Facit för den delade omsättningstakt-matematiken
 * (lib/economy/revenue-pace.ts). Extraherad ur next-best-action-goals.ts
 * (2026-08-15) så både NBA:s LLM-kontext och en mänsklig UI-yta
 * (MalBlock.tsx) räknar på EXAKT samma sätt — aldrig två separata
 * implementationer av samma takt-formel.
 *
 *   npx playwright test tests/revenue-pace.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { computeRevenuePace } from '../lib/economy/revenue-pace'

test.describe('computeRevenuePace — bakgrundsfakta, aldrig en påhittad rankningsregel', () => {
  test('inget mål satt (null) ⇒ null, aldrig "0 kr"', () => {
    expect(computeRevenuePace({ revenueTargetAnnualSek: null, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
  })

  test('mål satt till 0 eller negativt behandlas som osatt', () => {
    expect(computeRevenuePace({ revenueTargetAnnualSek: 0, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
    expect(computeRevenuePace({ revenueTargetAnnualSek: -100, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
  })

  test('beräknar takt mot dagens andel av året, inte mot hela årsmålet', () => {
    // 2026-08-15 är dag 227 av 365 ⇒ förväntad takt = 1 200 000 * 227/365 ≈ 746 301 kr.
    // Fakturerat 800 000 kr ⇒ ~107% av förväntad takt.
    const pace = computeRevenuePace({ revenueTargetAnnualSek: 1_200_000, invoicedYtdSek: 800_000, todayIso: '2026-08-15' })
    expect(pace).not.toBeNull()
    expect(pace!.year).toBe(2026)
    expect(pace!.day).toBe(227)
    expect(pace!.daysInYear).toBe(365)
    expect(Math.round(pace!.paceTargetSek)).toBe(746_301)
    expect(pace!.pacePct).toBe(107)
  })

  test('skottår räknar 366 dagar, inte 365', () => {
    const pace = computeRevenuePace({ revenueTargetAnnualSek: 366_000, invoicedYtdSek: 366_000, todayIso: '2028-12-31' })
    expect(pace!.day).toBe(366)
    expect(pace!.daysInYear).toBe(366)
    expect(pace!.pacePct).toBe(100)
  })

  test('noll fakturerat hittills ger 0% takt, ingen division-krasch', () => {
    const pace = computeRevenuePace({ revenueTargetAnnualSek: 500_000, invoicedYtdSek: 0, todayIso: '2026-03-01' })
    expect(pace!.pacePct).toBe(0)
  })
})
