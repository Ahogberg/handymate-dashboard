import { test, expect } from '@playwright/test'
import { parseCustomerCsv, parseCsvCustomers } from '../lib/customers/csv'
import { readFileSync } from 'fs'

for (const delimiter of [',', ';', '\t']) {
  test(`preserves columns with delimiter ${JSON.stringify(delimiter)}`, () => {
    const text = ['Namn', 'Telefon', 'Adress'].join(delimiter) + '\r\n'
      + ['"Andersson, Anna"', '0701234567', '"Gata; 4"'].join(delimiter)
    expect(parseCustomerCsv(text).rows).toEqual([['Andersson, Anna', '0701234567', 'Gata; 4']])
  })
}
test('BOM, escaped quotes and multiline address are data, not new customers', () => {
  expect(parseCustomerCsv('\uFEFFNamn,Telefon,Adress\r\n"Anna ""Bygg""",0701234567,"Gatan 1\r\nLgh 2"\r\n\r\n').rows)
    .toEqual([['Anna "Bygg"', '0701234567', 'Gatan 1\r\nLgh 2']])
})
for (const [label, text] of Object.entries({
  unclosed: 'Namn,Telefon\n"Anna,0701234567',
  surplus: 'Namn,Telefon\nAnna,Extra,0701234567',
  missing: 'Namn,Telefon\nAnna',
  strayQuote: 'Namn,Telefon\nAn"na,0701234567',
  trailing: 'Namn,Telefon\n"Anna"oops,0701234567',
})) {
  test(`rejects ${label} instead of shifting customer data`, () => {
    expect(() => parseCustomerCsv(text)).toThrow()
  })
}
test('empty data and an explicitly empty field are distinct', () => {
  expect(parseCustomerCsv('')).toEqual({ headers: [], rows: [] })
  expect(parseCustomerCsv('Namn,Telefon\nAnna,').rows).toEqual([['Anna', '']])
})
test('both customer CSV entry points use the same parser', () => {
  for (const path of ['app/dashboard/customers/import/page.tsx', 'app/onboarding/components/StepImportData.tsx']) {
    expect(readFileSync(path, 'utf8')).toContain("from '@/lib/customers/csv'")
  }
})

test('leading empty lines do not change the delimiter', () => {
  expect(parseCustomerCsv('\r\n\r\nNamn;Telefon\r\nAnna;0701234567').rows).toEqual([['Anna', '0701234567']])
})
test('onboarding never places email in a missing phone column', () => {
  expect(parseCsvCustomers('Namn,E-post\nAnna,anna@example.com')).toEqual([
    { name: 'Anna', phone_number: '', email: 'anna@example.com', address: '' },
  ])
  expect(parseCsvCustomers('Telefon\n0701234567')[0].name).toBe('')
})
test('unusable rows reach the server receipt instead of silently disappearing', () => {
  expect(parseCsvCustomers('E-post\nanna@example.com')).toEqual([
    { name: '', phone_number: '', email: 'anna@example.com', address: '' },
  ])
})
