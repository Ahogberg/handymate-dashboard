/**
 * Facit för Mål-frågorna i onboarding (2026-08-15, backlog #11).
 * Källskanning, browserlöst, samma stil som tests/goal-driven-margin.spec.ts.
 *
 *   npx playwright test tests/onboarding-goals.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const onboardingRoute = read('app/api/onboarding/route.ts')
const onboardingPage = read('app/onboarding/page.tsx')
const step3 = read('app/onboarding/components/Step3HowYouWork.tsx')
const types = read('app/onboarding/types-redesign.ts')

test.describe('ALLOWED_COLUMNS-vitlistan — den tysta fällan (P0-liknande, samma kodkommentar varnar)', () => {
  test('revenue_target_annual_sek och margin_target_percent är vitlistade', () => {
    expect(onboardingRoute).toContain("'revenue_target_annual_sek'")
    expect(onboardingRoute).toContain("'margin_target_percent'")
  })
})

test.describe('page.tsx — mål skrivs bara när de faktiskt besvarats', () => {
  test('revenueTargetAnnual skrivs villkorat, aldrig ovillkorat 0/null', () => {
    const grenStart = onboardingPage.indexOf('if (step === 2)')
    const villkor = onboardingPage.indexOf("typeof data.revenueTargetAnnual === 'number'", grenStart)
    expect(villkor, 'revenueTargetAnnual skrivs aldrig villkorat').toBeGreaterThan(grenStart)
    const tilldelning = onboardingPage.indexOf('config.revenue_target_annual_sek = data.revenueTargetAnnual', villkor)
    expect(tilldelning).toBeGreaterThan(villkor)
  })

  test('marginTargetPercent skrivs villkorat, aldrig ovillkorat 0/null', () => {
    const grenStart = onboardingPage.indexOf('if (step === 2)')
    const villkor = onboardingPage.indexOf("typeof data.marginTargetPercent === 'number'", grenStart)
    expect(villkor, 'marginTargetPercent skrivs aldrig villkorat').toBeGreaterThan(grenStart)
  })
})

test.describe('Step3HowYouWork — frivilligt, samma "hoppa över"-disciplin som intern timkostnad', () => {
  test('båda fälten finns och är kopplade till update()', () => {
    expect(step3).toContain('revenueTargetAnnual: raw === \'\' ? undefined')
    expect(step3).toContain('marginTargetPercent: raw === \'\' ? undefined')
  })

  test('hjälptexten säger uttryckligen att man kan hoppa över', () => {
    const malSektion = step3.indexOf('Mål för i år (frivilligt)')
    expect(malSektion).toBeGreaterThan(-1)
    const hoppaText = step3.indexOf('Vet du inte exakt — hoppa över', malSektion)
    expect(hoppaText, 'mål-sektionen saknar hoppa-över-texten').toBeGreaterThan(malSektion)
  })

  test('marginTargetPercent klampas till [0,100] i UI:et', () => {
    expect(step3).toContain('Math.min(100, Math.max(0, Number(raw)))')
  })
})

test.describe('OnboardingFormData — typerna finns', () => {
  test('revenueTargetAnnual och marginTargetPercent är optional numbers', () => {
    expect(types).toContain('revenueTargetAnnual?: number')
    expect(types).toContain('marginTargetPercent?: number')
  })
})
