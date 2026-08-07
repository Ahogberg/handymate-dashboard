import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const source = fs.readFileSync(path.resolve(__dirname, '../app/api/quotes/route.ts'), 'utf8')
const duplicateBranch = source.slice(source.indexOf('// Duplicate from existing quote'), source.indexOf('// New quote creation'))

test('duplicate/version bevarar kundens kontraktsfält och CRM-länkar', () => {
  for (const field of [
    'template_style',
    'terms_text',
    'reservations_snapshot',
    'attachments',
    'deal_id',
    'lead_id',
  ]) {
    expect(duplicateBranch).toContain(`${field}: source.${field}`)
  }
})

test('duplicate/version lämnar aldrig ett offerthuvud utan kopierade rader', () => {
  expect(duplicateBranch).toContain('error: sourceItemsErr')
  expect(duplicateBranch).toContain('error: dupItemsErr')
  expect(duplicateBranch).toMatch(/if \(dupItemsErr\)[\s\S]*\.from\('quotes'\)[\s\S]*\.delete\(\)[\s\S]*\.eq\('quote_id', newId\)/)
})
