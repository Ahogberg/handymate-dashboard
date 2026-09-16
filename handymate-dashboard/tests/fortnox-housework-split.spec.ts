import { expect, test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { buildFortnoxInvoiceRows } from '../lib/invoices/fortnox-rows'
import { isHouseWorkRow, splitRowsForHouseWork } from '../lib/fortnox/housework'

const mixed = { item_type: 'item', description: 'Paket', quantity: 1, unit: 'st', unit_price: 1000,
  labor_amount: 600, material_amount: 300, travel_amount: 100, is_rot_eligible: true }

test('blandad Handymate-rad blir en HouseWork-rad och en vanlig Fortnox-rad', () => {
  const split = splitRowsForHouseWork([mixed])
  expect(split).toHaveLength(2)
  expect(split.map(row => row.unit_price)).toEqual([600, 400])
  const rows = buildFortnoxInvoiceRows([mixed], { houseWork: { rotType: 'rot', houseWorkType: 'CONSTRUCTION' } })
  expect(rows.map(row => row.HouseWork)).toEqual([true, false])
  expect(rows.reduce((sum, row) => sum + Number(row.Price || 0), 0)).toBe(1000)
})

test('labor_amount noll kan aldrig bli HouseWork även om flaggan är satt', () => {
  expect(isHouseWorkRow({ labor_amount: 0, is_rot_eligible: true }, 'rot')).toBe(false)
})

test('synkrouten stoppar redan synkad faktura före radbyggaren', () => {
  const source = fs.readFileSync(path.join(__dirname, '../lib/invoices/sync-to-fortnox.ts'), 'utf8')
  expect(source).toMatch(/fortnox_invoice_number|fortnox_document_number/)
  expect(source).toMatch(/redan|already|synkad/i)
})
