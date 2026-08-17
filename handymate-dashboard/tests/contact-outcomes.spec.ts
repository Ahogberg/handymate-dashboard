/**
 * FACIT — lib/mission/contact-outcomes.ts (Etapp I: kontaktmål,
 * tasks/jaunty-pondering-hummingbird.md).
 *
 * Vaktposterna som låses här:
 *  - ingen exekvering (outcome !== 'success') → inte kontaktad
 *  - dedup per kund: två lyckade utskick till samma kund → EN kontaktrad,
 *    med den TIDIGASTE exekveringen som kontakttillfälle
 *  - svarsfönstret är [executed_at, executed_at + windowDays dygn], BÅDA
 *    gränserna inklusive
 *  - inbound FÖRE kontakten räknas aldrig som svar
 *  - framtida inbound-tidsstämplar (bortom nowMs) ignoreras defensivt
 *
 * Körs: npx playwright test tests/contact-outcomes.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  deriveContactOutcomes,
  type ContactApprovalInput,
  type InboundCommunicationInput,
} from '../lib/mission/contact-outcomes'

const EXECUTED = '2026-08-01T10:00:00Z'
const NOW_MS = Date.parse('2026-08-20T12:00:00Z')

function godkant(overrides: Partial<ContactApprovalInput> = {}): ContactApprovalInput {
  return {
    customer_id: 'cust_1',
    resolved_at: EXECUTED,
    outcome: 'success',
    ...overrides,
  }
}

test.describe('deriveContactOutcomes — vem räknas som kontaktad', () => {
  test('lyckad exekvering med kundreferens → en ContactOutcome', () => {
    const res = deriveContactOutcomes([godkant()], [], 7, NOW_MS)
    expect(res).toHaveLength(1)
    // deriveContactOutcomes normaliserar executed_at via new Date().toISOString()
    // (millisekunder tillagda) — jämför mot samma normalisering, inte input-strängen.
    expect(res[0]).toEqual({
      customer_id: 'cust_1',
      executed_at: new Date(EXECUTED).toISOString(),
      replied_within_window: false,
    })
  })

  test('outcome "failed" → INTE kontaktad (ingen exekvering)', () => {
    const res = deriveContactOutcomes([godkant({ outcome: 'failed' })], [], 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('outcome "skipped" → INTE kontaktad', () => {
    const res = deriveContactOutcomes([godkant({ outcome: 'skipped' })], [], 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('saknad customer_id → INTE kontaktad', () => {
    const res = deriveContactOutcomes([godkant({ customer_id: null })], [], 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('saknad resolved_at (ingen exekveringstid) → INTE kontaktad', () => {
    const res = deriveContactOutcomes([godkant({ resolved_at: null })], [], 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('pending-godkännande (aldrig exekverat) → INTE kontaktad', () => {
    const res = deriveContactOutcomes([godkant({ outcome: null, resolved_at: null })], [], 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('två lyckade utskick till SAMMA kund → EN kontaktrad, tidigaste exekveringen vinner', () => {
    const res = deriveContactOutcomes(
      [
        godkant({ resolved_at: '2026-08-05T10:00:00Z' }),
        godkant({ resolved_at: '2026-08-01T10:00:00Z' }), // tidigare
      ],
      [],
      7,
      NOW_MS,
    )
    expect(res).toHaveLength(1)
    expect(res[0].executed_at).toBe(new Date('2026-08-01T10:00:00Z').toISOString())
  })

  test('två OLIKA kunder → två separata kontaktrader', () => {
    const res = deriveContactOutcomes(
      [godkant({ customer_id: 'cust_1' }), godkant({ customer_id: 'cust_2' })],
      [],
      7,
      NOW_MS,
    )
    expect(res.map(o => o.customer_id).sort()).toEqual(['cust_1', 'cust_2'])
  })
})

test.describe('deriveContactOutcomes — svarsfönstret (7 dagar, båda gränserna inklusive)', () => {
  test('inbound samma dag som kontakten → svar', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-01T11:00:00Z' }]
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(true)
  })

  test('inbound exakt på dag 7 (gränsen) → svar (inklusive)', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-08T10:00:00Z' }]
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(true)
  })

  test('inbound dag 8 (utanför fönstret) → inget svar', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-09T10:00:01Z' }]
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(false)
  })

  test('inbound FÖRE kontakten räknas aldrig som svar', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-07-31T09:00:00Z' }]
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(false)
  })

  test('inbound från en ANNAN kund räknas aldrig som svar för den kontaktade kunden', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_annan', timestamp: '2026-08-02T09:00:00Z' }]
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(false)
  })

  test('ingen kontaktad kund → tom lista, oavsett inbound', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-02T09:00:00Z' }]
    const res = deriveContactOutcomes([], inbound, 7, NOW_MS)
    expect(res).toEqual([])
  })

  test('inbound-tidsstämpel bortom nowMs (framtida, datadefensivt) ignoreras', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-25T09:00:00Z' }] // efter NOW_MS
    const res = deriveContactOutcomes([godkant()], inbound, 7, NOW_MS)
    expect(res[0].replied_within_window).toBe(false)
  })

  test('anpassat windowDays respekteras (t.ex. 3 dagar)', () => {
    const inbound: InboundCommunicationInput[] = [{ customer_id: 'cust_1', timestamp: '2026-08-04T10:00:00Z' }] // dag 3
    const res3 = deriveContactOutcomes([godkant()], inbound, 3, NOW_MS)
    expect(res3[0].replied_within_window).toBe(true)
    const res2 = deriveContactOutcomes([godkant()], inbound, 2, NOW_MS)
    expect(res2[0].replied_within_window).toBe(false)
  })
})
