/**
 * Facit för hanterat-markeringarna (2026-08-07).
 *
 * Två saker vaktas: att en trasig preferens aldrig fäller kalendern, och att
 * listan gallras så den inte växer för alltid.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-handled-store.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  dateFromEventId,
  parseHandled,
  pruneHandled,
  applyHandledChange,
} from '../lib/karin/handled-store'

const IDAG = new Date('2026-08-07T12:00:00')

test.describe('datumet ligger i id:t', () => {
  test('plockas ut ur ett regelhändelse-id', () => {
    // Hela poängen med ett stabilt id i stället för ett slumpat.
    expect(dateFromEventId('regel:moms:2026-08-12')).toBe('2026-08-12')
    expect(dateFromEventId('regel:arsredovisning:2027-07-30')).toBe('2027-07-30')
  })

  test('id utan datum ger null i stället för att gissa', () => {
    expect(dateFromEventId('egen:nagot')).toBeNull()
    expect(dateFromEventId('')).toBeNull()
  })
})

test.describe('EN TRASIG PREFERENS FÄLLER ALDRIG KALENDERN', () => {
  test('skräp ger tom mängd, inte ett fel', () => {
    // En kalender som vägrar rendera för att en preferens är korrupt är sämre
    // än en som glömt vad du bockat av.
    for (const raw of ['inte json', '{"a":1}', '42', '"text"', 'null', '']) {
      expect(parseHandled(raw).size, raw).toBe(0)
    }
  })

  test('null och undefined kraschar inte', () => {
    expect(parseHandled(null).size).toBe(0)
    expect(parseHandled(undefined).size).toBe(0)
  })

  test('en giltig lista läses', () => {
    const s = parseHandled('["regel:moms:2026-08-12","regel:agi:2026-08-17"]')
    expect(s.size).toBe(2)
    expect(s.has('regel:moms:2026-08-12')).toBe(true)
  })

  test('icke-strängar i listan sållas bort', () => {
    expect(parseHandled('["ok", 42, null, {"a":1}]').size).toBe(1)
  })
})

test.describe('GALLRINGEN — annars växer listan för alltid', () => {
  test('gamla markeringar faller bort', () => {
    // Tolv AGI om året plus fyra moms blir hundratals rader på några år.
    const kvar = pruneHandled(['regel:moms:2020-02-12', 'regel:moms:2026-08-12'], IDAG)
    expect(kvar).toEqual(['regel:moms:2026-08-12'])
  })

  test('nyligen passerade behålls', () => {
    // Precis passerat är fortfarande intressant — man vill se att man bockat av.
    const kvar = pruneHandled(['regel:agi:2026-07-13'], IDAG)
    expect(kvar).toHaveLength(1)
  })

  test('framtida behålls alltid', () => {
    expect(pruneHandled(['regel:moms:2027-05-12'], IDAG)).toHaveLength(1)
  })

  test('id utan datum behålls — vi slänger inte det vi inte förstår', () => {
    expect(pruneHandled(['egen:vad-som-helst'], IDAG)).toEqual(['egen:vad-som-helst'])
  })
})

test.describe('att bocka av och ångra', () => {
  test('lägger till', () => {
    const ut = applyHandledChange(new Set(), 'regel:moms:2026-08-12', true, IDAG)
    expect(ut).toContain('regel:moms:2026-08-12')
  })

  test('tar bort', () => {
    const ut = applyHandledChange(new Set(['regel:moms:2026-08-12']), 'regel:moms:2026-08-12', false, IDAG)
    expect(ut).toEqual([])
  })

  test('att bocka av två gånger ger ingen dubblett', () => {
    let ut = applyHandledChange(new Set(), 'a:2026-08-12', true, IDAG)
    ut = applyHandledChange(new Set(ut), 'a:2026-08-12', true, IDAG)
    expect(ut).toEqual(['a:2026-08-12'])
  })

  test('gallrar i samma veva', () => {
    const ut = applyHandledChange(new Set(['regel:moms:2019-02-12']), 'regel:moms:2026-08-12', true, IDAG)
    expect(ut).toEqual(['regel:moms:2026-08-12'])
  })

  test('originalet muteras inte', () => {
    const original = new Set(['regel:moms:2026-08-12'])
    applyHandledChange(original, 'regel:agi:2026-08-17', true, IDAG)
    expect(original.size).toBe(1)
  })

  test('resultatet är sorterat — stabil lagring över omskrivningar', () => {
    const ut = applyHandledChange(new Set(['b:2026-08-12', 'a:2026-08-12']), 'c:2026-08-12', true, IDAG)
    expect(ut).toEqual([...ut].sort())
  })
})
