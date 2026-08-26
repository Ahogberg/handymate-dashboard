/**
 * Facit för Fakturor-listsidans strukturlyft mot Command Center-språket
 * (Etapp L2b2, 2026-08-18, docs/HANDYMATE_DESIGN_SYSTEM.md). Systerfilerna
 * app/dashboard/invoices/[id]/components/* och app/dashboard/invoices/_shared/*
 * var redan konverterade — det här facitet tar listsidan ikapp dem.
 *
 * Ren visuell reskin — ZERO ändrad data/handlers. Testet är därför ett
 * käll-scan (samma idiom som tests/bookings-page-design.spec.ts), inte ett
 * DOM-test.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/invoices-page-design.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'

const ROOT = path.resolve(__dirname, '..')
const PAGE_PATH = path.join(ROOT, 'app/dashboard/invoices/page.tsx')
const source = fs.readFileSync(PAGE_PATH, 'utf8')

test.describe('Fakturor — strukturlyft', () => {
  test('tabellhuvudena är läsbara — ingen uppercase-eyebrow i under-AA-kontrast gray-400', () => {
    expect(source).not.toContain('text-xs font-medium text-gray-400 uppercase tracking-wider')
    const ths = source.match(/<th className="[^"]*">/g) || []
    expect(ths.length).toBe(8)
    for (const th of ths) {
      expect(th).toContain('text-gray-600')
      expect(th).not.toContain('uppercase')
    }
  })

  test('statplattorna behåller sin kronor-semantik men lyfts till font-heading/tabular-nums/rounded-card', () => {
    expect(source).toContain('stats.unpaidCount')
    expect(source).toContain('stats.overdue')
    expect(source).toContain('stats.paid')
    expect(source).toContain('stats.paidThisMonthValue')
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBeGreaterThanOrEqual(6)
    const tabularNums = source.match(/tabular-nums/g) || []
    expect(tabularNums.length).toBeGreaterThanOrEqual(4)
  })

  test('bg-white/20-badgen och CTA-glowen är borta (verifierade kvar efter L2a)', () => {
    expect(source).not.toContain('bg-white/20')
    expect(source).not.toContain('shadow-md shadow-primary-600/20')
  })

  test('dag-grupperingen (mobilkortlistan) sorterar aldrig om — samma `filteredInvoices`-array, bara en rubrik insatt', () => {
    expect(source).toContain('function invoiceDayLabel')
    expect(source).toContain('filteredInvoices.map((invoice, idx) => {')
    expect(source).not.toMatch(/filteredInvoices\s*\.\s*sort\(/)
    expect(source).not.toMatch(/\[\s*\.\.\.filteredInvoices\s*\]\s*\.sort/)
    expect(source).toContain('return dayHeader ? [dayHeader, card] : card')
  })

  test('det varma tomt-state-uttrycket finns ordagrant', () => {
    expect(source).toContain('Inga fakturor än')
    expect(source).not.toContain('Inga fakturor hittades')
  })

  test('rounded-card och font-heading används brett — fanns inte innan', () => {
    const roundedCard = source.match(/rounded-card/g) || []
    expect(roundedCard.length).toBeGreaterThanOrEqual(6)
    const fontHeading = source.match(/font-heading/g) || []
    expect(fontHeading.length).toBeGreaterThanOrEqual(5)
  })

  test('min-h-[44px] finns brett på handlingsknapparna (mobil tumzon)', () => {
    const matches = source.match(/min-h-\[44px\]/g) || []
    expect(matches.length).toBeGreaterThanOrEqual(10)
  })

  test('handler-anropen är oförändrade — restylingen bytte aldrig VAD en knapp gör', () => {
    expect(source).toContain('onClick={() => setFilter(f.id)}')
    expect(source).toContain('onClick={() => handleSend(invoice.invoice_id)}')
    expect(source).toContain('onClick={() => handleDelete(invoice.invoice_id)}')
    expect(source).toContain('onClick={() => handleMarkPaid(invoice.invoice_id)}')
    expect(source).toContain('onClick={() => handleSendReminder(invoice.invoice_id)}')
    expect(source).toContain('onClick={() => handleSyncToFortnox(invoice.invoice_id)}')
  })

  test('datakällan (fetchInvoices mot /api/invoices) och filtreringslogiken är oförändrad', () => {
    expect(source).toContain('fetch(`/api/invoices?businessId=${business.business_id}`)')
    // 2026-08-26 (medveten spec-ändring, customer_paid): "Betalda"-fliken
    // visar även ROT/RUT-fakturor där kunden betalat sin del — filtret går
    // via isCustomerSettled i stället för strikt status === filter.
    expect(source).toContain("(filter === 'paid' ? isCustomerSettled(inv.status) : inv.status === filter)")
    expect(source).not.toMatch(/\binvoices\s*\.\s*sort\(/)
  })

  test('statusfunktionerna (getStatusStyle/getStatusText) är oförändrade', () => {
    expect(source).toContain("case 'sent': return 'Skickad'")
    expect(source).toContain("case 'paid': return 'Betald'")
    expect(source).toContain("case 'overdue': return 'Förfallen'")
    expect(source).toContain("case 'credited': return 'Krediterad'")
  })

  test('PermissionGate see_financials är kvar oförändrad', () => {
    expect(source).toContain('<PermissionGate permission="see_financials">')
  })

  test('ingen mörk hero läggs till — Fakturor är en ljus sida', () => {
    const matches = source.match(/bg-grad-dark-hero/g) || []
    expect(matches.length).toBe(0)
  })
})
