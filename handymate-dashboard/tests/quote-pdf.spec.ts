/**
 * Offert-PDF (v68) — smoke-test för generateQuotePDF (jsPDF).
 * Körs: npx playwright test tests/quote-pdf.spec.ts --no-deps --workers=1
 *
 * Verifierar att en giltig PDF-Buffer produceras (%PDF-header + storlek) och
 * att alla radtyper (heading/item/discount/valt+ej valt tillval, ROT) passerar
 * utan att kasta.
 */
import { test, expect } from '@playwright/test'
import { generateQuotePDF, type QuotePdfData, type BusinessPdfData } from '../lib/pdf-generator'

const business: BusinessPdfData = {
  business_name: 'Byglo Bygg AB',
  org_number: '556677-8899',
  address: 'Storgatan 1, 123 45 Stockholm',
  contact_name: 'Anders Andersson',
  contact_email: 'anders@byglo.se',
  contact_phone: '070-123 45 67',
  accent_color: '#0F766E',
  f_skatt_registered: true,
}

test('genererar en giltig PDF för en minimal ROT-offert', () => {
  const quote: QuotePdfData = {
    quote_number: 'OFF-1001',
    created_at: '2026-07-01T10:00:00Z',
    valid_until: '2026-07-31T10:00:00Z',
    title: 'Renovering badrum',
    description: 'Komplett renovering av badrum inklusive tätskikt och kakel.',
    items: [
      { item_type: 'heading', description: 'Arbete', quantity: 0, unit: '', unit_price: 0, total: 0 },
      { item_type: 'item', description: 'Kakelsättning', quantity: 20, unit: 'm²', unit_price: 800, total: 16000, is_rot_eligible: true },
    ],
    subtotal: 16000,
    vat_rate: 25,
    vat_amount: 4000,
    total: 20000,
    rot_rut_type: 'rot',
    rot_deduction: 4800,
    rot_customer_pays: 15200,
    reference_person: 'Kalle Kund',
    personnummer: '19800101-1234',
    customer: { name: 'Kalle Kund', address_line: 'Vägen 2', phone_number: '073-000 00 00' },
    creator: { name: 'Anders Andersson', phone: '070-123 45 67', email: 'anders@byglo.se' },
    introduction_text: 'Tack för din förfrågan.',
    payment_terms_text: '30 dagar netto.',
  }

  const buf = generateQuotePDF(quote, business)
  expect(buf.length).toBeGreaterThan(1000)
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
})

test('hanterar rabatt + valt tillval + ej valt tillval utan att kasta', () => {
  const quote: QuotePdfData = {
    quote_number: 'OFF-1002',
    created_at: '2026-07-02T10:00:00Z',
    items: [
      { item_type: 'item', description: 'Grundarbete', quantity: 1, unit: 'st', unit_price: 10000, total: 10000 },
      { item_type: 'discount', description: 'Kundrabatt', quantity: 1, unit: 'st', unit_price: -1000, total: -1000 },
      { item_type: 'option', description: 'Extra belysning', quantity: 1, unit: 'st', unit_price: 2500, total: 2500, option_selected: true },
      { item_type: 'option', description: 'Golvvärme', quantity: 1, unit: 'st', unit_price: 5000, total: 5000, option_selected: false },
      { item_type: 'subtotal', description: 'Delsumma', quantity: 0, unit: '', unit_price: 0, total: 11500 },
    ],
    subtotal: 11500,
    vat_rate: 25,
    vat_amount: 2875,
    total: 14375,
    customer: { name: 'Test Kund' },
  }

  const buf = generateQuotePDF(quote, business)
  expect(buf.length).toBeGreaterThan(1000)
  expect(buf.subarray(0, 5).toString()).toBe('%PDF-')
})
