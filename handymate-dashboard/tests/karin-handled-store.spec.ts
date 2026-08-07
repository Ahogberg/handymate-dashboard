/**
 * Facit för Karins kvittenser (N4, 2026-08-07).
 *
 * ═══ FELET SOM VAKTAS ═══
 *
 * Tidigare fanns ett enda läge, "hanterad", och deadline-cronen gjorde
 * `if (hanterade.has(e.id)) continue`. Påminnelserna går ut 14 dagar, 3 dagar och
 * på dagen — en bock fjorton dagar i förväg tystade alltså ALLA tre. Ägaren kunde
 * bocka av en momsdeklaration och sedan aldrig höra talas om den igen.
 *
 * Det viktigaste testet i filen är därför `sista anflygningen går inte att tysta`.
 * Går det sönder är avbockningsknappen livsfarlig igen.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/karin-handled-store.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  dateFromEventId,
  parseEntries,
  parseHandled,
  suppresses,
  pruneEntries,
  applyKvittens,
  serializeEntries,
  SISTA_ANFLYGNING_DAGAR,
  type Kvittens,
} from '../lib/karin/handled-store'

/** Momsdeklaration 12 augusti 2026 — id:t bär datumet, det är hela poängen. */
const MOMS = 'regel:moms:2026-08-12'
const d = (s: string) => new Date(`${s}T09:00:00Z`)

const kvittens = (över: Partial<Kvittens> = {}): Kvittens => ({
  id: MOMS,
  state: 'acknowledged',
  actor: 'andreas',
  at: '2026-07-20T09:00:00.000Z',
  ...över,
})

test.describe('den bärande invarianten', () => {
  test('sista anflygningen går inte att tysta', () => {
    // Tre dagar före förfall och närmare: ingenting tystar. Det är den regel som
    // gör knappen säker att ha över huvud taget.
    for (const dag of ['2026-08-09', '2026-08-10', '2026-08-11', '2026-08-12']) {
      expect(suppresses(kvittens(), d(dag)), `${dag} skulle tystas`).toBe(false)
    }
  })

  test('en kvittens tystar de tidiga påminnelserna', () => {
    // Fjorton dagar ut ska bocken göra nytta — annars är den meningslös.
    expect(suppresses(kvittens(), d('2026-07-29'))).toBe(true)
  })

  test('snooze kan inte sträckas in i sista anflygningen', () => {
    // Ber någon om att bli påmind efter deadline kapas datumet i stället för att
    // avvisas. Avsikten är rimlig; bortre gränsen är inte förhandlingsbar.
    const ut = applyKvittens([], MOMS, { state: 'snoozed', actor: 'a', until: '2026-08-20' }, d('2026-07-01'))
    expect(ut[0].until).toBe('2026-08-09')
    expect(suppresses(ut[0], d('2026-08-09'))).toBe(false)
  })

  test('gränsen är tre dagar', () => {
    expect(SISTA_ANFLYGNING_DAGAR).toBe(3)
  })
})

test.describe('snooze', () => {
  test('tystar fram till datumet och släpper sedan', () => {
    const k = kvittens({ state: 'snoozed', until: '2026-08-01' })
    expect(suppresses(k, d('2026-07-31'))).toBe(true)
    expect(suppresses(k, d('2026-08-01'))).toBe(false)
  })

  test('snooze utan datum tystar ingenting', () => {
    // Hellre en påminnelse för mycket än en evig tystnad från en trasig post.
    expect(suppresses(kvittens({ state: 'snoozed' }), d('2026-07-01'))).toBe(false)
  })
})

test.describe('ångra', () => {
  test('tar bort posten helt', () => {
    const efter = applyKvittens([kvittens()], MOMS, null, d('2026-07-25'))
    expect(efter).toEqual([])
  })

  test('en ny kvittens ersätter den gamla i stället för att dubbleras', () => {
    const ett = applyKvittens([], MOMS, { state: 'acknowledged', actor: 'a' }, d('2026-07-20'))
    const två = applyKvittens(ett, MOMS, { state: 'snoozed', actor: 'b', until: '2026-08-01' }, d('2026-07-21'))
    expect(två).toHaveLength(1)
    expect(två[0].state).toBe('snoozed')
  })
})

test.describe('aktör och tidpunkt bevaras', () => {
  test('vem och när sparas', () => {
    const ut = applyKvittens([], MOMS, { state: 'acknowledged', actor: 'andreas' }, d('2026-07-20'))
    expect(ut[0].actor).toBe('andreas')
    expect(ut[0].at).toBe('2026-07-20T09:00:00.000Z')
  })

  test('okänd aktör är null, inte en gissning', () => {
    const ut = applyKvittens([], MOMS, { state: 'acknowledged', actor: null }, d('2026-07-20'))
    expect(ut[0].actor).toBeNull()
  })
})

test.describe('inget läge påstår att något är inlämnat', () => {
  test('endast två lägen finns', () => {
    // Ett `completed` hade påstått att en deklaration är inlämnad. Det kan vi inte
    // verifiera — Skatteverket berättar det inte för oss.
    const ut = applyKvittens([], MOMS, { state: 'acknowledged', actor: 'a' }, d('2026-07-01'))
    expect(['acknowledged', 'snoozed']).toContain(ut[0].state)
  })

  test('okänt läge i lagrad data läses som kvitterat, aldrig som klart', () => {
    const raw = JSON.stringify([{ id: MOMS, state: 'completed', actor: 'a', at: '' }])
    expect(parseEntries(raw)[0].state).toBe('acknowledged')
  })
})

test.describe('gamla formatet', () => {
  test('en ren stränglista läses som kvittenser', () => {
    const ut = parseEntries(JSON.stringify([MOMS]))
    expect(ut).toHaveLength(1)
    expect(ut[0].state).toBe('acknowledged')
    expect(ut[0].actor).toBeNull()
  })

  test('gamla poster blir automatiskt säkrare än de var', () => {
    // De kunde tidigare tysta även förfallodagen. Nu gäller invarianten dem också.
    const gammal = parseEntries(JSON.stringify([MOMS]))[0]
    expect(suppresses(gammal, d('2026-08-11'))).toBe(false)
  })
})

test.describe('cron-kontraktet', () => {
  test('parseHandled ger de id:n som ska tystas just nu', () => {
    // Deadline-cronen anropar parseHandled(raw) och frågar .has(id). Ändras den
    // formen måste cronen röras — och den ligger i en annan arbetsström.
    const raw = serializeEntries([kvittens()])
    expect(parseHandled(raw, d('2026-07-29')).has(MOMS)).toBe(true)
    expect(parseHandled(raw, d('2026-08-11')).has(MOMS)).toBe(false)
  })

  test('utan tidsargument används nutid', () => {
    expect(() => parseHandled(serializeEntries([kvittens()]))).not.toThrow()
  })
})

test.describe('tolerans', () => {
  test('trasigt innehåll ger tom lista, inte ett fel', () => {
    for (const raw of ['inte json', '{}', 'null', '[1,2,3]', '', null, undefined]) {
      expect(parseEntries(raw as any)).toEqual([])
    }
  })

  test('poster utan id hoppas över', () => {
    expect(parseEntries(JSON.stringify([{ state: 'acknowledged' }, { id: '' }]))).toEqual([])
  })
})

test.describe('gallring', () => {
  test('gamla datum gallras bort', () => {
    const gammal = kvittens({ id: 'regel:moms:2025-01-12' })
    expect(pruneEntries([gammal], d('2026-08-07'))).toEqual([])
  })

  test('id utan datum behålls alltid', () => {
    const utan = kvittens({ id: 'egen:nagot' })
    expect(pruneEntries([utan], d('2026-08-07'))).toHaveLength(1)
  })

  test('datum bara ur id:t', () => {
    expect(dateFromEventId(MOMS)).toBe('2026-08-12')
    expect(dateFromEventId('egen:nagot')).toBeNull()
  })
})
