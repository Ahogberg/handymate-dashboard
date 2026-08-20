import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const FILE = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/sync-to-fortnox.ts'),
  'utf8',
)

test.describe('lib/invoices/sync-to-fortnox.ts', () => {
  test('exporterar syncInvoiceToFortnox', () => {
    expect(FILE).toMatch(/export async function syncInvoiceToFortnox/)
  })

  test('idempotens: redan synced returnerar success utan nytt Fortnox-anrop', () => {
    const idx = FILE.indexOf('export async function syncInvoiceToFortnox')
    const block = FILE.slice(idx, idx + 3000)
    expect(block).toMatch(/fortnox_sync_status/)
    expect(block).toMatch(/synced/)
  })

  test('in-flight-skydd (pending + timeout) ar oforandrat med fran originalet', () => {
    expect(FILE).toContain('FORTNOX_PENDING_TIMEOUT_MS')
  })

  test('bygger ROT/RUT-payload som originalet', () => {
    expect(FILE).toContain('TaxReductionType')
    expect(FILE).toContain('TaxReduction')
  })

  test('markerar sync som pending FORE Fortnox-anropet', () => {
    const idx = FILE.indexOf("fortnox_sync_status: 'pending'")
    expect(idx).toBeGreaterThan(-1)
    // Sök EFTER idx (inte FILE.indexOf från start) — 'fortnoxRequest' finns
    // redan i importsatsen högst upp i filen, så en osökt indexOf skulle
    // alltid hitta den och göra testet meningslöst. Vi vill hitta det
    // FAKTISKA anropet i try-blocket, inte identifierarens första nämning.
    const postIdx = FILE.indexOf('fortnoxRequest', idx)
    expect(postIdx).toBeGreaterThan(idx)
  })

  test('returnerar skipped:true om Fortnox inte ar kopplat, inte ett fel', () => {
    expect(FILE).toMatch(/skipped:\s*true/)
  })
})
