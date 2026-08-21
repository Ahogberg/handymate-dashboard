import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const SYNC = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/sync-to-fortnox.ts'),
  'utf8',
)
const SEND = fs.readFileSync(
  path.join(__dirname, '..', 'lib/invoices/send-invoice.ts'),
  'utf8',
)
const FORTNOX = fs.readFileSync(
  path.join(__dirname, '..', 'lib/fortnox.ts'),
  'utf8',
)

test.describe('E-faktura till foretagskunder via Fortnox (2026-08-21, korrigerad 2026-08-21)', () => {
  // Christoffer (pilot): foretag kraver e-faktura for sina bokforingsprogram.
  // FORSTA versionen gated pa gln_number — visade sig felaktig: Fortnox
  // support bekraftar att e-fakturaadressen AR organisationsnumret, GLN
  // kravs INTE i Sverige. Nastan ingen kund har ett GLN, sa gln_number-
  // grinden hade gjort funktionen aldrig-anvand. Korrigerat till org_number
  // (redan ett falt varje foretags-/BRF-kund har) som trigger; GLN kvar som
  // valfritt override. Om e-fakturaforsoket misslyckas faller floedet
  // tillbaka till Handymates egen leverans, sa kunden aldrig blir helt
  // utan faktura.

  test('pushar Type/OrganisationNumber/GLN till Fortnox-kunden innan bokning nar org_number finns', () => {
    const idx = SYNC.indexOf('updateFortnoxCustomer(businessId, customerNumber')
    expect(idx).toBeGreaterThan(-1)
    const block = SYNC.slice(idx, idx + 300)
    expect(block).toMatch(/OrganisationNumber:\s*invoice\.customer\.org_number/)
    expect(block).toMatch(/GLN:\s*invoice\.customer\.gln_number/)
  })

  test('triggern ar org_number, inte gln_number', () => {
    const idx = SYNC.indexOf('if (invoice.customer?.org_number) {')
    expect(idx).toBeGreaterThan(-1)
  })

  test('GLN-pushen ar best-effort — ett fel dar blockerar inte fakturabokningen', () => {
    const idx = SYNC.indexOf('updateFortnoxCustomer(businessId, customerNumber')
    const tryIdx = SYNC.lastIndexOf('try {', idx)
    const catchIdx = SYNC.indexOf('catch (glnErr', idx)
    expect(tryIdx).toBeGreaterThan(-1)
    expect(catchIdx).toBeGreaterThan(idx)
    const catchBlock = SYNC.slice(catchIdx, catchIdx + 200)
    expect(catchBlock).not.toMatch(/return \{ success: false/)
  })

  test('anropar /einvoice nar org_number finns, EFTER fortnoxDocumentNumber ar satt', () => {
    const docIdx = SYNC.indexOf('fortnoxDocumentNumber = response')
    const einvoiceIdx = SYNC.indexOf('${fortnoxDocumentNumber}/einvoice')
    expect(docIdx).toBeGreaterThan(-1)
    expect(einvoiceIdx).toBeGreaterThan(docIdx)
    const block = SYNC.slice(einvoiceIdx - 300, einvoiceIdx + 50)
    expect(block).toMatch(/invoice\.customer\?\.org_number/)
  })

  test('ett misslyckat e-fakturaforsok kastar inte — eInvoiceSent forblir false, floedet fortsatter', () => {
    const idx = SYNC.indexOf('let eInvoiceSent = false')
    expect(idx).toBeGreaterThan(-1)
    const block = SYNC.slice(idx, idx + 500)
    expect(block).toMatch(/catch \(eInvoiceErr/)
    expect(block).not.toMatch(/return \{ success: false/)
  })

  test('eInvoiceSent returneras fran den farska synkvagen', () => {
    const idx = SYNC.lastIndexOf('return {')
    expect(idx).toBeGreaterThan(-1)
    const block = SYNC.slice(idx, idx + 300)
    expect(block).toMatch(/eInvoiceSent/)
  })

  test('idempotenta vagen laser fortnox_einvoice_sent_at istallet for att anta false', () => {
    const idx = SYNC.indexOf("idempotent: true")
    expect(idx).toBeGreaterThan(-1)
    const block = SYNC.slice(idx, idx + 200)
    expect(block).toMatch(/eInvoiceSent:\s*!!invoice\.fortnox_einvoice_sent_at/)
  })

  test('fortnox_einvoice_sent_at skrivs bara nar eInvoiceSent ar sant (inte pa varje synk)', () => {
    expect(SYNC).toMatch(/if\s*\(eInvoiceSent\)\s*\{\s*\n\s*updateData\.fortnox_einvoice_sent_at\s*=\s*now/)
  })
})

test.describe('sendInvoice hoppar over egen leverans nar e-faktura lyckades (2026-08-21)', () => {
  test('email-blocket portas av nar results.einvoice ar satt', () => {
    const idx = SEND.indexOf('if (send_email && invoice.customer?.email')
    expect(idx).toBeGreaterThan(-1)
    expect(SEND.slice(idx, idx + 100)).toContain('!results.einvoice')
  })

  test('SMS-blocket portas av nar results.einvoice ar satt', () => {
    const idx = SEND.indexOf('if (send_sms && invoice.customer?.phone_number')
    expect(idx).toBeGreaterThan(-1)
    expect(SEND.slice(idx, idx + 100)).toContain('!results.einvoice')
  })

  test('results.einvoice sätts fran fortnoxResult.eInvoiceSent INNAN email/SMS-blocken', () => {
    const setIdx = SEND.indexOf('results.einvoice = true')
    const emailIdx = SEND.indexOf('if (send_email')
    expect(setIdx).toBeGreaterThan(-1)
    expect(setIdx).toBeLessThan(emailIdx)
  })

  test('applyInvoiceDeliveryOutcome raknar einvoice som en lyckad leverans', () => {
    expect(SEND).toContain('results.email || results.sms || results.einvoice')
  })

  test('sentMethod blir einvoice, inte both/email/sms, nar einvoice ar satt', () => {
    expect(SEND).toMatch(/results\.einvoice \? 'einvoice'/)
  })
})

test.describe('Fortnox-kundpayload bar Type/OrganisationNumber/GLN (verifierat mot fortnox-openapi.json)', () => {
  test('FortnoxCustomer-interfacet har GLN-falten', () => {
    const idx = FORTNOX.indexOf('export interface FortnoxCustomer')
    const block = FORTNOX.slice(idx, idx + 400)
    expect(block).toContain('GLN?')
    expect(block).toContain('GLNDelivery?')
    expect(block).toContain('OrganisationNumber?')
  })

  test('syncCustomerToFortnox skickar med GLN vid forsta skapandet', () => {
    const idx = FORTNOX.indexOf('const fortnoxCustomer = await createFortnoxCustomer')
    expect(idx).toBeGreaterThan(-1)
    const block = FORTNOX.slice(idx, idx + 600)
    expect(block).toMatch(/GLN:\s*customer\.gln_number/)
  })
})

test.describe('GLN ar ett valfritt override, inte kravet (Fortnox: e-fakturaadressen ar organisationsnumret)', () => {
  test('GLN-faltet i kundformularet ar markt valfritt/ovanligt, inte som kravet for e-faktura', () => {
    const modal = fs.readFileSync(
      path.join(__dirname, '..', 'app/dashboard/customers/components/CustomerModal.tsx'),
      'utf8',
    )
    expect(modal).toMatch(/GLN-nummer \(valfritt/)
  })

  test('e-invoice-anropet forlitar sig inte pa gln_number som villkor nagonstans i sync-flodet', () => {
    // Enda tillatna traff pa "gln_number" i hela filen ar SOM VARDE i
    // GLN/GLNDelivery-faltet (override), aldrig i ett if/&&-villkor.
    const conditionMatches = SYNC.match(/(if\s*\([^)]*gln_number|&&[^)]*gln_number)/g)
    expect(conditionMatches).toBeNull()
  })
})
