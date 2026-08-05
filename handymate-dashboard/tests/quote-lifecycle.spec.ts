/**
 * Facit-tester för offertens livscykel-statusar (trackingfixarna 2026-08-05).
 *
 * Bakgrund: en verifiering av hela händelsekedjan hittade tre hål —
 * "öppnad" sattes nästan aldrig (portalen loggade inget), portalens accept
 * var en stympad variant utan projekt/deal, och portalens avböjande tappade
 * både declined_at och skäl. Dessutom fastnade fyra-ögon-avslagna offerter i
 * en status ingen del av systemet känner igen.
 *
 * De här testerna låser fast STATUSKONTRAKTET som allt det bygger på.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-lifecycle.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  OPEN_QUOTE_STATUSES,
  WON_QUOTE_STATUSES,
  LOST_QUOTE_STATUSES,
} from '../lib/quotes/statuses'

/** Varje värde som faktiskt skrivs till quotes.status någonstans i koden. */
const WRITTEN_STATUSES = [
  'draft',
  'sent',
  'opened',
  'accepted',
  'declined',
  'expired',
  'pending_approval',
] as const

test.describe('statuskonstanterna speglar verkligheten', () => {
  test('öppna statusar är exakt sent och opened', () => {
    expect([...OPEN_QUOTE_STATUSES]).toEqual(['sent', 'opened'])
  })

  test('konstanterna överlappar aldrig varandra', () => {
    const won = new Set<string>(WON_QUOTE_STATUSES)
    const lost = new Set<string>(LOST_QUOTE_STATUSES)
    for (const status of OPEN_QUOTE_STATUSES) {
      expect(won.has(status), `${status} är både öppen och vunnen`).toBe(false)
      expect(lost.has(status), `${status} är både öppen och förlorad`).toBe(false)
    }
    for (const status of WON_QUOTE_STATUSES) {
      expect(lost.has(status), `${status} är både vunnen och förlorad`).toBe(false)
    }
  })

  test('varje skriven status är antingen klassificerad eller medvetet ostadd', () => {
    // draft och pending_approval är avsiktligt utanför de tre grupperna:
    // de är arbetslägen, inte utfall. Alla ANDRA skrivna värden MÅSTE
    // klassificeras — annars försvinner offerter ur uppföljning och statistik,
    // vilket är precis vad som hände med pending_approval.
    const classified = new Set<string>([
      ...OPEN_QUOTE_STATUSES,
      ...WON_QUOTE_STATUSES,
      ...LOST_QUOTE_STATUSES,
    ])
    const intentionallyUnclassified = new Set(['draft', 'pending_approval'])

    for (const status of WRITTEN_STATUSES) {
      const ok = classified.has(status) || intentionallyUnclassified.has(status)
      expect(ok, `${status} skrivs men är varken klassificerad eller undantagen`).toBe(true)
    }
  })

  test('rejected skrivs aldrig — värdet heter declined', () => {
    // Det här var en verklig bugg: prisintelligensen filtrerade på 'rejected'
    // och såg därför aldrig en enda förlorad offert.
    expect(WRITTEN_STATUSES as readonly string[]).not.toContain('rejected')
    expect([...LOST_QUOTE_STATUSES]).toContain('declined')
  })
})

test.describe('övergångsregler', () => {
  const canBeAnswered = (status: string) => (OPEN_QUOTE_STATUSES as readonly string[]).includes(status)

  test('bara öppna offerter kan accepteras eller avböjas', () => {
    expect(canBeAnswered('sent')).toBe(true)
    expect(canBeAnswered('opened')).toBe(true)
    // Portalen och kundvyn gatar båda på .in('status', OPEN_QUOTE_STATUSES) —
    // en redan besvarad offert ska ge 409, inte en tyst andra körning av
    // projekt- och deal-kedjan.
    expect(canBeAnswered('accepted')).toBe(false)
    expect(canBeAnswered('declined')).toBe(false)
    expect(canBeAnswered('expired')).toBe(false)
    expect(canBeAnswered('draft')).toBe(false)
    expect(canBeAnswered('pending_approval')).toBe(false)
  })

  test('en offert i fyra-ögon-granskning är inte skickad', () => {
    // pending_approval får ALDRIG räknas som öppen: då skulle
    // uppföljningscronen jaga en offert kunden aldrig fått.
    expect(canBeAnswered('pending_approval')).toBe(false)
    expect([...WON_QUOTE_STATUSES]).not.toContain('pending_approval')
    expect([...LOST_QUOTE_STATUSES]).not.toContain('pending_approval')
  })
})
