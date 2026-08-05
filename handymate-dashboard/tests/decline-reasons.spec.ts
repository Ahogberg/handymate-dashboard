/**
 * Facit-tester för strukturerade avböjandeskäl (idé 2, 2026-08-05).
 *
 * Poängen med koden framför fritext är att förlusten ska gå att RÄKNA på.
 * Testerna låser fast att kod och fritext kan samexistera utan att förstöra
 * grupperingen, och att vi aldrig påstår en trend på för tunt underlag.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/decline-reasons.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  DECLINE_REASONS,
  parseDeclineReasonCode,
  buildLostReason,
  extractReasonCode,
  summarizeDeclineReasons,
  buildDeclineInsight,
  declineReasonLabel,
  MIN_DECLINES_FOR_INSIGHT,
} from '../lib/quotes/decline-reasons'

test.describe('taxonomin', () => {
  test('fyra val — fler blir en enkät kunden hoppar över', () => {
    expect(DECLINE_REASONS).toHaveLength(4)
  })

  test('uppskjutet finns med — det är en affär, inte en förlust', () => {
    expect(DECLINE_REASONS.map(r => r.code)).toContain('not_now')
  })

  test('koderna är unika', () => {
    const codes = DECLINE_REASONS.map(r => r.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})

test.describe('parseDeclineReasonCode — tål skräp utan att kasta', () => {
  test('giltiga koder accepteras, oavsett versaler och blanksteg', () => {
    expect(parseDeclineReasonCode('too_expensive')).toBe('too_expensive')
    expect(parseDeclineReasonCode('  NOT_NOW ')).toBe('not_now')
  })

  test('okända värden ger null i stället för fel', () => {
    expect(parseDeclineReasonCode('billigare_hos_grannen')).toBeNull()
    expect(parseDeclineReasonCode(undefined)).toBeNull()
    expect(parseDeclineReasonCode(42)).toBeNull()
    expect(parseDeclineReasonCode(null)).toBeNull()
  })
})

test.describe('lost_reason — kod och fritext samexisterar', () => {
  test('kod ensam lagras som ren kod', () => {
    expect(buildLostReason('too_expensive', '')).toBe('too_expensive')
  })

  test('kod plus fritext lagras med kod först så grupperingen håller', () => {
    expect(buildLostReason('too_expensive', 'fick 20% billigare')).toBe('too_expensive: fick 20% billigare')
  })

  test('bara fritext lagras som fritext', () => {
    expect(buildLostReason(null, 'ville inte')).toBe('ville inte')
  })

  test('varken kod eller text ger null', () => {
    expect(buildLostReason(null, '   ')).toBeNull()
  })

  test('koden går alltid att läsa tillbaka ur den lagrade strängen', () => {
    for (const reason of DECLINE_REASONS) {
      const stored = buildLostReason(reason.code, 'kundens egna ord: med kolon i')
      expect(extractReasonCode(stored)).toBe(reason.code)
    }
  })

  test('gammal fritext utan kod ger null — bryter inte aggregeringen', () => {
    expect(extractReasonCode('för dyrt tyckte vi')).toBeNull()
    expect(extractReasonCode(null)).toBeNull()
  })
})

test.describe('summarizeDeclineReasons', () => {
  test('grupperar, summerar värde och sorterar störst först', () => {
    const breakdown = summarizeDeclineReasons([
      { lost_reason: 'too_expensive', total: 50000 },
      { lost_reason: 'too_expensive: fick billigare', total: 30000 },
      { lost_reason: 'not_now', total: 20000 },
    ])
    expect(breakdown[0].code).toBe('too_expensive')
    expect(breakdown[0].count).toBe(2)
    expect(breakdown[0].lostValue).toBe(80000)
    expect(breakdown[0].share).toBe(67)
  })

  test('offerter utan skäl hamnar i en egen ärlig kategori', () => {
    const breakdown = summarizeDeclineReasons([
      { lost_reason: null, total: 1000 },
      { lost_reason: 'gammal fritext', total: 2000 },
    ])
    expect(breakdown).toHaveLength(1)
    expect(breakdown[0].code).toBe('unknown')
    expect(breakdown[0].label).toBe('Skäl saknas')
    expect(breakdown[0].count).toBe(2)
  })

  test('tom lista ger tom lista', () => {
    expect(summarizeDeclineReasons([])).toEqual([])
  })

  test('etiketten är hantverkarens formulering, inte kundens', () => {
    expect(declineReasonLabel('too_expensive')).toBe('För dyrt')
    expect(declineReasonLabel(null)).toBe('Skäl saknas')
  })
})

test.describe('buildDeclineInsight — aldrig en påhittad trend', () => {
  const expensive = (n: number) =>
    Array.from({ length: n }, () => ({ lost_reason: 'too_expensive', total: 10000 }))

  test('för få avböjda ger ingen slutsats', () => {
    expect(buildDeclineInsight(expensive(MIN_DECLINES_FOR_INSIGHT - 1))).toBeNull()
  })

  test('tydlig dominans ger en konkret mening med förlorat värde', () => {
    const insight = buildDeclineInsight(expensive(MIN_DECLINES_FOR_INSIGHT))
    expect(insight).toContain('100 %')
    expect(insight).toContain('priset')
  })

  test('utan dominans dras ingen slutsats', () => {
    const mixed = [
      { lost_reason: 'too_expensive', total: 1000 },
      { lost_reason: 'chose_other', total: 1000 },
      { lost_reason: 'not_now', total: 1000 },
      { lost_reason: 'other', total: 1000 },
      { lost_reason: 'chose_other', total: 1000 },
    ]
    expect(buildDeclineInsight(mixed)).toBeNull()
  })

  test('bara okända skäl ger ingen slutsats', () => {
    const unknown = Array.from({ length: 10 }, () => ({ lost_reason: null, total: 1000 }))
    expect(buildDeclineInsight(unknown)).toBeNull()
  })

  test('uppskjutna beskrivs som för tidiga, inte som förlorade', () => {
    const postponed = Array.from({ length: 6 }, () => ({ lost_reason: 'not_now', total: 5000 }))
    expect(buildDeclineInsight(postponed)).toContain('inte förlorade')
  })
})
