/**
 * Facit-tester för Återvunnet-kärnan (VP2 gap 2,
 * tasks/vilande-pengar-masterplan.md) — de RENA funktionerna i
 * lib/value/recovered-revenue.ts. I/O-funktionen (getRecoveredRevenue)
 * testas medvetet inte här — den är ett tunt fail-soft-skal runt kärnan.
 *
 * Masterplanens hårdaste krav testas här: dubbelattribution förbjuden
 * (en intäkt räknas EN gång även om två kort föregick den — senaste
 * kortet vinner), exakta fönstergränser, faktura/offert-dedupe.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/recovered-revenue.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  attributeRevenue,
  sumRecoveredKr,
  mapApprovalRowToCard,
  isWithinAttributionWindow,
  ATTRIBUTION_WINDOW_DAYS,
  type ApprovedCard,
  type RevenueEvent,
} from '../lib/value/recovered-revenue'

const DAY_MS = 24 * 60 * 60 * 1000
// Fast tidsankare — aldrig Date.now() i facit-tester.
const T0 = new Date('2026-08-05T12:00:00.000Z').getTime()

function card(overrides: Partial<ApprovedCard> = {}): ApprovedCard {
  return {
    id: 'appr_1',
    approval_type: 'send_sms',
    resolved_at_ms: T0,
    customer_id: 'cust_1',
    quote_id: null,
    agent: null,
    ...overrides,
  }
}

function event(overrides: Partial<RevenueEvent> = {}): RevenueEvent {
  return {
    kind: 'quote_accepted',
    event_id: 'quote_1',
    customer_id: 'cust_1',
    amount_kr: 10000,
    occurred_at_ms: T0 + 3 * DAY_MS,
    label: 'Offert accepterad',
    ...overrides,
  }
}

test.describe('isWithinAttributionWindow — exakta fönstergränser', () => {
  test('exakt 14 dagar efter kortet räknas (inklusiv gräns, offert)', () => {
    expect(isWithinAttributionWindow(T0, T0 + 14 * DAY_MS, 'quote_accepted')).toBe(true)
  })

  test('14 dagar + 1 ms räknas INTE', () => {
    expect(isWithinAttributionWindow(T0, T0 + 14 * DAY_MS + 1, 'quote_accepted')).toBe(false)
  })

  test('händelse FÖRE kortets godkännande räknas aldrig', () => {
    expect(isWithinAttributionWindow(T0, T0 - 1, 'quote_accepted')).toBe(false)
  })

  test('händelse exakt vid godkännandet räknas (delta 0)', () => {
    expect(isWithinAttributionWindow(T0, T0, 'invoice_paid')).toBe(true)
  })

  test('bokningsfönstret är 7 dagar — dag 7 ok, dag 7 + 1 ms inte', () => {
    expect(isWithinAttributionWindow(T0, T0 + 7 * DAY_MS, 'booking_created')).toBe(true)
    expect(isWithinAttributionWindow(T0, T0 + 7 * DAY_MS + 1, 'booking_created')).toBe(false)
  })

  test('fönsterkonstanterna är de masterplanen specificerar', () => {
    expect(ATTRIBUTION_WINDOW_DAYS).toEqual({ quote_accepted: 14, invoice_paid: 14, booking_created: 7 })
  })
})

test.describe('attributeRevenue — senaste kortet vinner, en händelse räknas en gång', () => {
  test('två kort före samma händelse → det SENAST godkända vinner, händelsen räknas EN gång', () => {
    const cards = [
      card({ id: 'appr_old', resolved_at_ms: T0 }),
      card({ id: 'appr_new', resolved_at_ms: T0 + 2 * DAY_MS }),
    ]
    const result = attributeRevenue(cards, [event({ occurred_at_ms: T0 + 3 * DAY_MS })])
    expect(result).toHaveLength(1)
    expect(result[0].card_id).toBe('appr_new')
  })

  test('kort utanför fönstret deltar inte — det äldre men giltiga vinner', () => {
    const cards = [
      card({ id: 'appr_giltigt', resolved_at_ms: T0 }),
      card({ id: 'appr_efter', resolved_at_ms: T0 + 5 * DAY_MS }), // godkänt EFTER händelsen
    ]
    const result = attributeRevenue(cards, [event({ occurred_at_ms: T0 + 3 * DAY_MS })])
    expect(result).toHaveLength(1)
    expect(result[0].card_id).toBe('appr_giltigt')
  })

  test('direkt offertreferens slår senare kundmatch-kort', () => {
    const cards = [
      card({ id: 'appr_direkt', quote_id: 'quote_1', customer_id: null, resolved_at_ms: T0 }),
      card({ id: 'appr_kund', resolved_at_ms: T0 + 2 * DAY_MS }),
    ]
    const result = attributeRevenue(cards, [event({ occurred_at_ms: T0 + 3 * DAY_MS })])
    expect(result).toHaveLength(1)
    expect(result[0].card_id).toBe('appr_direkt')
  })

  test('ingen kund- eller offertmatch → ingen attribution (hellre missad än falsk)', () => {
    const cards = [card({ customer_id: 'cust_ANNAN' })]
    const result = attributeRevenue(cards, [event()])
    expect(result).toHaveLength(0)
  })

  test('ett kort KAN attribuera flera separata händelser (två fakturor = två intäkter)', () => {
    const cards = [card()]
    const result = attributeRevenue(cards, [
      event({ kind: 'invoice_paid', event_id: 'inv_1', occurred_at_ms: T0 + 2 * DAY_MS }),
      event({ kind: 'invoice_paid', event_id: 'inv_2', occurred_at_ms: T0 + 4 * DAY_MS }),
    ])
    expect(result).toHaveLength(2)
    expect(result.map(a => a.event_id).sort()).toEqual(['inv_1', 'inv_2'])
  })
})

test.describe('attributeRevenue — faktura/offert-dedupe (samma pengar räknas aldrig två gånger)', () => {
  test('betald faktura vars offert redan attribuerats SKIPPAS', () => {
    const cards = [card()]
    const result = attributeRevenue(cards, [
      event({ kind: 'quote_accepted', event_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 2 * DAY_MS }),
      event({ kind: 'invoice_paid', event_id: 'inv_1', quote_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 10 * DAY_MS }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].event_kind).toBe('quote_accepted')
    expect(sumRecoveredKr(result)).toBe(50000)
  })

  test('dedupen gäller oavsett input-ordning (fakturan given före offerten)', () => {
    const cards = [card()]
    const result = attributeRevenue(cards, [
      event({ kind: 'invoice_paid', event_id: 'inv_1', quote_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 10 * DAY_MS }),
      event({ kind: 'quote_accepted', event_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 2 * DAY_MS }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].event_kind).toBe('quote_accepted')
  })

  test('faktura utan quote_id attribueras normalt', () => {
    const cards = [card()]
    const result = attributeRevenue(cards, [
      event({ kind: 'invoice_paid', event_id: 'inv_1', quote_id: null, amount_kr: 8000, occurred_at_ms: T0 + 5 * DAY_MS }),
    ])
    expect(result).toHaveLength(1)
    expect(sumRecoveredKr(result)).toBe(8000)
  })

  test('faktura vars offert INTE attribuerades (inget kort matchade offerten) räknas', () => {
    // Offerten accepterades utanför kortets fönster → oattribuerad; fakturan
    // betalades inom fönstret → den räknas (pengarna har inte räknats innan).
    const cards = [card({ resolved_at_ms: T0 })]
    const result = attributeRevenue(cards, [
      event({ kind: 'quote_accepted', event_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 20 * DAY_MS }),
      event({ kind: 'invoice_paid', event_id: 'inv_1', quote_id: 'quote_1', amount_kr: 50000, occurred_at_ms: T0 + 13 * DAY_MS }),
    ])
    expect(result).toHaveLength(1)
    expect(result[0].event_kind).toBe('invoice_paid')
  })
})

test.describe('attributeRevenue — bokningar är händelser, inte kronor', () => {
  test('bokning attribueras med 0 kr och höjer aldrig summan', () => {
    const cards = [card()]
    const result = attributeRevenue(cards, [
      event({ kind: 'booking_created', event_id: 'book_1', amount_kr: 0, occurred_at_ms: T0 + 3 * DAY_MS }),
      event({ kind: 'quote_accepted', event_id: 'quote_1', amount_kr: 12000, occurred_at_ms: T0 + 3 * DAY_MS }),
    ])
    expect(result).toHaveLength(2)
    expect(sumRecoveredKr(result)).toBe(12000)
  })
})

test.describe('mapApprovalRowToCard — rå DB-rad till kort', () => {
  test('resolved_at används, created_at är fallback, ingendera → null', () => {
    const base = { id: 'a', approval_type: 'send_sms', payload: {} }
    expect(
      mapApprovalRowToCard({ ...base, resolved_at: '2026-08-01T00:00:00Z', created_at: '2026-07-01T00:00:00Z' })!
        .resolved_at_ms,
    ).toBe(new Date('2026-08-01T00:00:00Z').getTime())
    expect(
      mapApprovalRowToCard({ ...base, resolved_at: null, created_at: '2026-07-01T00:00:00Z' })!.resolved_at_ms,
    ).toBe(new Date('2026-07-01T00:00:00Z').getTime())
    expect(mapApprovalRowToCard({ ...base, resolved_at: null, created_at: null })).toBeNull()
  })

  test('related_id tolkas som offertreferens BARA för offertjaktens korttyper', () => {
    const ts = { resolved_at: '2026-08-01T00:00:00Z' }
    expect(
      mapApprovalRowToCard({ id: 'a', approval_type: 'quote_nudge', ...ts, payload: { related_id: 'quote_9' } })!
        .quote_id,
    ).toBe('quote_9')
    expect(
      mapApprovalRowToCard({ id: 'a', approval_type: 'send_sms', ...ts, payload: { related_id: 'quote_9' } })!
        .quote_id,
    ).toBe('quote_9')
    // proactive_care: related_id är project_id — får INTE bli offertreferens
    expect(
      mapApprovalRowToCard({ id: 'a', approval_type: 'proactive_care', ...ts, payload: { related_id: 'proj_1' } })!
        .quote_id,
    ).toBeNull()
    // explicit payload.quote_id gäller alltid
    expect(
      mapApprovalRowToCard({ id: 'a', approval_type: 'proactive_care', ...ts, payload: { quote_id: 'quote_3' } })!
        .quote_id,
    ).toBe('quote_3')
  })

  test('kund och agent plockas ur payload/routed_agent', () => {
    const row = {
      id: 'a',
      approval_type: 'proactive_care',
      resolved_at: '2026-08-01T00:00:00Z',
      payload: { customer_id: 'cust_7', agent: 'hanna' },
    }
    const mapped = mapApprovalRowToCard(row)!
    expect(mapped.customer_id).toBe('cust_7')
    expect(mapped.agent).toBe('hanna')
    expect(mapApprovalRowToCard({ ...row, routed_agent: 'karin' })!.agent).toBe('karin')
  })
})
