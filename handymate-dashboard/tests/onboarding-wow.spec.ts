import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { deriveFirstAssignmentOptions } from '../lib/onboarding/first-assignment-options'
import { normalizeStandardHourlyRate } from '../lib/onboarding/pricing-start'

const ROOT = path.resolve(__dirname, '..')
const source = (relative: string) => fs.readFileSync(path.join(ROOT, relative), 'utf8')

test.describe('Onboardingens prisstart — företagets sanning, aldrig Handymates gissning', () => {
  test('ett frivilligt standardpris normaliseras fail-closed', () => {
    expect(normalizeStandardHourlyRate(undefined)).toBeNull()
    expect(normalizeStandardHourlyRate(null)).toBeNull()
    expect(normalizeStandardHourlyRate('')).toBeNull()
    expect(normalizeStandardHourlyRate(0)).toBeNull()
    expect(normalizeStandardHourlyRate(-50)).toBeNull()
    expect(normalizeStandardHourlyRate('825')).toBe(825)
    expect(normalizeStandardHourlyRate(825.4)).toBe(825.4)
  })

  test('steg 3 frågar hur arbetet prissätts och förklarar standardpriset som fallback', () => {
    const step = source('app/onboarding/components/Step3HowYouWork.tsx')
    expect(step).toContain('Hur brukar ni prissätta arbetet?')
    expect(step).toContain('Olika pris beroende på jobbtyp')
    expect(step).toContain('används när jobbtypen saknar ett eget pris')
    expect(step).not.toContain('valueMin={priceMin}')
    expect(step).not.toContain('valueMax={priceMax}')
  })

  test('sidan sparar bara ett uttryckligt standardpris — aldrig mittvärdet ur en förifylld slider', () => {
    const page = source('app/onboarding/page.tsx')
    const start = page.indexOf('if (step === 2)')
    const branch = page.slice(start, page.indexOf('if (step === 3', start))
    expect(branch).toContain('normalizeStandardHourlyRate(data.standardHourlyRate)')
    expect(branch).not.toContain('((data.priceMin || 0) + data.priceMax) / 2')
  })

  test('startbanken lämnar timartikeln prislös utan företagets uttryckliga pris', () => {
    const defaults = source('lib/product-defaults.ts')
    expect(defaults).toContain('primaryHourly.map(product => ({ ...product, unit_price: 0 }))')
  })

  test('offertkedjan uppfinner inte 650 kr när standardpris saknas', () => {
    const route = source('app/api/quotes/ai-generate/route.ts')
    const builder = source('app/dashboard/quotes/_shared/QuoteBuilder.tsx')
    const generator = source('lib/ai-quote-generator.ts')
    const resolver = source('lib/quotes/resolve-template-item-prices.ts')
    expect(route).not.toMatch(/default_hourly_rate\s*\|\|\s*650/)
    expect(builder).not.toMatch(/hourly_rate:\s*650|hourly_rate\s*\|\|\s*650/)
    expect(resolver).not.toContain('DEFAULT_TEMPLATE_HOURLY_RATE')
    expect(generator).toContain('Standard timpris: Ej satt')
    expect(generator).toContain('items = applyGeneratedPriceTruth(')
    expect(generator).not.toContain('if (input.jobTypeContext) {\n    items = applyGeneratedPriceTruth(')
  })
})

test.describe('Första uppdraget — signalstyrt och utan låtsasportfölj', () => {
  test('tomt konto med offertunderlag får offert + kundinflöde, aldrig portföljplan', () => {
    const options = deriveFirstAssignmentOptions({
      hasFirstQuoteSetup: true,
      firstFocus: undefined,
      unpaidCount: 0,
      openDealsCount: 0,
      importedCustomers: 0,
    })
    expect(options.map(o => o.id)).toEqual(['first_quote', 'customer_inflow'])
  })

  test('verkliga affärssignaler låser upp Matte-planen', () => {
    const options = deriveFirstAssignmentOptions({
      hasFirstQuoteSetup: true,
      firstFocus: 'betalt_snabbare',
      unpaidCount: 2,
      openDealsCount: 0,
      importedCustomers: 4,
    })
    expect(options.map(o => o.id)).toContain('portfolio_plan')
    expect(options.find(o => o.id === 'portfolio_plan')?.prompt).toContain('få betalt snabbare')
  })

  test('kundlista utan affärssignal ger bara en ärlig reaktiverings-/inflödesväg', () => {
    const options = deriveFirstAssignmentOptions({
      hasFirstQuoteSetup: false,
      firstFocus: 'fler_jobb',
      unpaidCount: 0,
      openDealsCount: 0,
      importedCustomers: 12,
    })
    expect(options.map(o => o.id)).toEqual(['customer_inflow'])
    expect(options[0].prompt).not.toMatch(/\d+\s*kr/)
  })

  test('finalen återanvänder handoff och offertstart — ingen ny missions-POST', () => {
    const final = source('app/onboarding/components/FirstAssignmentFinal.tsx')
    expect(final).toContain('writeFirstMissionPrompt')
    expect(final).toContain('Låt Matte ta fram planen')
    expect(final).not.toMatch(/fetch\([^)]*mission/i)
  })
})

test.describe('Matte-guidningen är presentation, inte en ny onboardingmotor', () => {
  test('guiden läser lokal formstate och saknar nätverks-/LLM-anrop', () => {
    const guide = source('components/onboarding/MatteSetupGuide.tsx')
    expect(guide).toContain('Det här är nu inställt')
    expect(guide).not.toContain('fetch(')
    expect(guide).not.toMatch(/anthropic|openai|generateText|messages\.create/i)
  })

  test('den befintliga niostegswizarden och dess fallback består', () => {
    const page = source('app/onboarding/page.tsx')
    const final = source('app/onboarding/components/FirstAssignmentFinal.tsx')
    expect(page).toContain('const TOTAL_STEPS = 9')
    expect(page).toContain('<MatteSetupGuide')
    expect(final).toContain('Utforska själv')
  })
})
