import { getFeatureLimit } from '../lib/feature-gates'
import { test, expect } from '@playwright/test'
import { TRADE_START_PACKAGES, getTradeStartPackage } from '../lib/onboarding/trade-start-packages'
import { JOB_TYPES_BY_TRADE, ADDITIONAL_JOB_TYPES_BY_TRADE } from '../lib/job-type-catalog'
import { slugifyJobType } from '../lib/job-types'
import { hasLaborCost, inspectTemplate, type SetupTemplate } from '../lib/quotes/job-type-setup'
import { intakeNextStep } from '../lib/onboarding/customer-intake'

for (const [trade, packages] of Object.entries(TRADE_START_PACKAGES).filter(([t]) => t !== 'other')) {
  test(`${trade}: five complete starting points precede opt-in examples`, () => {
    expect(packages).toHaveLength(5)
    expect(JOB_TYPES_BY_TRADE[trade].slice(0,5)).toEqual(packages.map(p => p.name))
    expect(new Set(packages.map(p => slugifyJobType(p.name))).size).toBe(5)
    for (const p of packages) {
      expect(p.labor.length).toBeGreaterThan(0)
      expect(p.scope.length).toBeGreaterThan(0)
      expect(p.materials.length).toBeGreaterThan(0)
      expect(p.questions.length).toBeGreaterThanOrEqual(2)
      expect(Object.keys(p).sort()).toEqual(['labor','materials','name','questions','scope'])
    }
    for(const legacy of ADDITIONAL_JOB_TYPES_BY_TRADE[trade]) expect(JOB_TYPES_BY_TRADE[trade]).toContain(legacy)
  })
}
test('shared job names use the selected industry and never a guessed industry', () => {
  expect(getTradeStartPackage('plumber','Badrum')?.labor).toBe('VVS-arbete')
  expect(getTradeStartPackage('general_contractor','Badrum')?.labor).toBe('Bygg- och samordningsarbete')
  expect(getTradeStartPackage('other','Badrum')).toBeUndefined()
  expect(getTradeStartPackage('plumber','Eget jobb')).toBeUndefined()
  expect(getTradeStartPackage('plumber','Laddbox')?.labor).toBe('Elektrikerarbete')
})
const template:SetupTemplate={id:'t',name:'t',jobTypeSlug:'t',updatedAt:null,category:null,items:[{index:0,itemType:'item',description:'Arbete',unit:'st',linkedProductId:'p'}]}
test('labor is proven by metadata, not names or an assumed hourly line', () => {
  const product={id:'p',name:'Arbete',unit:'st',salesPrice:1000}
  expect(hasLaborCost(inspectTemplate(template,[product]))).toBe(false)
  expect(hasLaborCost(inspectTemplate(template,[{...product,laborShare:0.5}]))).toBe(true)
  expect(hasLaborCost(inspectTemplate(template,[{...product,category:'arbete'}]))).toBe(true)
  expect(hasLaborCost(inspectTemplate(template,[{...product,laborShare:0}]))).toBe(false)
  expect(hasLaborCost(inspectTemplate(template,[{...product,unit:'tim',category:'arbete'}]))).toBe(false)
})
test('intake guidance distinguishes forwarding from mailbox access', () => {
  expect(intakeNextStep('email')).toContain('inte åtkomst till gamla mejl')
  expect(intakeNextStep('phone')).toContain('samtalsprovet')
  expect(intakeNextStep('website')).toContain('rätt kundärende')
  expect(intakeNextStep(undefined)).toContain('senare')
})

test('quote templates have no quota for current or legacy plans', () => {
  for (const plan of ['starter', 'professional', 'business'] as const) expect(getFeatureLimit(plan,'quote_templates')).toBeNull()
})
