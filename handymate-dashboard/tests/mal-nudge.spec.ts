/**
 * Facit för Mål-nudgen (2026-08-15, backlog #11) — de befintliga 22
 * kontona som onboardat FÖRE den här sessionens onboarding-tillägg får
 * annars aldrig se att omsättningsmål finns. Källskanning, browserlöst.
 *
 *   npx playwright test tests/mal-nudge.spec.ts --no-deps --project=chromium
 */
import fs from 'fs'
import path from 'path'
import { test, expect } from '@playwright/test'

const ROOT = path.resolve(__dirname, '..')
const read = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

const nudge = read('components/jarvis/MalNudge.tsx')
const jarvisHome = read('components/jarvis/JarvisHome.tsx')

test.describe('MalNudge — fail-soft, ingen falsk nudge', () => {
  test('visas bara när revenueTargetSet är BEVISAT false — inte vid laddning eller fel', () => {
    expect(nudge).toContain('revenueTargetSet !== false')
  })

  test('läsfel loggas men visar aldrig nudgen felaktigt', () => {
    const felgren = nudge.indexOf('if (error || !data)')
    expect(felgren).toBeGreaterThan(-1)
    // Felgrenen sätter INTE revenueTargetSet till false (som skulle trigga en falsk nudge).
    const nastaBlock = nudge.indexOf('setRevenueTargetSet(', felgren)
    const returnStatement = nudge.indexOf('return', felgren)
    expect(returnStatement, 'felgrenen sätter revenueTargetSet i stället för att returnera tidigt').toBeLessThan(nastaBlock)
  })

  test('tenant-filtrerad läsning', () => {
    expect(nudge).toContain("eq('business_id', business.business_id)")
  })

  test('avvisning är per-företag i localStorage, inte global eller databas-persisterad', () => {
    expect(nudge).toContain('DISMISS_KEY_PREFIX + business.business_id')
  })

  test('länkar till Inställningar → Ekonomi-fliken', () => {
    expect(nudge).toContain('/dashboard/settings?tab=economics')
  })
})

test.describe('MalNudge är monterad i JarvisHome', () => {
  test('importeras och renderas i systemnivå-zonen, före ProjektCaseKort', () => {
    expect(jarvisHome).toContain("import { MalNudge } from '@/components/jarvis/MalNudge'")
    const nudgeRender = jarvisHome.indexOf('<MalNudge />')
    const caseKort = jarvisHome.indexOf('<ProjektCaseKort')
    expect(nudgeRender).toBeGreaterThan(-1)
    expect(nudgeRender).toBeLessThan(caseKort)
  })
})
