/**
 * Karins påminnelsekort — en byggare, två anropare (2026-08-27).
 *
 * Lib:en är verbatim-flyttad ur cronen; det här facitet låser (1) att
 * stegkompositionen ger cronens värden, (2) att cronen faktiskt använder
 * lib:en i stället för egna kopior, och (3) att dedup-nyckeln
 * (payload.invoice_id på ett pending-kort) är densamma i båda.
 *
 *   npx playwright test tests/invoice-reminder-card.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  composeReminderStep,
  calculateInterest,
  DEFAULT_SCHEDULE,
  type ReminderConfig,
} from '../lib/invoice-reminder-card'

const ROOT = path.resolve(__dirname, '..')
const kod = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')

const cfg: ReminderConfig = {
  auto_reminder_enabled: true,
  auto_reminder_days: 7,
  reminder_fee: 60,
  penalty_interest: 8,
  late_fee_percent: 8,
  max_auto_reminders: 3,
  reminder_sms_template: null,
  business_name: 'Bee El & Bygg',
  display_name: null,
  bankgiro: '123-4567',
  swish_number: null,
  phone_number: null,
  assigned_phone_number: null,
}

const inv = {
  invoice_id: 'inv_1',
  invoice_number: '2026-001',
  ocr_number: '20260011',
  due_date: '2026-08-10',
  business_id: 'biz_1',
  customer_id: 'cust_1',
  total: 18_400,
  customer_pays: null,
  rot_rut_type: null,
  reminder_count: 0,
}
const customer = { name: 'Anna Andersson', phone_number: '+46701234567', email: 'anna@example.se' }
const today = new Date('2026-08-27T10:00:00+02:00')

test.describe('composeReminderStep — cronens beräkning, utan cronens tidsvakt', () => {
  test('nivå, dagar, belopp, nästa steg och leverans-input som cronen', () => {
    const step = composeReminderStep({ inv, customer, cfg, today })
    expect(step.level).toBe('friendly')
    expect(step.emailToo).toBe(false)
    expect(step.daysOverdue).toBe(17)
    expect(step.amountToPay).toBe(18_400)
    expect(step.currentCount).toBe(0)
    expect(step.nextCount).toBe(1)
    expect(step.reminderDays).toEqual([7, 14, 28, 56])
    expect(step.requiredDays).toBe(7)
    expect(step.deliveryInput).toMatchObject({
      invoiceId: 'inv_1',
      invoiceNumber: '2026-001',
      businessId: 'biz_1',
      customerId: 'cust_1',
      businessName: 'Bee El & Bygg',
      customerPhone: '+46701234567',
      customerEmail: 'anna@example.se',
      emailToo: false,
      level: 'friendly',
      currentCount: 0,
      reminderFee: 60,
      penaltyInterest: 8,
      daysOverdue: 17,
    })
    expect(step.messages.sms).toContain('2026-001')
    expect(step.messages.sms).toContain('OCR: 20260011')
    // nästa påminnelse: 14 dagar efter förfall, eftersom nextCount 1 < max 3
    expect(step.nextReminderAt).toBe(new Date(new Date('2026-08-10').getTime() + 14 * 86_400_000).toISOString())
  })

  test('steg 2 blir "firm" med e-post; ROT räknas på kundens del; schemat tar slut → requiredDays undefined', () => {
    const firm = composeReminderStep({ inv: { ...inv, reminder_count: 1, rot_rut_type: 'rot', customer_pays: 12_880 }, customer, cfg, today })
    expect(firm.level).toBe('firm')
    expect(firm.emailToo).toBe(true)
    expect(firm.amountToPay).toBe(12_880)
    expect(firm.requiredDays).toBe(14)
    const slut = composeReminderStep({ inv: { ...inv, reminder_count: 4 }, customer, cfg, today })
    expect(slut.level).toBe('final')
    expect(slut.requiredDays).toBeUndefined()
    expect(slut.nextReminderAt).toBeNull()
  })

  test('dröjsmålsräntan är enkel årsränta / 365 × dagar, aldrig negativ', () => {
    expect(calculateInterest(10_000, 8, 365)).toBeCloseTo(800, 5)
    expect(calculateInterest(10_000, 0, 30)).toBe(0)
    expect(calculateInterest(0, 8, 30)).toBe(0)
    expect(DEFAULT_SCHEDULE.map(s => s.level)).toEqual(['friendly', 'firm', 'formal', 'final'])
  })
})

test.describe('cronen använder lib:en — inga egna kopior kvar', () => {
  const cron = kod('app/api/cron/send-reminders/route.ts')
  const lib = kod('lib/invoice-reminder-card.ts')

  test('cronen importerar config, steg och kort från lib:en', () => {
    expect(cron).toContain("from '@/lib/invoice-reminder-card'")
    expect(cron).toContain('configMap[bizId] = await loadReminderConfig(supabase, bizId)')
    expect(cron).toContain('const step = composeReminderStep({ inv, customer, cfg, today })')
    expect(cron).toContain('const kort = await createInvoiceReminderCard(supabase, { businessId: inv.business_id, inv, customer, step, capExceeded })')
    // Tidsvakten bor kvar i cronen
    expect(cron).toContain('if (!step.requiredDays || step.daysOverdue < step.requiredDays) continue')
    expect(cron).toContain('if (currentCount >= cfg.max_auto_reminders) continue')
  })

  test('inga lokala definitioner av det som flyttat', () => {
    for (const namn of ['function getReminderMessage(', 'function generateEmailContent(', 'function calculateInterest(', 'const DEFAULT_SCHEDULE =']) {
      expect(cron, `${namn} finns kvar i cronen`).not.toContain(namn)
    }
    expect(cron).not.toContain("from '@/lib/ocr'")
    expect(cron).not.toContain("from '@/lib/sms-reply-number'")
  })

  test('dedup-nyckeln är densamma: pending-kort med payload.invoice_id', () => {
    expect(lib).toContain(".eq('approval_type', 'invoice_reminder')")
    expect(lib).toContain(".eq('status', 'pending')")
    expect(lib).toContain(".contains('payload', { invoice_id: inv.invoice_id })")
    // Payloadens toppnivå (innehållskontraktet) + delivery orört
    for (const falt of ['invoice_id: inv.invoice_id', "autonomy_key: 'invoice_reminder'", 'amount_kr: step.amountToPay', 'customer_name: customer?.name ?? null', 'invoice_number: inv.invoice_number', 'days_overdue: step.daysOverdue', 'delivery: step.deliveryInput']) {
      expect(lib, `${falt} saknas i kortets payload`).toContain(falt)
    }
    // Lib:en skickar aldrig något själv
    expect(lib).not.toContain('deliverInvoiceReminder(')
    expect(lib).not.toContain('sendSmsViaElks')
    expect(lib).not.toContain('/api/push/send')
  })
})
