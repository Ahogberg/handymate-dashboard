import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

/**
 * Konsolidering (2026-08-20): innan detta fanns FYRA separata vägar som
 * kunde synka en kundfaktura till Fortnox, med två oberoende
 * implementationer av samma logik:
 *
 *   1. app/api/invoices/[id]/send-via-fortnox/route.ts ("Bokför i
 *      Fortnox"-knappen, detaljsidan) — använde REDAN den nya funktionen.
 *   2. lib/invoices/send-invoice.ts (det enade "Skicka faktura"-flödet)
 *      — använde REDAN den nya funktionen.
 *   3. app/api/integrations/fortnox/sync/invoice/route.ts (fakturalistans
 *      per-rad synk-knapp) — använde den GAMLA, separata implementationen
 *      i lib/fortnox.ts.
 *   4. app/api/integrations/fortnox/sync/invoices/route.ts (Inställningar
 *      → bulk-synk) OCH lib/fortnox/sync.ts:s syncInvoiceWithTracking
 *      (agent-verktyg + automationsmotorn) — använde OCKSÅ den gamla
 *      implementationen.
 *
 * Den gamla implementationen hade en egen, oberoende InvoiceNumber-bugg
 * (se tests/facit-fortnox-invoice-number-field.spec.ts) — bevis på att
 * dubblerad logik dubblerar risk. Alla fyra vägar pekar nu mot EN källa:
 * lib/invoices/sync-to-fortnox.ts.
 */

function read(p: string): string {
  return fs.readFileSync(path.join(__dirname, '..', p), 'utf8')
}

test.describe('Alla fakturasynk-vägar pekar mot en källa', () => {
  test('fakturalistans synk-rutt använder lib/invoices/sync-to-fortnox, inte lib/fortnox', () => {
    const src = read('app/api/integrations/fortnox/sync/invoice/route.ts')
    expect(src).toContain("from '@/lib/invoices/sync-to-fortnox'")
    expect(src).not.toMatch(/from '@\/lib\/fortnox'/)
  })

  test('bulk-synk-rutten använder lib/invoices/sync-to-fortnox, inte lib/fortnox', () => {
    const src = read('app/api/integrations/fortnox/sync/invoices/route.ts')
    expect(src).toContain("from '@/lib/invoices/sync-to-fortnox'")
    expect(src).not.toMatch(/syncInvoiceToFortnox.*from '@\/lib\/fortnox'/)
  })

  test('V7-synkmotorn (agent-verktyg + automationsmotorn) använder lib/invoices/sync-to-fortnox', () => {
    const src = read('lib/fortnox/sync.ts')
    expect(src).toContain("from '@/lib/invoices/sync-to-fortnox'")
  })

  test('den gamla, dubblerade syncInvoiceToFortnox-funktionen är borttagen ur lib/fortnox.ts', () => {
    const src = read('lib/fortnox.ts')
    expect(src).not.toMatch(/export async function syncInvoiceToFortnox/)
  })

  test('createFortnoxInvoice (bara använd av den borttagna funktionen) är borttagen', () => {
    const src = read('lib/fortnox.ts')
    expect(src).not.toMatch(/export async function createFortnoxInvoice/)
  })
})
