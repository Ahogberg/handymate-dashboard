/**
 * Facit för Daniels obeöppnad-offert-nudge (2026-08-14).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * Fel datumfönster = antingen spam dag 2 (kunden fick precis offerten)
 * eller en nudge till en redan död lead dag 20. Fel SMS-byggare = en
 * trasig hälsning ("Hej !") eller en signatur som saknas till en riktig
 * kund, skickat till en riktig telefon.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/unopened-quote-nudge.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  daysSinceSent,
  isUnopenedActionable,
  buildUnopenedNudgeMessage,
  filterOutConflicting,
  NUDGE_SMS_MAX_LENGTH,
  type UnopenedCandidate,
} from '../lib/agents/daniel/unopened-quotes'

const NOW = new Date('2026-08-14T12:00:00.000Z').getTime()
const DAY = 86_400_000

test.describe('daysSinceSent', () => {
  test('5 dygn + 1 timme räknas som dag 5, inte 6 (floor, inte round)', () => {
    const sentAt = new Date(NOW - 5 * DAY - 3_600_000).toISOString()
    expect(daysSinceSent(sentAt, NOW)).toBe(5)
  })

  test('ett sent_at i FRAMTIDEN ger null, inte ett negativt tal', () => {
    const sentAt = new Date(NOW + DAY).toISOString()
    expect(daysSinceSent(sentAt, NOW)).toBeNull()
  })

  test('saknat sent_at ger null', () => {
    expect(daysSinceSent(null, NOW)).toBeNull()
  })
})

function candidate(overrides: Partial<UnopenedCandidate> = {}): UnopenedCandidate {
  return {
    quote_id: 'q1',
    status: 'sent',
    view_count: 0,
    sent_at: new Date(NOW - 7 * DAY).toISOString(),
    ...overrides,
  }
}

test.describe('isUnopenedActionable', () => {
  test('en öppnad offert (view_count > 0) är ALDRIG kandidat, oavsett ålder', () => {
    expect(isUnopenedActionable(candidate({ view_count: 3 }), NOW)).toBe(false)
  })

  test('fönstrets nedre kant: dag 4 är för tidigt, dag 5 är okej', () => {
    const dag4 = candidate({ sent_at: new Date(NOW - 4 * DAY).toISOString() })
    const dag5 = candidate({ sent_at: new Date(NOW - 5 * DAY).toISOString() })
    expect(isUnopenedActionable(dag4, NOW)).toBe(false)
    expect(isUnopenedActionable(dag5, NOW)).toBe(true)
  })

  test('fönstrets övre kant: dag 14 är okej, dag 15 är för sent', () => {
    const dag14 = candidate({ sent_at: new Date(NOW - 14 * DAY).toISOString() })
    const dag15 = candidate({ sent_at: new Date(NOW - 15 * DAY).toISOString() })
    expect(isUnopenedActionable(dag14, NOW)).toBe(true)
    expect(isUnopenedActionable(dag15, NOW)).toBe(false)
  })

  test('fel status (t.ex. accepted/draft/expired) är aldrig kandidat, även inom fönstret', () => {
    for (const status of ['accepted', 'draft', 'expired', 'declined', 'signed']) {
      expect(isUnopenedActionable(candidate({ status }), NOW)).toBe(false)
    }
  })

  test('saknat sent_at hoppas över (data-issue, säkrare att skippa)', () => {
    expect(isUnopenedActionable(candidate({ sent_at: null }), NOW)).toBe(false)
  })
})

test.describe('buildUnopenedNudgeMessage', () => {
  test('kund utan förnamn får "Hej!" — inte "Hej !" med ett löst mellanslag', () => {
    const msg = buildUnopenedNudgeMessage({ customerFirstName: null, contactFirstName: 'Christoffer' })
    expect(msg.startsWith('Hej!')).toBe(true)
    expect(msg).not.toContain('Hej !')
  })

  test('kontakt utan förnamn utelämnar Mvh-raden helt, inte "Mvh " med tomt namn', () => {
    const msg = buildUnopenedNudgeMessage({ customerFirstName: 'Anna', contactFirstName: null })
    expect(msg).not.toContain('Mvh')
  })

  test('ett normalt meddelande håller sig under SMS-gränsen', () => {
    const msg = buildUnopenedNudgeMessage({ customerFirstName: 'Anna', contactFirstName: 'Christoffer' })
    expect(msg.length).toBeLessThanOrEqual(NUDGE_SMS_MAX_LENGTH)
    expect(msg).toBe('Hej Anna! Jag märkte att du inte hunnit titta på offerten jag skickade. Är det fortfarande aktuellt för dig? Mvh Christoffer')
  })

  test('extremt långa namn trunkerar BODY:n, aldrig hälsningen eller signaturen', () => {
    const longCustomer = 'A'.repeat(60)
    const longContact = 'B'.repeat(60)
    const msg = buildUnopenedNudgeMessage({ customerFirstName: longCustomer, contactFirstName: longContact })
    expect(msg.length).toBeLessThanOrEqual(NUDGE_SMS_MAX_LENGTH)
    expect(msg.startsWith(`Hej ${longCustomer}!`)).toBe(true)
    expect(msg.endsWith(`Mvh ${longContact}`)).toBe(true)
    expect(msg).toContain('…') // beviset att BODY:n (inte namnen) klipptes
  })
})

test.describe('filterOutConflicting', () => {
  test('en offert med en pågående/nyligen-löst approval filtreras bort', () => {
    const candidates = [{ quote_id: 'q1' }, { quote_id: 'q2' }]
    const result = filterOutConflicting(candidates, new Set(['q1']))
    expect(result).toEqual([{ quote_id: 'q2' }])
  })

  test('en tom konfliktmängd filtrerar bort ingenting', () => {
    const candidates = [{ quote_id: 'q1' }, { quote_id: 'q2' }]
    expect(filterOutConflicting(candidates, new Set())).toEqual(candidates)
  })
})
