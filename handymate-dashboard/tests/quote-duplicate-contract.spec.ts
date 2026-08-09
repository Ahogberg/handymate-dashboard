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
  // Uppdaterad 2026-08-09: kopian skapas via den kanoniska byggaren
  // (lib/quotes/create-quote.ts), som skriver huvud och rader ihop och rullar
  // tillbaka huvudet om raderna inte går att spara. Källraderna läses FÖRE
  // skapandet; ett läsfel stoppar innan något huvud alls skapats.
  expect(duplicateBranch).toContain('error: sourceItemsErr')
  const läsning = duplicateBranch.indexOf('sourceItemsErr')
  const skapande = duplicateBranch.indexOf('createQuote(')
  expect(skapande, 'kopian går inte via byggaren').toBeGreaterThan(-1)
  expect(läsning, 'raderna läses efter skapandet — läsfel lämnar ett tomt huvud').toBeLessThan(skapande)
  // Byggarens rollback-regel är facit-låst i tests/offertbyggaren.spec.ts.
  expect(duplicateBranch).toMatch(/items: \(sourceItems \|\| \[\]\)\.map/)
})
