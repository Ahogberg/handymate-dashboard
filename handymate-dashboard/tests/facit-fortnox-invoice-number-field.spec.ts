import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Fortnox Invoice-resursen (kundfaktura) har inget InvoiceNumber-fält —
 * bara DocumentNumber. Bekräftat 2026-08-20 mot Fortnox riktiga
 * OpenAPI-spec (fortnox_Kf_InvoiceSingleItem). InvoiceNumber finns bara
 * på andra resurser (betalningsuppföljning, SupplierInvoice).
 *
 * Två separata funktioner med SAMMA namn (syncInvoiceToFortnox) råkade
 * göra samma misstag: lib/invoices/sync-to-fortnox.ts (den nya, enade
 * flödet) och lib/fortnox.ts (äldre, används fortfarande live från
 * fakturalistan och Inställningar → bulk-synk). Båda skrev
 * response.Invoice.InvoiceNumber (alltid undefined) till
 * invoice.fortnox_invoice_number — vilket gjorde att kolumnen ALDRIG
 * blev truthy, vilket i sin tur gjorde att idempotens-kollen ("redan
 * synkad?") aldrig triggade. Effekt: varje klick på synk-knappen skapade
 * ÄNNU en riktig faktura i Fortnox bokföring.
 */

const FORTNOX_LIB = fs.readFileSync(
  path.join(__dirname, '..', 'lib/fortnox.ts'),
  'utf8',
)

test.describe('lib/fortnox.ts syncInvoiceToFortnox — DocumentNumber, inte InvoiceNumber', () => {
  test('fortnox_invoice_number skrivs fran DocumentNumber i DB-uppdateringen', () => {
    const idx = FORTNOX_LIB.indexOf('export async function syncInvoiceToFortnox')
    expect(idx).toBeGreaterThan(-1)
    const nextFnIdx = FORTNOX_LIB.indexOf('\nexport async function', idx + 10)
    const block = FORTNOX_LIB.slice(idx, nextFnIdx)
    expect(block).not.toMatch(/fortnox_invoice_number:\s*fortnoxInvoice\.InvoiceNumber/)
    expect(block).toMatch(/fortnox_invoice_number:\s*fortnoxInvoice\.DocumentNumber/)
  })

  test('returvardet fortnoxInvoiceNumber kommer fran DocumentNumber', () => {
    const idx = FORTNOX_LIB.indexOf('export async function syncInvoiceToFortnox')
    const nextFnIdx = FORTNOX_LIB.indexOf('\nexport async function', idx + 10)
    const block = FORTNOX_LIB.slice(idx, nextFnIdx)
    expect(block).not.toMatch(/fortnoxInvoiceNumber:\s*fortnoxInvoice\.InvoiceNumber/)
    expect(block).toMatch(/fortnoxInvoiceNumber:\s*fortnoxInvoice\.DocumentNumber/)
  })
})
