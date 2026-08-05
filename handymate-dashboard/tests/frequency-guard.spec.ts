/**
 * VP1 (gap 9 + gap 7, tasks/vilande-pengar-masterplan.md) — facit-tester
 * för de rena, DB-fria delarna:
 *   - lib/outbound/frequency-guard.ts: fönsterlogik + kandidat-matchning
 *   - lib/sms-send.ts: STOPP/START-kommandotolkningen
 *
 * canContactCustomer() (I/O-delen, DB-anrop) testas INTE här — kräver en
 * riktig Supabase-klient. Se lib/outbound/frequency-guard.ts.
 *
 * Körs: npx playwright test tests/frequency-guard.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  isWithinFrequencyWindow,
  findRecentApprovalForCustomer,
  FREQUENCY_WINDOW_DAYS,
} from '../lib/outbound/frequency-guard'
import { parseOptOutCommand } from '../lib/sms-send'

const NOW = new Date('2026-08-05T12:00:00.000Z').getTime()

test.describe('isWithinFrequencyWindow', () => {
  test('en rad skapad idag är inom fönstret', () => {
    expect(isWithinFrequencyWindow('2026-08-05T08:00:00.000Z', NOW)).toBe(true)
  })

  test('en rad skapad exakt vid fönstrets gräns räknas som inom', () => {
    const windowStart = new Date(NOW - FREQUENCY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()
    expect(isWithinFrequencyWindow(windowStart, NOW)).toBe(true)
  })

  test('en rad skapad 8 dagar sedan (utanför 7-dagarsfönstret) räknas som utanför', () => {
    const eightDaysAgo = new Date(NOW - 8 * 24 * 60 * 60 * 1000).toISOString()
    expect(isWithinFrequencyWindow(eightDaysAgo, NOW)).toBe(false)
  })

  test('null/undefined created_at räknas som utanför (fail-safe, inte en match)', () => {
    expect(isWithinFrequencyWindow(null, NOW)).toBe(false)
    expect(isWithinFrequencyWindow(undefined, NOW)).toBe(false)
  })

  test('ogiltig datumsträng räknas som utanför, kraschar inte', () => {
    expect(isWithinFrequencyWindow('inte-ett-datum', NOW)).toBe(false)
  })

  test('anpassat fönster (t.ex. 30 dagar) respekteras', () => {
    const twentyDaysAgo = new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString()
    expect(isWithinFrequencyWindow(twentyDaysAgo, NOW, 7)).toBe(false)
    expect(isWithinFrequencyWindow(twentyDaysAgo, NOW, 30)).toBe(true)
  })
})

test.describe('findRecentApprovalForCustomer', () => {
  test('hittar en matchande rad för rätt customer_id inom fönstret', () => {
    const rows = [
      { payload: { customer_id: 'cust_1' }, created_at: '2026-08-04T10:00:00.000Z' },
      { payload: { customer_id: 'cust_2' }, created_at: '2026-08-04T10:00:00.000Z' },
    ]
    const hit = findRecentApprovalForCustomer(rows, 'cust_1', NOW)
    expect(hit).not.toBeNull()
    expect((hit?.payload as any).customer_id).toBe('cust_1')
  })

  test('ingen träff om customer_id inte finns bland raderna', () => {
    const rows = [{ payload: { customer_id: 'cust_2' }, created_at: '2026-08-04T10:00:00.000Z' }]
    expect(findRecentApprovalForCustomer(rows, 'cust_1', NOW)).toBeNull()
  })

  test('ingen träff om raden är utanför fönstret trots rätt customer_id', () => {
    const rows = [{ payload: { customer_id: 'cust_1' }, created_at: '2026-07-01T10:00:00.000Z' }]
    expect(findRecentApprovalForCustomer(rows, 'cust_1', NOW)).toBeNull()
  })

  test('rader utan payload.customer_id ignoreras, kraschar inte', () => {
    const rows = [{ payload: {}, created_at: '2026-08-04T10:00:00.000Z' }, { payload: null, created_at: '2026-08-04T10:00:00.000Z' }] as any
    expect(findRecentApprovalForCustomer(rows, 'cust_1', NOW)).toBeNull()
  })

  test('customer_id jämförs som sträng även om payload har ett nummer', () => {
    const rows = [{ payload: { customer_id: 123 }, created_at: '2026-08-04T10:00:00.000Z' }] as any
    expect(findRecentApprovalForCustomer(rows, '123', NOW)).not.toBeNull()
  })
})

test.describe('parseOptOutCommand (STOPP/START-tolkningen)', () => {
  test('STOPP, STOP och SLUTA tolkas som stop', () => {
    expect(parseOptOutCommand('STOPP')).toBe('stop')
    expect(parseOptOutCommand('STOP')).toBe('stop')
    expect(parseOptOutCommand('SLUTA')).toBe('stop')
  })

  test('gemener och omgivande whitespace tolkas ändå korrekt', () => {
    expect(parseOptOutCommand('stopp')).toBe('stop')
    expect(parseOptOutCommand('  Stopp  ')).toBe('stop')
    expect(parseOptOutCommand('\tsluta\n')).toBe('stop')
  })

  test('START och STARTA tolkas som start', () => {
    expect(parseOptOutCommand('START')).toBe('start')
    expect(parseOptOutCommand('starta')).toBe('start')
  })

  test('fritext som innehåller ordet men inte ÄR ordet tolkas INTE som ett kommando', () => {
    expect(parseOptOutCommand('stoppa lite tack')).toBeNull()
    expect(parseOptOutCommand('Kan ni stoppa SMS:en?')).toBeNull()
    expect(parseOptOutCommand('jag vill starta om')).toBeNull()
  })

  test('vanliga kundsvar tolkas inte som kommandon', () => {
    expect(parseOptOutCommand('Ja tack, det passar bra!')).toBeNull()
    expect(parseOptOutCommand('')).toBeNull()
  })
})
