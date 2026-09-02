/**
 * Kommersiellt facit — kundytorna får formulera nyttan olika men aldrig
 * bära egna planbelopp eller volymgränser.
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  FOUNDERS_GUARANTEE_DAYS,
  STANDARD_GUARANTEE_DAYS,
  getPlanCommercialFacts,
} from '../lib/feature-gates'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

test.describe('en kanonisk prissanning', () => {
  test('Firman har den publicerade planens pris och volymer', () => {
    expect(getPlanCommercialFacts('professional')).toEqual({
      id: 'professional',
      label: 'Firman',
      monthlyPriceSek: 5995,
      yearlyPriceSek: 59950,
      smsPerMonth: 300,
      smsHardCap: 1000,
      callsPerMonth: 400,
      // Firmans användartak togs bort 2026-09-01 (2a6eda7) — differentiering bara på volym.
      users: null,
    })
  })

  test('Storfirman har den publicerade planens pris och volymer', () => {
    expect(getPlanCommercialFacts('business')).toEqual({
      id: 'business',
      label: 'Storfirman',
      monthlyPriceSek: 11995,
      yearlyPriceSek: 119950,
      smsPerMonth: 1000,
      smsHardCap: 5000,
      callsPerMonth: null,
      users: null,
    })
  })

  test('garantin har två uttryckliga nivåer', () => {
    expect(STANDARD_GUARANTEE_DAYS).toBe(30)
    expect(FOUNDERS_GUARANTEE_DAYS).toBe(90)
  })

  for (const file of [
    'app/onboarding/components/Step5Activate.tsx',
    'app/dashboard/settings/billing/page.tsx',
  ]) {
    test(`${file} läser planfakta och garantitid centralt`, () => {
      const s = read(file)
      expect(s).toContain('getPlanCommercialFacts')
      expect(s).toContain('STANDARD_GUARANTEE_DAYS')
      expect(s).toContain('FOUNDERS_GUARANTEE_DAYS')
      expect(s).not.toContain('users: 10')
    })
  }
})

test.describe('Matte presenteras konsekvent', () => {
  const customerFacingFiles = [
    'lib/agents/team.ts',
    'lib/agents/personalities.ts',
    'lib/agent/capabilities.ts',
    'components/MatteChatModal.tsx',
    'app/onboarding/components/Step6LiveTour.tsx',
  ]

  test('kundytorna säger Chefsagent, aldrig Chefsassistent', () => {
    for (const file of customerFacingFiles) {
      const s = read(file)
      expect(s, file).toMatch(/chefsagent/i)
      expect(s, file).not.toMatch(/chefsassistent/i)
    }
  })
})

test.describe('resultatlandningarna är riktiga publika routes', () => {
  for (const route of ['hitta-pengar', 'skydda-marginalen', 'slipp-administrationen']) {
    test(`/${route} finns, har metadata och en köp-CTA`, () => {
      const s = read(`app/${route}/page.tsx`)
      expect(s).toContain('export const metadata')
      expect(s).toContain('OutcomeLandingPage')
      expect(s).toContain('primaryCta')
    })
  }

  test('sitemapen publicerar alla tre', () => {
    const s = read('app/sitemap.ts')
    for (const route of ['hitta-pengar', 'skydda-marginalen', 'slipp-administrationen']) {
      expect(s).toContain(`/${route}`)
    }
  })

  test('ingen landning påstår att Lisa är en fri talande röstagent', () => {
    const all = ['hitta-pengar', 'skydda-marginalen', 'slipp-administrationen']
      .map(route => read(`app/${route}/page.tsx`))
      .join('\n')
    expect(all).not.toMatch(/svarar i telefon|pratar med kunden i telefon|röstagent/i)
    expect(all).toContain('återkopplar Lisa via SMS')
  })
})

test.describe('äldre köp- och jämförelsecopy får inte återinföra gamla löften', () => {
  test('onboardingchatten bygger planrader från kanoniska fakta', () => {
    const s = read('app/api/onboarding/chat/route.ts')
    expect(s).toContain('getPlanCommercialFacts')
    expect(s).toContain('planRow(starterFacts)')
    expect(s).not.toContain('14 dagars gratis provperiod')
    expect(s).not.toContain('AI-telefonassistent som svarar och bokar')
  })

  test('jämförelsesidan säljer publik Firman-prissättning och den verkliga Lisa-kedjan', () => {
    const s = read('app/jamfor/page.tsx')
    expect(s).toContain("getPlanCommercialFacts('professional')")
    expect(s).toContain('Lisa fångar missade samtal och återkopplar via SMS')
    expect(s).not.toContain('14 dagars gratis test')
    expect(s).not.toContain("price: '2 495'")
  })
})
