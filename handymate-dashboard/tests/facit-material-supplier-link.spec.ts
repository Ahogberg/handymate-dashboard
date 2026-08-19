// tests/facit-material-supplier-link.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROUTE = fs.readFileSync(
  path.join(__dirname, '..', 'app/api/projects/[id]/materials/route.ts'),
  'utf8',
)

test.describe('PUT /api/projects/[id]/materials — supplier_invoice_id', () => {
  test('PUT-handlern läser supplier_invoice_id ur body och skriver den till updates', () => {
    const putStart = ROUTE.indexOf('export async function PUT')
    const putBody = ROUTE.slice(putStart, ROUTE.indexOf('export async function DELETE'))
    expect(putBody).toContain('body.supplier_invoice_id')
  })

  test('supplier_invoice_id kan nollställas explicit (null tillåts, inte bara undefined-skip)', () => {
    const putStart = ROUTE.indexOf('export async function PUT')
    const putBody = ROUTE.slice(putStart, ROUTE.indexOf('export async function DELETE'))
    const idx = putBody.indexOf('supplier_invoice_id')
    expect(idx).toBeGreaterThan(-1)
    const line = putBody.slice(idx - 40, idx + 60)
    expect(line).toContain('!== undefined')
  })
})
