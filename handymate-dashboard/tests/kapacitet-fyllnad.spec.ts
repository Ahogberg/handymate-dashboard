/**
 * Hannas "tunn vecka"-trigger — facit-tester för de rena, DB-fria delarna:
 * meddelande-byggaren och kandidat-rangordnings-/dedup-hjälparna.
 * Körs: npx playwright test tests/kapacitet-fyllnad.spec.ts --no-deps
 *
 * Cron-loopen (runCapacityFill) testas INTE här — den kräver en riktig
 * Supabase-klient. Se lib/agents/hanna/capacity-fill.ts för DB-delen.
 */
import { test, expect } from '@playwright/test'
import {
  buildCapacityFillMessage,
  isUnsoldQuoteActionable,
  rankUnsoldQuoteCandidates,
  rankPastCustomerCandidates,
  excludeByCustomerId,
  UNSOLD_QUOTE_MIN_DAYS,
  CAPACITY_FILL_SMS_MAX_LENGTH,
} from '../lib/agents/hanna/capacity-fill'

const WEEKDAY_WORDS = [
  'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag', 'söndag',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
]
const PRICE_WORDS = ['kr', ':-', 'rabatt', 'gratis', 'procent', '%', 'kostnad', 'pris']

test.describe('buildCapacityFillMessage', () => {
  test('inkluderar kundens förnamn i hälsningen', () => {
    const msg = buildCapacityFillMessage({
      customerFirstName: 'Erik Svensson',
      contactFirstName: null,
    })
    expect(msg).toContain('Hej Erik!')
  })

  test('kund utan namn → generisk hälsning, inte "Hej !"', () => {
    const msg = buildCapacityFillMessage({ customerFirstName: null, contactFirstName: null })
    expect(msg.startsWith('Hej!')).toBe(true)
    expect(msg).not.toContain('Hej !')
  })

  test('kontaktperson med namn → Mvh-signatur', () => {
    const msg = buildCapacityFillMessage({
      customerFirstName: 'Anna',
      contactFirstName: 'Christoffer Larsson',
    })
    expect(msg).toContain('Mvh Christoffer')
  })

  test('kontaktperson utan namn → ingen Mvh-rad', () => {
    const msg = buildCapacityFillMessage({ customerFirstName: 'Anna', contactFirstName: null })
    expect(msg).not.toContain('Mvh')
  })

  test('serviceHint gör meddelandet personligt', () => {
    const msg = buildCapacityFillMessage({
      customerFirstName: 'Anna',
      contactFirstName: null,
      serviceHint: 'badrumsrenoveringen',
    })
    expect(msg).toContain('badrumsrenoveringen')
  })

  test('ingen serviceHint → generiskt meddelande, inga trasiga tomma referenser', () => {
    const msg = buildCapacityFillMessage({ customerFirstName: 'Anna', contactFirstName: null })
    expect(msg).not.toContain('gå vidare med .')
    expect(msg).not.toContain('gå vidare med  ')
  })

  test('nämner ALDRIG en specifik veckodag', () => {
    const cases = [
      { customerFirstName: 'Erik', contactFirstName: 'Christoffer', serviceHint: 'köksrenovering' },
      { customerFirstName: null, contactFirstName: null, serviceHint: null },
      { customerFirstName: 'BRF Lindgården', contactFirstName: 'Anna', serviceHint: 'elinstallation' },
    ]
    for (const c of cases) {
      const msg = buildCapacityFillMessage(c).toLowerCase()
      for (const day of WEEKDAY_WORDS) {
        expect(msg).not.toContain(day)
      }
    }
  })

  test('lovar ALDRIG pris eller rabatt', () => {
    const cases = [
      { customerFirstName: 'Erik', contactFirstName: 'Christoffer', serviceHint: 'köksrenovering' },
      { customerFirstName: null, contactFirstName: null, serviceHint: null },
    ]
    for (const c of cases) {
      const msg = buildCapacityFillMessage(c).toLowerCase()
      for (const word of PRICE_WORDS) {
        expect(msg).not.toContain(word)
      }
    }
  })

  test('svensk text (innehåller åäö-vänliga ord, inga engelska fraser)', () => {
    const msg = buildCapacityFillMessage({ customerFirstName: 'Erik', contactFirstName: null })
    expect(msg).toContain('lediga tider')
    expect(msg).toMatch(/nästa vecka/)
  })

  test('trunkerar till max SMS-längd men behåller hälsning + signatur', () => {
    const msg = buildCapacityFillMessage({
      customerFirstName: 'Bartholomeus-Alexander',
      contactFirstName: 'Maximiliana-Konstantina',
      serviceHint: 'en väldigt lång och detaljerad beskrivning av ett stort renoveringsprojekt med många moment',
    })
    expect(msg.length).toBeLessThanOrEqual(CAPACITY_FILL_SMS_MAX_LENGTH)
    expect(msg).toContain('Hej Bartholomeus-Alexander!')
    expect(msg).toContain('Mvh Maximiliana-Konstantina')
  })
})

test.describe('isUnsoldQuoteActionable', () => {
  const now = new Date('2026-07-16T12:00:00Z').getTime()
  const daysAgo = (d: number) => new Date(now - d * 86400000).toISOString()

  test('status sent, 8 dagar sedan → actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'sent', sent_at: daysAgo(8) }, now)).toBe(true)
  })

  test('status opened, 10 dagar sedan → actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'opened', sent_at: daysAgo(10) }, now)).toBe(true)
  })

  test(`exakt ${UNSOLD_QUOTE_MIN_DAYS} dagar → INTE actionable (kräver striktare)`, () => {
    expect(isUnsoldQuoteActionable({ status: 'sent', sent_at: daysAgo(UNSOLD_QUOTE_MIN_DAYS) }, now)).toBe(false)
  })

  test('status accepted → aldrig actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'accepted', sent_at: daysAgo(30) }, now)).toBe(false)
  })

  test('status declined → aldrig actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'declined', sent_at: daysAgo(30) }, now)).toBe(false)
  })

  test('status draft (aldrig skickad) → aldrig actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'draft', sent_at: null }, now)).toBe(false)
  })

  test('sent_at saknas → aldrig actionable', () => {
    expect(isUnsoldQuoteActionable({ status: 'sent', sent_at: null }, now)).toBe(false)
  })
})

test.describe('rankUnsoldQuoteCandidates', () => {
  test('sorterar högst total_kr först', () => {
    const ranked = rankUnsoldQuoteCandidates([
      { quote_id: 'q1', total_kr: 5000 },
      { quote_id: 'q2', total_kr: 42000 },
      { quote_id: 'q3', total_kr: 18000 },
    ])
    expect(ranked.map(c => c.quote_id)).toEqual(['q2', 'q3', 'q1'])
  })

  test('muterar inte originallistan', () => {
    const original = [{ quote_id: 'q1', total_kr: 1000 }, { quote_id: 'q2', total_kr: 2000 }]
    const copy = [...original]
    rankUnsoldQuoteCandidates(original)
    expect(original).toEqual(copy)
  })
})

test.describe('rankPastCustomerCandidates', () => {
  test('mest inaktiv (flest dagar) först', () => {
    const ranked = rankPastCustomerCandidates([
      { customer_id: 'c1', days_since_last_job: 95 },
      { customer_id: 'c2', days_since_last_job: 400 },
      { customer_id: 'c3', days_since_last_job: 120 },
    ])
    expect(ranked.map(c => c.customer_id)).toEqual(['c2', 'c3', 'c1'])
  })
})

test.describe('excludeByCustomerId', () => {
  test('filtrerar bort kandidater i exclude-setet', () => {
    const result = excludeByCustomerId(
      [{ customer_id: 'c1' }, { customer_id: 'c2' }, { customer_id: 'c3' }],
      new Set(['c2']),
    )
    expect(result.map(c => c.customer_id)).toEqual(['c1', 'c3'])
  })

  test('tomt exclude-set → oförändrad lista (samma referens-beteende, ingen krasch)', () => {
    const input = [{ customer_id: 'c1' }]
    const result = excludeByCustomerId(input, new Set())
    expect(result).toEqual(input)
  })

  test('alla exkluderade → tom lista', () => {
    const result = excludeByCustomerId(
      [{ customer_id: 'c1' }, { customer_id: 'c2' }],
      new Set(['c1', 'c2']),
    )
    expect(result).toEqual([])
  })
})
