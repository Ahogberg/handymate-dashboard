/**
 * Första verifierade handlingen — den rena väljaren (2026-08-27).
 *
 *   npx playwright test tests/first-action.spec.ts --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  pickFirstAction,
  firstActionCopy,
  talord,
  FIRST_ACTION_STALE_QUOTE_DAYS,
  type FirstActionInvoiceRow,
  type FirstActionQuoteRow,
} from '../lib/onboarding/first-action'

const TODAY = '2026-08-27'
const NOW = new Date('2026-08-27T09:00:00+02:00').getTime()
const dagarSedan = (n: number) => new Date(NOW - n * 86_400_000).toISOString()

function faktura(over: Partial<FirstActionInvoiceRow> = {}): FirstActionInvoiceRow {
  return {
    invoice_id: 'inv_1',
    invoice_number: '2026-001',
    status: 'overdue',
    due_date: '2026-08-20',
    total: 18_400,
    customer_pays: null,
    rot_rut_type: null,
    reminder_count: 0,
    customer_id: 'cust_1',
    customer_name: 'Anna Andersson',
    customer_phone: '+46701234567',
    ...over,
  }
}

function offert(over: Partial<FirstActionQuoteRow> = {}): FirstActionQuoteRow {
  return {
    quote_id: 'q_1',
    status: 'sent',
    sent_at: dagarSedan(6),
    view_count: 0,
    total: 42_000,
    customer_pays: null,
    customer_id: 'cust_2',
    customer_name: 'Bertil Berg',
    customer_phone: '+46709876543',
    title: 'Badrum',
    ...over,
  }
}

const bas = { today: TODAY, now: NOW, customerCount: 3 }

test.describe('prioritetsordningen', () => {
  test('Karin före Daniel när båda finns', () => {
    const a = pickFirstAction({ ...bas, invoices: [faktura()], quotes: [offert()] })
    expect(a?.kind).toBe('karin_overdue')
  })

  test('Daniel när ingen faktura är förfallen', () => {
    const a = pickFirstAction({ ...bas, invoices: [faktura({ due_date: '2026-09-10' })], quotes: [offert()] })
    expect(a?.kind).toBe('daniel_stale_quote')
  })

  test('utan kunder alls → skapa första kunden (länk, inget kort)', () => {
    const a = pickFirstAction({ ...bas, customerCount: 0, invoices: [], quotes: [] })
    expect(a).toEqual({ kind: 'skapa_kund', href: '/dashboard/customers' })
  })

  test('kunder men inget att göra → null (skanningen behåller "Visa mig")', () => {
    expect(pickFirstAction({ ...bas, invoices: [], quotes: [] })).toBeNull()
  })

  test('enabledTiers styr — bara karin, bara daniel', () => {
    expect(pickFirstAction({ ...bas, invoices: [faktura()], quotes: [offert()], enabledTiers: ['daniel'] })?.kind).toBe('daniel_stale_quote')
    expect(pickFirstAction({ ...bas, invoices: [faktura({ due_date: '2026-09-10' })], quotes: [offert()], enabledTiers: ['karin'] })).toBeNull()
  })
})

test.describe('Karin — förfallna fakturor', () => {
  test('störst belopp först; vid lika belopp mest förfallen', () => {
    const a = pickFirstAction({
      ...bas,
      invoices: [
        faktura({ invoice_id: 'liten', total: 5_000, due_date: '2026-08-01' }),
        faktura({ invoice_id: 'stor_ny', total: 20_000, due_date: '2026-08-25' }),
        faktura({ invoice_id: 'stor_gammal', total: 20_000, due_date: '2026-08-10' }),
      ],
      quotes: [],
    })
    expect(a?.kind).toBe('karin_overdue')
    if (a?.kind !== 'karin_overdue') return
    expect(a.invoiceId).toBe('stor_gammal')
    expect(a.daysOverdue).toBe(17)
    expect(a.overdueCount).toBe(3)
  })

  test('ROT-faktura räknas på kundens del, inte totalen', () => {
    const a = pickFirstAction({
      ...bas,
      invoices: [
        faktura({ invoice_id: 'rot', total: 100_000, customer_pays: 70_000, rot_rut_type: 'rot' }),
        faktura({ invoice_id: 'vanlig', total: 80_000 }),
      ],
      quotes: [],
    })
    expect(a?.kind === 'karin_overdue' && a.invoiceId).toBe('vanlig')
  })

  test('filtreras bort: ej förfallen, förfaller idag, utan telefon, schemat slut, testdata, fel status', () => {
    const a = pickFirstAction({
      ...bas,
      invoices: [
        faktura({ invoice_id: 'framtid', due_date: '2026-09-01' }),
        faktura({ invoice_id: 'idag', due_date: TODAY }),
        faktura({ invoice_id: 'ingen_tel', customer_phone: null }),
        faktura({ invoice_id: 'slut', reminder_count: 4 }),
        faktura({ invoice_id: 'e2e_test_1' }),
        faktura({ invoice_id: 'betald', status: 'paid' }),
        faktura({ invoice_id: 'kundbetald', status: 'customer_paid' }),
      ],
      quotes: [],
    })
    expect(a).toBeNull()
  })

  test('copyn använder radernas värden — en faktura / flera fakturor', () => {
    const en = pickFirstAction({ ...bas, invoices: [faktura()], quotes: [] })!
    expect(firstActionCopy(en)).toEqual({
      headline: `Karin hittade en förfallen faktura på ${(18_400).toLocaleString('sv-SE')} kr. Börja med Anna?`,
      cta: 'Börja med Anna',
      agent: 'karin',
    })
    const tva = pickFirstAction({ ...bas, invoices: [faktura(), faktura({ invoice_id: 'inv_2', total: 100 })], quotes: [] })!
    expect(firstActionCopy(tva).headline).toBe('Karin hittade två förfallna fakturor. Börja med Anna?')
  })
})

test.describe('Daniel — offerter som väntar', () => {
  test(`tröskeln är strikt > ${FIRST_ACTION_STALE_QUOTE_DAYS} dagar (samma som skanningen)`, () => {
    expect(pickFirstAction({ ...bas, invoices: [], quotes: [offert({ sent_at: dagarSedan(5) })] })).toBeNull()
    expect(pickFirstAction({ ...bas, invoices: [], quotes: [offert({ sent_at: dagarSedan(6) })] })?.kind).toBe('daniel_stale_quote')
  })

  test('störst belopp först; vid lika belopp äldst; opened härleds ur view_count', () => {
    const a = pickFirstAction({
      ...bas,
      invoices: [],
      quotes: [
        offert({ quote_id: 'ny', total: 50_000, sent_at: dagarSedan(6) }),
        offert({ quote_id: 'gammal', total: 50_000, sent_at: dagarSedan(12), view_count: 3 }),
        offert({ quote_id: 'liten', total: 1_000, sent_at: dagarSedan(30) }),
      ],
    })
    expect(a?.kind).toBe('daniel_stale_quote')
    if (a?.kind !== 'daniel_stale_quote') return
    expect(a.quoteId).toBe('gammal')
    expect(a.opened).toBe(true)
    expect(a.daysSinceSent).toBe(12)
    expect(a.staleCount).toBe(3)
  })

  test('filtreras bort: fel status, sent_at saknas, utan telefon, testnamn', () => {
    const a = pickFirstAction({
      ...bas,
      invoices: [],
      quotes: [
        offert({ quote_id: 'signerad', status: 'signed' }),
        offert({ quote_id: 'osant', sent_at: null }),
        offert({ quote_id: 'ingen_tel', customer_phone: '' }),
        offert({ quote_id: 'test', customer_name: 'Testkund Testsson' }),
      ],
    })
    expect(a).toBeNull()
  })

  test('copyn: en offert / flera, dagar i talord', () => {
    const en = pickFirstAction({ ...bas, invoices: [], quotes: [offert({ sent_at: dagarSedan(6) })] })!
    expect(firstActionCopy(en)).toEqual({
      headline: 'Daniel hittade en offert som väntat sex dagar. Vill du granska uppföljningen?',
      cta: 'Granska uppföljningen',
      agent: 'daniel',
    })
    const tva = pickFirstAction({ ...bas, invoices: [], quotes: [offert(), offert({ quote_id: 'q_2', total: 10, sent_at: dagarSedan(20) })] })!
    expect(firstActionCopy(tva).headline).toBe('Daniel hittade två offerter som väntar — den äldsta i sex dagar. Vill du granska uppföljningen?')
  })
})

test.describe('copyn hittar inte på', () => {
  test('talord täcker 0–12, större tal formateras som siffror', () => {
    expect(talord(2)).toBe('två')
    expect(talord(12)).toBe('tolv')
    expect(talord(13)).toBe((13).toLocaleString('sv-SE'))
  })

  test('skapa_kund-copyn är den ärliga tomma staten', () => {
    expect(firstActionCopy({ kind: 'skapa_kund', href: '/dashboard/customers' })).toEqual({
      headline: 'Teamet är på plats och redo. Lägg till din första kund så börjar de jobba.',
      cta: 'Lägg till din första kund',
      agent: 'matte',
    })
  })
})
