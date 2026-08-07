/**
 * Facit för bolagskalenderns händelser (2026-08-07).
 *
 * Testar prioriteringen — den avgör vad hantverkaren ser först, och därmed
 * vad han faktiskt hinner göra något åt.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-calendar.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  obligationToEvent,
  urgency,
  needsAttention,
  sortByUrgency,
  groupByMonth,
  type CalendarEvent,
} from '../lib/karin/calendar'
import { materializeObligations } from '../lib/karin/obligations'
import { ymd } from '../lib/karin/business-days'

const IDAG = ymd(2026, 8, 7)

function handelse(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'regel:moms:2026-08-12',
    source: 'regel',
    rule_code: 'moms',
    title: 'Momsdeklaration',
    authority: 'Skatteverket',
    category: 'moms',
    due_date: '2026-08-12',
    prepare_from: '2026-07-29',
    period_label: 'kvartal 2 2026',
    why: 'Du redovisar moms per kvartal.',
    legal_basis: 'Skatteförfarandelagen.',
    source_url: 'https://www.skatteverket.se/',
    rule_version: 1,
    confidence: 'hog',
    amount: null,
    handled: false,
    ...over,
  }
}

test.describe('omvandlingen från skyldighet till händelse', () => {
  test('id:t är stabilt över omräkningar', () => {
    // Ett slumpat id hade gjort att "markerad som hanterad" tappades varje
    // gång sidan laddades om.
    const o = materializeObligations(
      { company_form: 'ab', fiscal_year_end_month: 12, vat_period: 'quarter', is_employer: true },
      ymd(2026, 8, 1), ymd(2026, 8, 31),
    )
    const forsta = o.map(obligationToEvent).map(e => e.id)
    const andra = o.map(obligationToEvent).map(e => e.id)
    expect(forsta).toEqual(andra)
    expect(new Set(forsta).size, 'två händelser fick samma id').toBe(forsta.length)
  })

  test('förklaringen och källan följer med', () => {
    const o = materializeObligations(
      { company_form: 'ab', fiscal_year_end_month: 12, vat_period: 'quarter', is_employer: true },
      ymd(2026, 8, 1), ymd(2026, 8, 31),
    )
    for (const e of o.map(obligationToEvent)) {
      expect(e.why.length).toBeGreaterThan(20)
      expect(e.source_url).toMatch(/^https:\/\//)
      expect(e.source).toBe('regel')
    }
  })

  test('belopp är null när vi inte känner till det', () => {
    // V1 vet inte hur mycket moms som ska betalas. Att visa 0 kr hade
    // påstått att det inte kostar något.
    const e = obligationToEvent(materializeObligations(
      { company_form: 'ab', fiscal_year_end_month: 12, vat_period: 'quarter' },
      ymd(2026, 8, 1), ymd(2026, 8, 31),
    )[0])
    expect(e.amount).toBeNull()
  })
})

test.describe('hur bråttom det är', () => {
  test('gårdagens datum är förfallet', () => {
    expect(urgency(handelse({ due_date: '2026-08-06' }), IDAG)).toBe('forfallen')
  })

  test('idag och tre dagar fram är brådskande', () => {
    expect(urgency(handelse({ due_date: '2026-08-07' }), IDAG)).toBe('bradskande')
    expect(urgency(handelse({ due_date: '2026-08-10' }), IDAG)).toBe('bradskande')
  })

  test('inom två veckor är snart', () => {
    expect(urgency(handelse({ due_date: '2026-08-12' }), IDAG)).toBe('snart')
    expect(urgency(handelse({ due_date: '2026-08-21' }), IDAG)).toBe('snart')
  })

  test('längre fram är senare', () => {
    expect(urgency(handelse({ due_date: '2026-09-15' }), IDAG)).toBe('senare')
  })
})

test.describe('VAD SOM LYFTS — och vad som inte gör det', () => {
  test('bara förfallet och brådskande kräver uppmärksamhet', () => {
    // Att lyfta allt inom en månad hade gjort sektionen till en andra
    // kalender, och då slutar man läsa den.
    expect(needsAttention(handelse({ due_date: '2026-08-06' }), IDAG)).toBe(true)
    expect(needsAttention(handelse({ due_date: '2026-08-09' }), IDAG)).toBe(true)
    expect(needsAttention(handelse({ due_date: '2026-08-12' }), IDAG)).toBe(false)
    expect(needsAttention(handelse({ due_date: '2026-10-01' }), IDAG)).toBe(false)
  })

  test('en hanterad händelse lyfts ALDRIG, hur nära den än ligger', () => {
    // Har ägaren sagt att han fixat det ska systemet tro honom.
    expect(needsAttention(handelse({ due_date: '2026-08-01', handled: true }), IDAG)).toBe(false)
    expect(needsAttention(handelse({ due_date: '2026-08-07', handled: true }), IDAG)).toBe(false)
  })
})

test.describe('ordningen', () => {
  test('förfallet före brådskande före snart', () => {
    const ordnat = sortByUrgency([
      handelse({ id: 'c', due_date: '2026-08-20' }),
      handelse({ id: 'a', due_date: '2026-08-01' }),
      handelse({ id: 'b', due_date: '2026-08-08' }),
    ], IDAG)
    expect(ordnat.map(e => e.id)).toEqual(['a', 'b', 'c'])
  })

  test('beloppet avgör först vid samma datum', () => {
    // Ett litet belopp som förfaller idag är mer akut än ett stort om tre
    // veckor — det förfallna kostar redan pengar.
    const ordnat = sortByUrgency([
      handelse({ id: 'liten', due_date: '2026-08-10', amount: 1000 }),
      handelse({ id: 'stor', due_date: '2026-08-10', amount: 90000 }),
      handelse({ id: 'jattestor_sent', due_date: '2026-09-30', amount: 500000 }),
    ], IDAG)
    expect(ordnat.map(e => e.id)).toEqual(['stor', 'liten', 'jattestor_sent'])
  })

  test('sorteringen muterar inte indata', () => {
    const original = [handelse({ id: 'b', due_date: '2026-09-01' }), handelse({ id: 'a', due_date: '2026-08-01' })]
    const kopia = original.map(e => e.id)
    sortByUrgency(original, IDAG)
    expect(original.map(e => e.id)).toEqual(kopia)
  })
})

test.describe('månadsgruppering', () => {
  test('grupperas i datumordning med svenskt månadsnamn', () => {
    const g = groupByMonth([
      handelse({ id: 'c', due_date: '2026-10-01' }),
      handelse({ id: 'a', due_date: '2026-08-12' }),
      handelse({ id: 'b', due_date: '2026-09-14' }),
    ])
    expect(g.map(x => x.key)).toEqual(['2026-08', '2026-09', '2026-10'])
    expect(g[0].label).toBe('augusti 2026')
  })

  test('tomma månader hoppas över', () => {
    // En kalender med tomma månader ser trasig ut, inte lugn.
    const g = groupByMonth([handelse({ due_date: '2026-08-12' }), handelse({ id: 'x', due_date: '2026-11-12' })])
    expect(g).toHaveLength(2)
  })

  test('över årsskifte', () => {
    const g = groupByMonth([handelse({ id: 'b', due_date: '2027-01-12' }), handelse({ id: 'a', due_date: '2026-12-14' })])
    expect(g.map(x => x.key)).toEqual(['2026-12', '2027-01'])
  })

  test('tom lista ger tom gruppering', () => {
    expect(groupByMonth([])).toEqual([])
  })
})
