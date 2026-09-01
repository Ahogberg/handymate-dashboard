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

  test('sidan återanvänder exakt samma åtta steg i en enda rendergren', () => {
    const page = source('app/onboarding/page.tsx')
    expect(page).toContain('const TOTAL_STEPS = 8')
    expect(page).toContain('<SetupStudioShell')
    expect(page).toContain('{onboardingStep}')

    for (const component of [
      'Step1MeetTheTeam',
      'Step2Business',
      'Step3HowYouWork',
      'Step4PhoneNumber',
      'Step5Activate',
      'StepImportData',
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

  test('publik flagga, omedelbar fallback och rörelsereducering är uttryckliga', () => {
    const page = source('app/onboarding/page.tsx')
    const css = source('app/onboarding/onboarding.css')
    expect(page).toContain('process.env.NEXT_PUBLIC_SETUP_STUDIO_ENABLED')
    expect(page).toContain("writeSetupStudioPreference('classic')")
    expect(css).toContain('@media (prefers-reduced-motion: reduce)')
    expect(css).toContain('.setup-studio')
  })
})
