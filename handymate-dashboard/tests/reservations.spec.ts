/**
 * Facit-tester för reservationsmotorn (etapp 3, offertplanen 2026-08-05).
 *
 * De hårdaste kraven som testas här:
 *   - DEDUPE: två artiklar som utlöser samma reservation ger ETT förslag
 *   - Snapshot: en tillagd reservation fryses och kan inte dubbleras
 *   - Inlärning: tystas efter tre avvisningar i rad, accept nollställer
 *   - Rubrik-/fritextrader deltar inte i matchningen (falska nyckelordsträffar)
 *
 * Körs utan browser/session:
 *   npx playwright test tests/reservations.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  matchReservations,
  itemMatchesReservation,
  appendToSnapshot,
  removeFromSnapshot,
  shouldMuteAfterDecision,
  MUTE_AFTER_CONSECUTIVE_REJECTS,
  type ReservationWithTriggers,
  type MatchableItem,
} from '../lib/reservations/match'
import {
  getDefaultReservations,
  getAllReservationDefaults,
  getReservationBranches,
} from '../lib/reservation-defaults'

function reservation(overrides: Partial<ReservationWithTriggers> = {}): ReservationWithTriggers {
  return {
    id: 'res_1',
    title: 'Dolda fel',
    content: 'Reservation görs för dolda fel som inte kunnat besiktigas.',
    triggers: [{ trigger_type: 'keyword', keyword: 'rivning' }],
    ...overrides,
  }
}

function item(overrides: Partial<MatchableItem> = {}): MatchableItem {
  return { id: 'qi_1', description: 'Rivning badrum', item_type: 'item', ...overrides }
}

test.describe('itemMatchesReservation — de tre triggertyperna', () => {
  test('nyckelord matchar var som helst i beskrivningen, oavsett versaler', () => {
    expect(itemMatchesReservation(item({ description: 'RIVNING av badrum' }), reservation())).toBe(true)
    expect(itemMatchesReservation(item({ description: 'Målning vardagsrum' }), reservation())).toBe(false)
  })

  test('produkt matchar på linked_product_id', () => {
    const res = reservation({ triggers: [{ trigger_type: 'product', product_id: 'prod_9' }] })
    expect(itemMatchesReservation(item({ linked_product_id: 'prod_9' }), res)).toBe(true)
    expect(itemMatchesReservation(item({ linked_product_id: 'prod_8' }), res)).toBe(false)
    // Fritext- och AI-rader saknar koppling — får aldrig matcha en produkttrigger
    expect(itemMatchesReservation(item({ linked_product_id: null }), res)).toBe(false)
  })

  test('kategori matchar på category_slug', () => {
    const res = reservation({ triggers: [{ trigger_type: 'category', category_slug: 'arbete_bygg' }] })
    expect(itemMatchesReservation(item({ category_slug: 'arbete_bygg' }), res)).toBe(true)
    expect(itemMatchesReservation(item({ category_slug: 'arbete_el' }), res)).toBe(false)
    expect(itemMatchesReservation(item({ category_slug: null }), res)).toBe(false)
  })

  test('tomt nyckelord matchar aldrig — annars skulle det träffa varje rad', () => {
    const res = reservation({ triggers: [{ trigger_type: 'keyword', keyword: '   ' }] })
    expect(itemMatchesReservation(item(), res)).toBe(false)
  })

  test('flera triggers på samma reservation: en träff räcker', () => {
    const res = reservation({
      triggers: [
        { trigger_type: 'keyword', keyword: 'asbest' },
        { trigger_type: 'category', category_slug: 'arbete_bygg' },
      ],
    })
    expect(itemMatchesReservation(item({ description: 'Målning', category_slug: 'arbete_bygg' }), res)).toBe(true)
  })
})

test.describe('matchReservations — dedupe och motivering', () => {
  test('två rader som utlöser samma reservation ger ETT förslag med båda som motivering', () => {
    const res = reservation({
      triggers: [
        { trigger_type: 'keyword', keyword: 'rivning' },
        { trigger_type: 'keyword', keyword: 'demontering' },
      ],
    })
    const suggestions = matchReservations(
      [
        item({ id: 'qi_1', description: 'Rivning badrum' }),
        item({ id: 'qi_2', description: 'Demontering tak' }),
        item({ id: 'qi_3', description: 'Målning vardagsrum' }),
      ],
      [res],
    )
    expect(suggestions).toHaveLength(1)
    expect(suggestions[0].triggeredBy.map(t => t.itemId)).toEqual(['qi_1', 'qi_2'])
  })

  test('ingen matchande rad ger inget förslag', () => {
    expect(matchReservations([item({ description: 'Målning' })], [reservation()])).toHaveLength(0)
  })

  test('rubrik-, fritext- och delsummerader deltar inte — de utför inget arbete', () => {
    const rows = [
      item({ id: 'h', description: 'Rivning och förberedelser', item_type: 'heading' }),
      item({ id: 't', description: 'Rivning ingår i priset', item_type: 'text' }),
      item({ id: 's', description: 'Rivning delsumma', item_type: 'subtotal' }),
    ]
    expect(matchReservations(rows, [reservation()])).toHaveLength(0)
  })

  test('tillvalsrader deltar — de kan bli utfört arbete', () => {
    const suggestions = matchReservations([item({ item_type: 'option' })], [reservation()])
    expect(suggestions).toHaveLength(1)
  })

  test('förslagen sorteras på sort_order, sedan titel', () => {
    const a = reservation({ id: 'a', title: 'Bsak', sort_order: 2 })
    const b = reservation({ id: 'b', title: 'Asak', sort_order: 1 })
    const c = reservation({ id: 'c', title: 'Aasak', sort_order: 1 })
    const suggestions = matchReservations([item()], [a, b, c])
    expect(suggestions.map(s => s.reservation.id)).toEqual(['c', 'b', 'a'])
  })
})

test.describe('matchReservations — filtrering', () => {
  test('muted reservation föreslås inte (inlärningen)', () => {
    expect(matchReservations([item()], [reservation({ suggest_enabled: false })])).toHaveLength(0)
  })

  test('inaktiv reservation föreslås inte', () => {
    expect(matchReservations([item()], [reservation({ is_active: false })])).toHaveLength(0)
  })

  test('redan tillagd reservation föreslås inte igen', () => {
    const suggestions = matchReservations([item()], [reservation()], {
      alreadyAdded: [{ reservation_id: 'res_1', title: 'Dolda fel', content: '...' }],
    })
    expect(suggestions).toHaveLength(0)
  })

  test('avvisad i sessionen föreslås inte igen förrän omladdning', () => {
    expect(matchReservations([item()], [reservation()], { dismissedIds: ['res_1'] })).toHaveLength(0)
  })

  test('en manuellt tillagd reservation utan id blockerar inte biblioteksförslag', () => {
    const suggestions = matchReservations([item()], [reservation()], {
      alreadyAdded: [{ reservation_id: null, title: 'Egen text', content: '...' }],
    })
    expect(suggestions).toHaveLength(1)
  })
})

test.describe('snapshot — offerten är juridiskt fristående', () => {
  test('tillägg fryser texten som den ser ut vid tillfället', () => {
    const snapshot = appendToSnapshot(null, [
      { reservation_id: 'res_1', title: 'Dolda fel', content: 'Redigerad text' },
    ])
    expect(snapshot).toHaveLength(1)
    expect(snapshot[0].content).toBe('Redigerad text')
  })

  test('samma reservation kan inte läggas till två gånger', () => {
    const first = appendToSnapshot(null, [{ reservation_id: 'res_1', title: 'A', content: 'x' }])
    const second = appendToSnapshot(first, [{ reservation_id: 'res_1', title: 'A', content: 'x' }])
    expect(second).toHaveLength(1)
  })

  test('två olika reservationer läggs till båda', () => {
    const snapshot = appendToSnapshot(null, [
      { reservation_id: 'res_1', title: 'A', content: 'x' },
      { reservation_id: 'res_2', title: 'B', content: 'y' },
    ])
    expect(snapshot).toHaveLength(2)
  })

  test('mutationsfri — ursprungslistan rörs inte', () => {
    const original = [{ reservation_id: 'res_1', title: 'A', content: 'x' }]
    appendToSnapshot(original, [{ reservation_id: 'res_2', title: 'B', content: 'y' }])
    expect(original).toHaveLength(1)
  })

  test('borttagning tar rätt rad och tål index utanför listan', () => {
    const snapshot = [
      { reservation_id: 'a', title: 'A', content: 'x' },
      { reservation_id: 'b', title: 'B', content: 'y' },
    ]
    expect(removeFromSnapshot(snapshot, 0).map(e => e.reservation_id)).toEqual(['b'])
    expect(removeFromSnapshot(snapshot, 9)).toHaveLength(2)
    expect(removeFromSnapshot(snapshot, -1)).toHaveLength(2)
  })
})

test.describe('inlärning — sluta föreslå det som alltid avvisas', () => {
  test('tystas på tredje avvisningen i rad', () => {
    expect(shouldMuteAfterDecision(0, 'rejected')).toBe(false)
    expect(shouldMuteAfterDecision(1, 'rejected')).toBe(false)
    expect(shouldMuteAfterDecision(2, 'rejected')).toBe(true)
  })

  test('accept tystar aldrig — och nollställer räknaren hos anroparen', () => {
    expect(shouldMuteAfterDecision(2, 'accepted')).toBe(false)
    expect(shouldMuteAfterDecision(99, 'accepted')).toBe(false)
  })

  test('tröskeln är tre', () => {
    expect(MUTE_AFTER_CONSECUTIVE_REJECTS).toBe(3)
  })
})

test.describe('seedbiblioteket — motorn får aldrig starta tom', () => {
  test('varje bransch får minst tre reservationer', () => {
    for (const branch of getReservationBranches()) {
      expect(getDefaultReservations(branch).length, `${branch} har för få`).toBeGreaterThanOrEqual(3)
    }
  })

  test('okänd bransch får ändå ett bibliotek', () => {
    expect(getDefaultReservations('rymdfarkostreparation').length).toBeGreaterThan(0)
  })

  test('system_key är unik — annars kolliderar seed-idempotensen', () => {
    const keys = getAllReservationDefaults().map(r => r.system_key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  test('varje reservation har minst en trigger — annars kan den aldrig föreslås', () => {
    for (const r of getAllReservationDefaults()) {
      expect(r.triggers.length, `${r.system_key} saknar triggers`).toBeGreaterThan(0)
    }
  })

  test('nyckelord är gemener — matchningen jämför mot lowercase-beskrivning', () => {
    for (const r of getAllReservationDefaults()) {
      for (const t of r.triggers.filter(t => t.type === 'keyword')) {
        expect(t.value, `${r.system_key}: ${t.value}`).toBe(t.value.toLowerCase())
      }
    }
  })

  test('kategoritriggers pekar på riktiga systemkategorier', () => {
    const validSlugs = new Set([
      'arbete_el', 'arbete_vvs', 'arbete_bygg', 'arbete_maleri', 'arbete_rut',
      'material_el', 'material_vvs', 'material_bygg', 'hyra', 'ue', 'resa', 'ovrigt',
    ])
    for (const r of getAllReservationDefaults()) {
      for (const t of r.triggers.filter(t => t.type === 'category')) {
        expect(validSlugs.has(t.value), `${r.system_key} pekar på okänd kategori ${t.value}`).toBe(true)
      }
    }
  })

  test('texterna åberopar aldrig standardavtal — vi ger mallar, inte juridik', () => {
    const forbidden = ['ABS 18', 'ABS18', 'AB 04', 'Hantverkarformuläret', 'konsumenttjänstlagen']
    for (const r of getAllReservationDefaults()) {
      for (const term of forbidden) {
        expect(r.content.toLowerCase()).not.toContain(term.toLowerCase())
      }
    }
  })

  test('seedbiblioteket går att mata rakt in i matchningsmotorn', () => {
    // Formen måste passa ReservationWithTriggers — annars upptäcks glappet
    // först i produktion, när seeden redan skrivits till databasen.
    const library: ReservationWithTriggers[] = getDefaultReservations('construction').map((r, i) => ({
      id: `res_${i}`,
      title: r.title,
      content: r.content,
      triggers: r.triggers.map(t => ({
        trigger_type: t.type,
        category_slug: t.type === 'category' ? t.value : null,
        keyword: t.type === 'keyword' ? t.value : null,
      })),
    }))
    const suggestions = matchReservations(
      [{ id: 'qi_1', description: 'Rivning badrum', item_type: 'item' }],
      library,
    )
    expect(suggestions.length).toBeGreaterThan(0)
  })
})
