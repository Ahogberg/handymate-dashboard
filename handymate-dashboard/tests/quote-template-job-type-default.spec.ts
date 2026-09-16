import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { getDefaultQuoteTemplates } from '../lib/quote-template-defaults'
import { generatedQuoteToQuoteItems } from '../lib/quotes/generated-to-quote-items'

test('varje seedad mall har explicit jobbtyp och varje item-rad har delning', () => {
  for (const branch of ['construction', 'electrician', 'plumber', 'painter', 'other']) {
    for (const template of getDefaultQuoteTemplates(branch)) {
      expect(template.job_type_slug, `${branch}/${template.name}`).toBeTruthy()
      expect(template.job_type_name, `${branch}/${template.name}`).toBeTruthy()
      for (const row of template.default_items.filter(row => row.item_type === 'item')) {
        expect(Number(row.labor_amount) + Number(row.material_amount) + Number(row.travel_amount)).toBe(row.total)
      }
    }
  }
})

test('seedningen säkrar jobbtyperna och kopplar utan namngissning', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/seed-defaults.ts'), 'utf8')
  expect(source).toContain('ensureOnboardingJobTypes')
  expect(source).toContain('job_type_slug: t.job_type_slug')
  expect(source).not.toMatch(/job_type_slug:\s*slugify[^\n]*t\.name/)
})

test('varje omatchad agentrad får obligatorisk delning', () => {
  const [work, material] = generatedQuoteToQuoteItems([
    { description: 'Montage', quantity: 2, unit: 'tim', unitPrice: 500, type: 'labor' },
    { description: 'Material', quantity: 1, unit: 'st', unitPrice: 300, type: 'material' },
  ], [], 'rot', true)
  expect([work.labor_amount, work.material_amount, work.travel_amount]).toEqual([1000, 0, 0])
  expect([material.labor_amount, material.material_amount, material.travel_amount]).toEqual([0, 300, 0])
})

test('agentkontexten prioriterar jobbtypskopplad mall', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/quotes/quote-generation-context.ts'), 'utf8')
  expect(source).toContain("q = q.eq('job_type_slug', jobType)")
})
