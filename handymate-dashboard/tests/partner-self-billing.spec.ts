import { test, expect } from '@playwright/test'
import { buildSelfBillingDocument, generateSelfBillingPdf } from '../lib/partners/self-billing'

const seller = {
  legalName: 'Partnerbolaget AB',
  organizationNumber: '556677-8899',
  registeredAddress: 'Partnergatan 1, 111 11 Stockholm',
  vatNumber: 'SE556677889901',
  email: 'faktura@partner.se',
  vatRegistered: true,
  vatRate: 0.25,
  fTaxApproved: true,
  payoutReference: 'Bankgiro 123-4567',
}
const buyer = {
  legalName: 'Handymate AB',
  organizationNumber: '559999-9999',
  registeredAddress: 'Handymategatan 1, 111 11 Stockholm',
  vatNumber: 'SE559999999901',
  email: 'ekonomi@handymate.se',
}
const rows = [{
  customerName: 'Anderssons Bygg AB',
  period: '2026-09',
  customerMonth: 1,
  baseSek: 5_995,
  rate: 0.2,
  commissionSek: 1_199,
  kind: 'accrual' as const,
}]

test.describe('Självfaktura', () => {
  test('fryser parter, nummer, 30 dagar, moms och total', () => {
    const doc = buildSelfBillingDocument({
      invoiceNumber: 'SF-2026-ABC-0001',
      invoiceDate: '2026-09-30',
      seller,
      buyer,
      rows,
      generatedAt: '2026-09-30T12:00:00Z',
    })
    expect(doc.title).toBe('SJÄLVFAKTURERING')
    expect(doc.dueDate).toBe('2026-10-30')
    expect(doc.subtotalSek).toBe(1_199)
    expect(doc.vatSek).toBe(299.75)
    expect(doc.totalSek).toBe(1_498.75)
    expect(doc.seller.legalName).toBe('Partnerbolaget AB')
    expect(doc.buyer.legalName).toBe('Handymate AB')
  })

  test('ej momsregistrerad partner får 0 moms men aldrig en dold 25%-default', () => {
    const doc = buildSelfBillingDocument({
      invoiceNumber: 'SF-2026-ABC-0002',
      invoiceDate: '2026-09-30',
      seller: { ...seller, vatRegistered: false, vatRate: 0, vatNumber: null },
      buyer,
      rows,
    })
    expect(doc.vatRate).toBe(0)
    expect(doc.vatSek).toBe(0)
    expect(doc.totalSek).toBe(1_199)
  })

  test('ofullständig part blockerar fakturan fail-closed', () => {
    expect(() => buildSelfBillingDocument({
      invoiceNumber: 'SF-2026-ABC-0003',
      invoiceDate: '2026-09-30',
      seller: { ...seller, organizationNumber: '' },
      buyer,
      rows,
    })).toThrow(/organisationsnummer saknas/)
  })

  test('PDF byggs från snapshot och är ett riktigt PDF-dokument', () => {
    const snapshot = buildSelfBillingDocument({
      invoiceNumber: 'SF-2026-ABC-0004', invoiceDate: '2026-09-30', seller, buyer, rows,
    })
    const pdf = generateSelfBillingPdf(snapshot)
    expect(pdf.length).toBeGreaterThan(1_000)
    expect(Buffer.from(pdf).subarray(0, 4).toString()).toBe('%PDF')
  })
})

