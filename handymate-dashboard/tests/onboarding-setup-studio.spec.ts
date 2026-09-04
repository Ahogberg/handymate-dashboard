import { expect, test } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { resolveSetupStudioMode } from '../lib/onboarding/setup-studio'

const ROOT = path.resolve(__dirname, '..')
const source = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('Setup Studio V1.5 — flaggad presentation ovanpå samma onboarding', () => {
  test('är av som standard och kräver den exakta publika flaggan', () => {
    expect(resolveSetupStudioMode(undefined, '', null)).toBe(false)
    expect(resolveSetupStudioMode('false', '', null)).toBe(false)
    expect(resolveSetupStudioMode('TRUE', '', null)).toBe(false)
    expect(resolveSetupStudioMode('true', '', null)).toBe(true)
  })

  test('klassisk fallback vinner alltid och kan kommas ihåg i sessionen', () => {
    expect(resolveSetupStudioMode('true', '?classic=1', null)).toBe(false)
    expect(resolveSetupStudioMode('true', '', 'classic')).toBe(false)
    expect(resolveSetupStudioMode('true', '?studio=1', 'classic')).toBe(true)
  })

  test('sidan återanvänder exakt samma nio steg i en enda rendergren', () => {
    const page = source('app/onboarding/page.tsx')
    expect(page).toContain('const TOTAL_STEPS = 9')
    expect(page).toContain('<SetupStudioShell')
    expect(page).toContain('{onboardingStep}')

    for (const component of [
      'Step1MeetTheTeam',
      'Step2Business',
      'Step3HowYouWork',
      'Step4PhoneNumber',
      'StepImportData',
      'StepGenomgang',
      'Step5Activate',
      'StepProductRegister',
      'Step6LiveTour',
    ]) {
      expect(page.match(new RegExp(`<${component}\\b`, 'g'))?.length).toBe(1)
    }
  })

  test('Studio-skalet är endast presentation — inga egna API- eller AI-anrop', () => {
    const shell = source('components/onboarding/SetupStudioShell.tsx')
    expect(shell).toContain('Byt till klassisk guide')
    expect(shell).toContain('Det här har teamet lärt sig')
    expect(shell).not.toContain('fetch(')
    expect(shell).not.toMatch(/anthropic|openai|generateText|messages\.create/i)
  })

  test('kvittot visar bara det teamet lärt sig HÄR — inte vad som redan låg på kontot', () => {
    // Fyndet 2026-09-04: på demokontot stod "Företag: Bee Service AB",
    // "Huvudbransch vald" och "Standardpris: 500 kr/tim" bockade på steg 2,
    // innan kunden skrivit ett tecken — kvittot bockade av den ÅTERSTÄLLDA
    // datan. Rubriken lovar något annat, och ett kvitto som bockar av sådant
    // kunden inte gjort är precis den sortens påstående utan täckning som
    // resten av produkten är byggd för att undvika.
    const shell = source('components/onboarding/SetupStudioShell.tsx')
    expect(shell).toContain('const redanPaPlats = useRef<Set<string> | null>(null)')
    // Ögonblicksbilden tas EN gång och listan är differensen mot den.
    expect(shell).toMatch(/if \(redanPaPlats\.current === null\) redanPaPlats\.current = new Set\(configured\)/)
    expect(shell).toContain('const larda = configured.filter(fakta => !redanPaPlats.current!.has(fakta))')
    // Det är differensen som renderas, aldrig hela listan.
    expect(shell).toContain('{larda.slice(-5).map(fact => (')
    expect(shell).not.toMatch(/\{configured\.slice\(-5\)/)
  })

  test('publik flagga, omedelbar fallback och rörelsereducering är uttryckliga', () => {
    const page = source('app/onboarding/page.tsx')
    const css = source('app/onboarding/onboarding.css')
    expect(page).toContain('process.env.NEXT_PUBLIC_SETUP_STUDIO_ENABLED')
    expect(page).toContain("writeSetupStudioPreference('classic')")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.setup-studio')
  })
})
