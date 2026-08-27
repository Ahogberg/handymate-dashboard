import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { buildValueReceipt } from '../lib/approvals/value-receipt'

const ROOT = path.resolve(__dirname, '..')
const approvalPage = fs.readFileSync(path.join(ROOT, 'app/dashboard/approvals/page.tsx'), 'utf8')

test.describe('Distributed Value Receipts — en handling måste ha ett kvitto', () => {
  test('failed, skipped och saknat utfall ger aldrig värdekvitto', () => {
    const approval = { approval_type: 'confirm_payment', payload: { total: 12_500, invoice_id: 'inv_1' } }
    const execution = { action: 'confirm_payment', ok: true }
    expect(buildValueReceipt(approval, execution, 'failed')).toBeNull()
    expect(buildValueReceipt(approval, execution, 'skipped')).toBeNull()
    expect(buildValueReceipt(approval, execution, null)).toBeNull()
  })

  test('confirm_payment kräver ok, faktura-id och positivt belopp', () => {
    expect(buildValueReceipt(
      { approval_type: 'confirm_payment', payload: { total: 12_500, invoice_id: 'inv_1' } },
      { action: 'confirm_payment', ok: true },
      'success',
    )).toEqual({
      text: 'Betalning bekräftad — 12 500 kr inbetalt',
      link: '/dashboard/invoices/inv_1',
      linkLabel: 'Öppna fakturan',
    })
    expect(buildValueReceipt(
      { approval_type: 'confirm_payment', payload: { total: 12_500, invoice_id: 'inv_1' } },
      { action: 'confirm_payment', ok: false },
      'success',
    )).toBeNull()
  })

  test('skickad autofaktura visar exakt payloadbelopp och faktisk fakturalänk', () => {
    expect(buildValueReceipt(
      { approval_type: 'review_auto_invoice', payload: { total: 8_900, invoice_number: '2026-104' } },
      { action: 'review_auto_invoice', invoice_id: 'inv_104' },
      'success',
    )).toEqual({
      text: 'Faktura 2026-104 skickad — 8 900 kr fakturerat',
      link: '/dashboard/invoices/inv_104',
      linkLabel: 'Öppna fakturan',
    })
  })

  test('påminnelse kräver faktiskt sent + executed, inte bara ett success-ord', () => {
    const approval = {
      approval_type: 'invoice_reminder',
      payload: { amount_kr: 18_400, invoice_id: 'inv_2' },
    }
    expect(buildValueReceipt(
      approval,
      { action: 'invoice_reminder', sent: true, executed: true },
      'success',
    )?.text).toBe('Påminnelsen skickad — 18 400 kr bevakas nu')
    expect(buildValueReceipt(
      approval,
      { action: 'invoice_reminder', sent: false, executed: false },
      'success',
    )).toBeNull()
  })

  test('fakturera_projekt säger skickad först när exekveringen bär faktura-id', () => {
    const approval = { approval_type: 'fakturera_projekt', payload: { amount_kr: 24_000 } }
    expect(buildValueReceipt(
      approval,
      { action: 'fakturera_projekt', invoice_id: 'inv_3' },
      'success',
    )?.text).toBe('Faktura skickad — 24 000 kr fakturerat')
    expect(buildValueReceipt(approval, { action: 'fakturera_projekt' }, 'success')).toBeNull()
  })

  test('ÄTA är ett internt utkast att granska — aldrig kundgodkänt arbete', () => {
    const receipt = buildValueReceipt(
      { approval_type: 'create_ata_draft', payload: {} },
      { action: 'create_ata_draft', ok: true, ata_id: 'ata_1', project_id: 'proj_1', total: 7_800 },
      'success',
    )
    expect(receipt).toEqual({
      text: 'ÄTA-utkast skapat — 7 800 kr att granska',
      link: '/dashboard/projects/proj_1',
      linkLabel: 'Öppna projektet',
    })
    expect(receipt?.text).not.toMatch(/godkänt arbete|möjlig intäkt/)
  })

  test('missad_intakt är review-only och får aldrig påstå att underlag skapats', () => {
    expect(buildValueReceipt(
      { approval_type: 'missad_intakt', payload: { amount_kr: 9_250 } },
      { action: 'missad_intakt', executed: false },
      'success',
    )).toBeNull()
  })

  test('noll, negativa, oändliga och fel action ger inget kvitto', () => {
    for (const amount of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(buildValueReceipt(
        { approval_type: 'confirm_payment', payload: { total: amount, invoice_id: 'inv_1' } },
        { action: 'confirm_payment', ok: true },
        'success',
      )).toBeNull()
    }
    expect(buildValueReceipt(
      { approval_type: 'confirm_payment', payload: { total: 1000, invoice_id: 'inv_1' } },
      { action: 'invoice_reminder', ok: true },
      'success',
    )).toBeNull()
  })
})

test.describe('godkännandesidan använder samma kontrakt första gången och vid retry', () => {
  test('inlinekopian är borta och båda vägarna skickar serverutfallet', () => {
    expect(approvalPage).toContain("import { buildValueReceipt } from '@/lib/approvals/value-receipt'")
    expect(approvalPage.match(/buildValueReceipt\(/g)).toHaveLength(2)
    expect(approvalPage).toContain('result.execution_outcome.outcome')
    expect(approvalPage).toContain('result?.execution_outcome?.outcome')
  })

  test('skipped har en egen ärlig gren före värdekvittot', () => {
    const skipped = approvalPage.indexOf("outcome === 'skipped'")
    const receipt = approvalPage.indexOf('const valueReceipt = buildValueReceipt', skipped)
    expect(skipped).toBeGreaterThan(-1)
    expect(receipt).toBeGreaterThan(skipped)
    expect(approvalPage.slice(skipped, receipt)).toContain('ingen handling utfördes')
  })
})

test.describe('send_sms — Daniels uppföljning får ett kvitto utan belopp (2026-08-27)', () => {
  test('kräver sms_sent + sms_id; med quote_id länkas offerten, annars bara "SMS skickat"', () => {
    expect(buildValueReceipt(
      { approval_type: 'send_sms', payload: { quote_id: 'q_1', customer_name: 'Anna Andersson', related_id: 'q_1' } },
      { action: 'send_sms', sms_sent: true, sms_id: 'sms_1' },
      'success',
    )).toEqual({ text: 'Uppföljning skickad till Anna Andersson', link: '/dashboard/quotes/q_1', linkLabel: 'Öppna offerten' })
    expect(buildValueReceipt(
      { approval_type: 'send_sms', payload: { customer_name: 'Anna Andersson' } },
      { action: 'send_sms', sms_sent: true, sms_id: 'sms_1' },
      'success',
    )).toEqual({ text: 'SMS skickat till Anna Andersson' })
    expect(buildValueReceipt(
      { approval_type: 'send_sms', payload: { quote_id: 'q_1' } },
      { action: 'send_sms', sms_sent: false, error: 'STOPP' },
      'success',
    )).toBeNull()
    expect(buildValueReceipt(
      { approval_type: 'send_sms', payload: { quote_id: 'q_1' } },
      { action: 'send_sms', sms_sent: true },
      'success',
    )).toBeNull()
  })
})

test.describe('RECEIPT_APPROVAL_TYPES speglar kvittots case-satser (aktiveringsmåtten läser listan)', () => {
  test('varje typ i listan har ett case, och varje case finns i listan', () => {
    const { RECEIPT_APPROVAL_TYPES } = require('../lib/approvals/value-receipt')
    const src = fs.readFileSync(path.join(ROOT, 'lib/approvals/value-receipt.ts'), 'utf8')
    const switchStart = src.indexOf('switch (approval.approval_type)')
    const cases = Array.from(src.slice(switchStart).matchAll(/case '([a-z_]+)':/g)).map(m => m[1])
    expect([...cases].sort()).toEqual([...RECEIPT_APPROVAL_TYPES].sort())
  })
})
