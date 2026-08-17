/**
 * FACIT — lib/mission/mission-learning.ts (Etapp H, Mission Learning-
 * läslagret, tasks/jaunty-pondering-hummingbird.md).
 *
 * Vaktposterna som låses här:
 *  - min-data-grinden: färre än 3 learning_eligible uppdrag av samma
 *    goal_type ger INGEN rad för den målstypen; om ingen målstyp når 3 →
 *    forTidigt: true, inga rader.
 *  - byggLearningRows filtrerar INTERNT på learning_eligible — icke-eligible
 *    rader (cancelled/expired/active/degraderade) påverkar aldrig antalet
 *    eller texterna.
 *  - källkodsskanning: inget kausalitetsverb i lib/mission/mission-learning.ts.
 *
 * Körs: npx playwright test tests/mission-learning.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import { byggLearningRows, MIN_ELIGIBLE_PER_GOAL_TYPE } from '../lib/mission/mission-learning'
import type { MissionFacit } from '../lib/mission/mission-facit'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

function facit(overrides: Partial<MissionFacit> = {}): MissionFacit {
  return {
    mission_id: 'mis_1',
    goal_type: 'money',
    status: 'completed',
    headline: 'Frigöra 100 000 kr före 2026-06-01',
    deadline: '2026-06-01',
    resolved_at: '2026-05-20T00:00:00Z',
    slutgap_kr: 0,
    slutgap_hours: null,
    verifierat_betalt_kr: 40000,
    learning_eligible: true,
    learning_blockers: [],
    per_agent: [{ agent_key: 'karin', ansvarar_steg: 1, utforda: 1, vantar: 0, kunde_inte_verifieras: 0 }],
    ...overrides,
  }
}

test.describe('byggLearningRows — min-data-grinden', () => {
  test('tom lista → forTidigt, antalEligible 0', () => {
    const res = byggLearningRows([])
    expect(res.forTidigt).toBe(true)
    expect(res.antalEligible).toBe(0)
    expect(res.rows).toEqual([])
  })

  test('färre än 3 eligible pengamål → ingen rad, forTidigt sant', () => {
    const rows = [facit({ mission_id: 'a' }), facit({ mission_id: 'b' })]
    const res = byggLearningRows(rows)
    expect(res.forTidigt).toBe(true)
    expect(res.rows).toEqual([])
    expect(res.antalEligible).toBe(2)
  })

  test('exakt 3 eligible pengamål → rader genereras, forTidigt falskt', () => {
    const rows = [facit({ mission_id: 'a' }), facit({ mission_id: 'b' }), facit({ mission_id: 'c' })]
    const res = byggLearningRows(rows)
    expect(res.forTidigt).toBe(false)
    expect(res.rows.length).toBeGreaterThan(0)
    expect(res.antalEligible).toBe(3)
  })

  test('icke-eligible rader (cancelled/expired/active) räknas aldrig med, oavsett antal', () => {
    const rows = [
      facit({ mission_id: 'a', learning_eligible: false, status: 'cancelled', learning_blockers: ['avbrutet uppdrag'] }),
      facit({ mission_id: 'b', learning_eligible: false, status: 'expired', learning_blockers: ['utgånget uppdrag'] }),
      facit({ mission_id: 'c', learning_eligible: false, status: 'active', learning_blockers: ['uppdraget pågår fortfarande'] }),
    ]
    const res = byggLearningRows(rows)
    expect(res.forTidigt).toBe(true)
    expect(res.antalEligible).toBe(0)
    expect(res.rows).toEqual([])
  })

  test('goal_type-typerna är oberoende grindar: 3 pengamål + 1 kapacitetsmål ger bara pengamåls-rader', () => {
    const rows = [
      facit({ mission_id: 'a', goal_type: 'money' }),
      facit({ mission_id: 'b', goal_type: 'money' }),
      facit({ mission_id: 'c', goal_type: 'money' }),
      facit({ mission_id: 'd', goal_type: 'capacity', slutgap_kr: null, slutgap_hours: 0 }),
    ]
    const res = byggLearningRows(rows)
    expect(res.forTidigt).toBe(false)
    for (const row of res.rows) {
      expect(row.text).not.toContain('kapacitetsmål')
    }
  })

  test('MIN_ELIGIBLE_PER_GOAL_TYPE är 3', () => {
    expect(MIN_ELIGIBLE_PER_GOAL_TYPE).toBe(3)
  })
})

test.describe('byggLearningRows — räknade fakta, inte kausalitet', () => {
  test('pengamål: "N av M pengamål nådde målet före deadline" — räknad kvot, ingen orsak', () => {
    const rows = [
      facit({ mission_id: 'a', slutgap_kr: 0 }),
      facit({ mission_id: 'b', slutgap_kr: 0 }),
      facit({ mission_id: 'c', slutgap_kr: 5000 }), // nådde inte
    ]
    const res = byggLearningRows(rows)
    const rad = res.rows.find(r => r.text.includes('pengamål nådde målet'))
    expect(rad?.text).toBe('2 av 3 pengamål nådde målet före deadline')
    expect(rad?.grund).toBe('3 avslutade uppdrag')
  })

  test('kapacitetsmål: "N av M kapacitetsmål nådde sin målveckas timmar"', () => {
    const rows = [
      facit({ mission_id: 'a', goal_type: 'capacity', slutgap_kr: null, slutgap_hours: 0 }),
      facit({ mission_id: 'b', goal_type: 'capacity', slutgap_kr: null, slutgap_hours: 0 }),
      facit({ mission_id: 'c', goal_type: 'capacity', slutgap_kr: null, slutgap_hours: 3 }),
    ]
    const res = byggLearningRows(rows)
    const rad = res.rows.find(r => r.text.includes('kapacitetsmål'))
    expect(rad?.text).toBe('2 av 3 kapacitetsmål nådde sin målveckas timmar')
  })

  test('varje rad bär sin grund som "N avslutade uppdrag"', () => {
    const rows = [facit({ mission_id: 'a' }), facit({ mission_id: 'b' }), facit({ mission_id: 'c' })]
    const res = byggLearningRows(rows)
    for (const row of res.rows) {
      expect(row.grund).toMatch(/^\d+ avslutade uppdrag$/)
    }
  })

  test('agentraden räknar utforda-summan, aldrig ansvarar_steg', () => {
    const rows = [
      facit({ mission_id: 'a', per_agent: [{ agent_key: 'karin', ansvarar_steg: 5, utforda: 1, vantar: 0, kunde_inte_verifieras: 0 }] }),
      facit({ mission_id: 'b', per_agent: [{ agent_key: 'lars', ansvarar_steg: 1, utforda: 3, vantar: 0, kunde_inte_verifieras: 0 }] }),
      facit({ mission_id: 'c', per_agent: [{ agent_key: 'lars', ansvarar_steg: 1, utforda: 2, vantar: 0, kunde_inte_verifieras: 0 }] }),
    ]
    const res = byggLearningRows(rows)
    // Lars: 3+2=5 utförda; Karin: 1 utförd (trots att Karin "ansvarar" för flest steg).
    const rad = res.rows.find(r => r.text.includes('stod för flest utförda steg'))
    expect(rad?.text).toContain('Lars')
    expect(rad?.text).not.toContain('Karin')
  })

  test('fakturadedup-dokumentationen: filen läser aldrig invoice-tabellen, adderar bara redan deduplicerade per-uppdrags-tal', () => {
    const rows = [facit({ mission_id: 'a', verifierat_betalt_kr: 10000 }), facit({ mission_id: 'b', verifierat_betalt_kr: 5000 }), facit({ mission_id: 'c', verifierat_betalt_kr: 0 })]
    const res = byggLearningRows(rows)
    const rad = res.rows.find(r => r.text.includes('verifierat betalt'))
    expect(rad?.text).toBe(`Pengamål stod för ${(15000).toLocaleString('sv-SE')} kr verifierat betalt i 3 avslutade uppdrag`)
  })
})

test.describe('mission-learning.ts — källskanning: inget kausalitetspåstående', () => {
  const kalla = read('lib/mission/mission-learning.ts').toLowerCase()

  // Ordlistan hör hemma HÄR, inte i källfilen — annars fastnar filhuvudets
  // egen regelbeskrivning i sin egen fälla (samma disciplin som
  // tests/checkpoint-outcomes.spec.ts).
  const forbjudnaOrd = ['orsakade', 'gav bättre', 'berodde på', 'ledde till', 'fungerar bäst']

  for (const ord of forbjudnaOrd) {
    test(`förbjudet ord "${ord}" förekommer inte`, () => {
      expect(kalla).not.toContain(ord)
    })
  }

  test('filen läser aldrig en fakturatabell (invoice) direkt — bara MissionFacit-fält', () => {
    expect(kalla).not.toContain(".from('invoice')")
    expect(kalla).not.toContain('supabaseclient')
  })

  test('filhuvudet dokumenterar kausalitetsregeln och fakturadedup-regeln', () => {
    expect(kalla).toContain('kausalitet')
    expect(kalla).toContain('fakturadedup')
  })
})
