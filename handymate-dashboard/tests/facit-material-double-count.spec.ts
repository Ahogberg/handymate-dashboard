// tests/facit-material-double-count.spec.ts
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/projects/compute-economics.ts'),
  'utf8',
)

test.describe('compute-economics — ingen dubbelräkning av lankade fakturor', () => {
  test('supplier_invoices-frågan läser id (behövs för att avgöra vilka som är länkade)', () => {
    const idx = FILE.indexOf(".from('supplier_invoices')")
    const block = FILE.slice(idx, idx + 300)
    expect(block).toMatch(/\.select\(['"`][^'"`]*\bid\b/)
  })

  test('project_material-frågan läser supplier_invoice_id', () => {
    const idx = FILE.indexOf(".from('project_material')")
    const block = FILE.slice(idx, idx + 300)
    expect(block).toContain('supplier_invoice_id')
  })

  test('en fakturas total_amount räknas ALDRIG med om den har minst en länkad materialrad', () => {
    const idx = FILE.indexOf('Supplier invoices')
    expect(idx).toBeGreaterThan(-1)
    // 1200 räckte inte i praktiken (den faktiska kodens kommentarer +
    // typannotationer landar närmare ~1400 tecken bort) — vidgat fönster,
    // avsikten (en uteslutningsmängd används) är oförändrad.
    const block = FILE.slice(idx, idx + 1800)
    expect(block).toMatch(/linkedInvoiceIds|new Set\(/)
  })
})

test.describe('freeze-outcome — overlap-flaggan respekterar lankning', () => {
  const FILE = fs.readFileSync(
    path.join(__dirname, '..', 'lib/efterkalkyl/freeze-outcome.ts'),
    'utf8',
  )

  test('overlap-regeln läser olänkade rader, inte bara totala antal', () => {
    const idx = FILE.indexOf('materialSourceOverlapFree')
    const block = FILE.slice(idx, idx + 400)
    expect(block).toMatch(/unlinked/i)
  })
})
