/**
 * Facit för målfrågorna (2026-08-15, backlog #11) — OMSKRIVET 2026-08-27
 * (Lager 3 / B6): onboardingen frågar inte längre efter årsomsättning och
 * marginalmål. De sätts i Inställningar → Ekonomi (kolumnerna finns kvar
 * och är vitlistade). I stället frågar steg 2 "Vad vill du att teamet
 * hjälper dig med först?" — fem knappar, frivilligt, i onboarding_data.
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
const settings = read('app/dashboard/settings/page.tsx')

test.describe('ALLOWED_COLUMNS-vitlistan — den tysta fällan (P0-liknande, samma kodkommentar varnar)', () => {
  test('revenue_target_annual_sek och margin_target_percent är fortfarande vitlistade (Inställningar skriver dem)', () => {
    expect(onboardingRoute).toContain("'revenue_target_annual_sek'")
    expect(onboardingRoute).toContain("'margin_target_percent'")
  })
})

test.describe('page.tsx — årsmålet skrivs inte längre från onboardingen', () => {
  test('steg 2 skriver varken revenue_target_annual_sek eller margin_target_percent', () => {
    const grenStart = onboardingPage.indexOf('if (step === 2)')
    const grenSlut = onboardingPage.indexOf('if (step === 3', grenStart)
    const gren = onboardingPage.slice(grenStart, grenSlut)
    expect(gren).not.toContain('config.revenue_target_annual_sek')
    expect(gren).not.toContain('config.margin_target_percent')
    // Fokuset följer med i onboarding_data via formulärdatat — ingen egen kolumn
    expect(onboardingPage).toContain('await saveProgress(newStep, sanitizeForSave(data), config)')
  })
})

test.describe('Step3HowYouWork — "Vad vill du att teamet hjälper dig med först?"', () => {
  test('fem knappar ur FIRST_FOCUS_OPTIONS, växlar av vid omklick, frivilligt', () => {
    expect(step3).toContain("import { FIRST_FOCUS_OPTIONS } from '@/lib/onboarding/first-focus'")
    expect(step3).toContain('Vad vill du att teamet hjälper dig med först? (frivilligt)')
    expect(step3).toContain('{FIRST_FOCUS_OPTIONS.map(o => (')
    expect(step3).toContain("update({ firstFocus: firstFocus === o.id ? undefined : o.id })")
    expect(step3).toContain('Vet du inte än — hoppa över')
  })

  test('årsmålsfälten är borta ur steg 2', () => {
    expect(step3).not.toContain('revenueTargetAnnual')
    expect(step3).not.toContain('marginTargetPercent')
    expect(step3).not.toContain('Mål för i år')
  })
})

test.describe('typer och hemvist', () => {
  test('OnboardingFormData har firstFocus, inte längre målfälten', () => {
    expect(types).toContain('firstFocus?: FirstFocusId')
    expect(types).not.toContain('revenueTargetAnnual?: number')
  })

  test('årsmålet bor kvar i Inställningar → Ekonomi', () => {
    expect(settings).toContain('revenue_target_annual_sek')
  })
})
