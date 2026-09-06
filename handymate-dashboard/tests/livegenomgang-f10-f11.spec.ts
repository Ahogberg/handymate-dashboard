/**
 * Facit: driftfynd F10 och F11 från Codex livegenomgång på Nordström El
 * (PR #16, 2026-09-06).
 *
 *  - F10: ÄTA-formulärets "Intern notering" (project_change.notes) ritades i
 *    ÄTA-PDF:en under ANTECKNINGAR — samma PDF som kunden får via
 *    /api/ata/sign/[token]/pdf. Noteringen är intern (Pass F lägger även
 *    kortets id där som idempotensmarkör) och får aldrig nå kunden.
 *  - F11: ett oskickat fakturautkast (FV-2026-003, due_date i maj) visades
 *    som förfallet med dröjsmålsränta i dokumentvyn: 625 kr i listan, 637 kr
 *    i dokumentet. deriveStatus räknade förfallodagar utan att se statusen.
 */
import { test, expect } from '@playwright/test'
import * as fs from 'fs'
import * as path from 'path'
import { deriveStatus, buildInvoiceTemplateData } from '../lib/invoice-templates/data-builder'

const ROOT = path.join(__dirname, '..')
const read = (f: string) => fs.readFileSync(path.join(ROOT, f), 'utf8')
const utanKommentarer = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

test.describe('F10 — den interna noteringen når aldrig kundens ÄTA-dokument', () => {
  test('ÄTA-PDF:en läser inte notes och har inget ANTECKNINGAR-block', () => {
    const src = utanKommentarer(read('lib/ata/pdf.ts'))
    expect(src).not.toMatch(/\bnotes\b/)
    expect(src).not.toContain('ANTECKNINGAR')
  })

  test('kundens sign-API plockar fält uttryckligen och skickar inte notes', () => {
    const src = utanKommentarer(read('app/api/ata/sign/[token]/route.ts'))
    const svar = src.slice(src.indexOf('ata: {'), src.indexOf('signed_by_name'))
    expect(svar).toContain('description: ata.description')
    expect(svar).not.toContain('notes')
  })

  test('formuläret kallar fältet en intern notering — så det får aldrig bli en kundtext', () => {
    const src = read('components/projects/ata/ChangeModal.tsx')
    expect(src).toContain('placeholder="Intern notering…"')
  })
})

test.describe('F11 — ett utkast är aldrig förfallet och får ingen ränta', () => {
  const DAG = 24 * 60 * 60 * 1000
  const forSedan = (d: number) => new Date(Date.now() - d * DAG).toISOString().slice(0, 10)

  test('draft, cancelled och credited med passerat förfallodatum ⇒ unpaid, 0 dagar', () => {
    for (const status of ['draft', 'cancelled', 'credited']) {
      expect(deriveStatus({ status, due_date: forSedan(88) }), status).toEqual({ status: 'unpaid', daysOverdue: 0 })
    }
  })

  test('en skickad faktura med samma förfallodatum är fortfarande förfallen (regeln smittar inte)', () => {
    const r = deriveStatus({ status: 'sent', due_date: forSedan(88) })
    expect(r.status).toBe('overdue')
    expect(r.daysOverdue).toBeGreaterThanOrEqual(87)
  })

  test('FV-2026-003: utkastet visar 625 kr i dokumentet, inte 637 kr', () => {
    const faktura = {
      invoice_id: 'ef58594a', invoice_number: 'FV-2026-003', status: 'draft', invoice_type: 'final',
      invoice_date: '2026-05-11', due_date: forSedan(88), sent_at: null,
      subtotal: 500, vat_rate: 25, vat_amount: 125, total: 625, customer_pays: 625, items: [],
    }
    const utkast = buildInvoiceTemplateData(faktura, { business_name: 'Nordström El AB', penalty_interest: 8 }, null)
    expect(utkast.invoice.status).toBe('unpaid')
    expect(utkast.invoice.lateInterest).toBeUndefined()
    expect(utkast.invoice.amountToPay).toBe(625)

    const skickad = buildInvoiceTemplateData({ ...faktura, status: 'sent', sent_at: '2026-05-11T10:00:00Z' }, { business_name: 'Nordström El AB', penalty_interest: 8 }, null)
    expect(skickad.invoice.status).toBe('overdue')
    expect(skickad.invoice.lateInterest).toBeGreaterThan(11)
    expect(skickad.invoice.amountToPay).toBeGreaterThan(636)
  })
})
