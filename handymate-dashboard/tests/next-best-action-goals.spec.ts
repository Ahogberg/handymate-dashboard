/**
 * Facit för Next Best Action Engine — Company Goals-kontext
 * (lib/jarvis/next-best-action-goals.ts, backlog #11:s kvarvarande steg,
 * 2026-08-15). Ren funktion, ingen DB, inget nätverk:
 *
 *   npx playwright test tests/next-best-action-goals.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { buildGoalContextLine } from '../lib/jarvis/next-best-action-goals'

test.describe('buildGoalContextLine — bakgrundsfakta, aldrig en påhittad rankningsregel', () => {
  test('inget mål satt (null) ⇒ ingen rad alls, aldrig "0 kr"', () => {
    expect(buildGoalContextLine({ revenueTargetAnnualSek: null, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
  })

  test('mål satt till 0 eller negativt behandlas som osatt, inte som "nå 0 kr"', () => {
    expect(buildGoalContextLine({ revenueTargetAnnualSek: 0, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
    expect(buildGoalContextLine({ revenueTargetAnnualSek: -100, invoicedYtdSek: 500_000, todayIso: '2026-08-15' })).toBeNull()
  })

  test('beräknar takt-procent mot dagens andel av året, inte mot hela årsmålet', () => {
    // 2026-08-15 är dag 227 av 365 ⇒ förväntad takt = 1 200 000 * 227/365 ≈ 746 301 kr.
    // Fakturerat 800 000 kr ⇒ ~107% av förväntad takt.
    const line = buildGoalContextLine({
      revenueTargetAnnualSek: 1_200_000,
      invoicedYtdSek: 800_000,
      todayIso: '2026-08-15',
    })
    expect(line).not.toBeNull()
    expect(line).toMatch(/1[\s ]200[\s ]000 kr/)
    expect(line).toMatch(/800[\s ]000 kr/)
    expect(line).toContain('107%')
    expect(line).toContain('dag 227/365')
  })

  test('efter kalenderåret på ett skottår räknas 366 dagar, inte 365', () => {
    const line = buildGoalContextLine({
      revenueTargetAnnualSek: 366_000,
      invoicedYtdSek: 366_000,
      todayIso: '2028-12-31', // dag 366 av 366 på ett skottår
    })
    expect(line).toContain('dag 366/366')
    expect(line).toContain('100%')
  })

  test('rundar procenten till närmaste heltal, ingen decimal i texten', () => {
    const line = buildGoalContextLine({
      revenueTargetAnnualSek: 1_000_000,
      invoicedYtdSek: 333_333,
      todayIso: '2026-01-01', // dag 1/365, väldigt hög takt-procent
    })
    expect(line).toMatch(/\(\d+% av förväntad takt/)
    expect(line).not.toMatch(/\d+\.\d+%/)
  })

  test('etiketten "Årsmål" bär rätt kalenderår, härlett ur todayIso — inte hårdkodat', () => {
    const line = buildGoalContextLine({ revenueTargetAnnualSek: 500_000, invoicedYtdSek: 100_000, todayIso: '2031-03-01' })
    expect(line).toContain('Årsmål 2031:')
  })
})
