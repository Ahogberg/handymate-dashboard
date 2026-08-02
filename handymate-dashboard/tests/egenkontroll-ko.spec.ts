/**
 * Egenkontroll-agenten — Etapp 1b facit-tester för kö-integrationen.
 * Körs: npx playwright test tests/egenkontroll-ko.spec.ts --no-deps
 *
 * Testar de rena, exporterade funktionerna i
 * lib/egenkontroll/analyze-and-queue.ts:
 *   - buildQueueActionsFromAssessment (resultattolkning: vilka bedömningar
 *     ger förslag-kort, vilka ger avvikelse-kort, vilka ger ingenting)
 *   - buildDedupMatch (dedup-nyckeln som skickas till
 *     `.contains('payload', ...)`)
 *
 * INGEN DB, INGET Supabase, INGET live-API — analyzeProjectPhoto (som
 * gör I/O) testas inte här, bara den rena tolkningslogiken den bygger på.
 */
import { test, expect } from '@playwright/test'
import {
  buildQueueActionsFromAssessment,
  buildDedupMatch,
  type ChecklistItemForQueue,
} from '../lib/egenkontroll/analyze-and-queue'
import type { PunktBedömning } from '../lib/egenkontroll/photo-assessment'

const ITEMS: ChecklistItemForQueue[] = [
  { id: 'ci_1', text: 'Tätskikt applicerat enligt BBV', checked: false },
  { id: 'ci_2', text: 'Verifiera fall mot brunn', checked: false },
  { id: 'ci_3', text: 'Kontrollera ventilation', checked: false },
  { id: 'ci_4', text: 'Redan avbockad punkt', checked: true },
]

function bedomning(overrides: Partial<PunktBedömning> & { punktId: string }): PunktBedömning {
  return {
    status: 'ej_bedombar',
    motivering: 'Testmotivering',
    konfidens: 'lag',
    ...overrides,
  }
}

test.describe('buildQueueActionsFromAssessment — resultattolkning', () => {
  test('stods + hog + ej checked → förslag', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_1', status: 'stods', konfidens: 'hog', motivering: 'Tätskikt syns tydligt.' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([
      { punkt_id: 'ci_1', text: 'Tätskikt applicerat enligt BBV', motivering: 'Tätskikt syns tydligt.' },
    ])
    expect(result.avvikelser).toEqual([])
  })

  test('stods + medel → ingenting (för osäkert för att föreslå)', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_1', status: 'stods', konfidens: 'medel' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('stods + lag → ingenting', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_1', status: 'stods', konfidens: 'lag' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('stods + hog men punkten redan checked → ingenting', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_4', status: 'stods', konfidens: 'hog' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('motsags → avvikelse, oavsett konfidens', () => {
    const lagKonfidens = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_2', status: 'motsags', konfidens: 'lag', motivering: 'Fallet lutar fel väg.' })],
      ITEMS,
    )
    expect(lagKonfidens.forslag).toEqual([])
    expect(lagKonfidens.avvikelser).toEqual([
      { punkt_id: 'ci_2', punkttext: 'Verifiera fall mot brunn', motivering: 'Fallet lutar fel väg.' },
    ])

    const hogKonfidens = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_2', status: 'motsags', konfidens: 'hog' })],
      ITEMS,
    )
    expect(hogKonfidens.avvikelser).toHaveLength(1)
  })

  test('motsags på redan checkad punkt → flaggas ändå (avvikelse tystas inte av checked-state)', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_4', status: 'motsags', motivering: 'Ser ofullständigt ut trots avbockning.' })],
      ITEMS,
    )
    expect(result.avvikelser).toHaveLength(1)
    expect(result.avvikelser[0].punkt_id).toBe('ci_4')
  })

  test('ej_synlig → ingenting', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_3', status: 'ej_synlig', konfidens: 'hog' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('ej_bedombar → ingenting', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_3', status: 'ej_bedombar', konfidens: 'hog' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('punktId som inte finns i checklistan (borttagen sedan bedömningen kördes) → ignoreras', () => {
    const result = buildQueueActionsFromAssessment(
      [bedomning({ punktId: 'ci_okänd_999', status: 'stods', konfidens: 'hog' })],
      ITEMS,
    )
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })

  test('blandad lista: flera punkter ger både förslag och avvikelser samtidigt', () => {
    const result = buildQueueActionsFromAssessment(
      [
        bedomning({ punktId: 'ci_1', status: 'stods', konfidens: 'hog', motivering: 'Ser bra ut.' }),
        bedomning({ punktId: 'ci_2', status: 'motsags', motivering: 'Fel fall.' }),
        bedomning({ punktId: 'ci_3', status: 'ej_synlig' }),
      ],
      ITEMS,
    )
    expect(result.forslag).toHaveLength(1)
    expect(result.forslag[0].punkt_id).toBe('ci_1')
    expect(result.avvikelser).toHaveLength(1)
    expect(result.avvikelser[0].punkt_id).toBe('ci_2')
  })

  test('tom bedömningslista → tomma listor', () => {
    const result = buildQueueActionsFromAssessment([], ITEMS)
    expect(result.forslag).toEqual([])
    expect(result.avvikelser).toEqual([])
  })
})

test.describe('buildDedupMatch — dedup-nyckel', () => {
  test('egenkontroll_foto: matchar bara checklist_id + photo_ref (inget punkt_id)', () => {
    const match = buildDedupMatch('egenkontroll_foto', 'cl_123', 'doc_abc')
    expect(match).toEqual({ checklist_id: 'cl_123', photo_ref: 'doc_abc' })
  })

  test('egenkontroll_foto ignorerar punktId även om det skickas med', () => {
    const match = buildDedupMatch('egenkontroll_foto', 'cl_123', 'doc_abc', 'ci_1')
    expect(match).toEqual({ checklist_id: 'cl_123', photo_ref: 'doc_abc' })
  })

  test('egenkontroll_avvikelse: matchar checklist_id + photo_ref + punkt_id', () => {
    const match = buildDedupMatch('egenkontroll_avvikelse', 'cl_123', 'doc_abc', 'ci_2')
    expect(match).toEqual({ checklist_id: 'cl_123', photo_ref: 'doc_abc', punkt_id: 'ci_2' })
  })

  test('egenkontroll_avvikelse för OLIKA punkter på samma foto ger OLIKA dedup-nycklar (ingen tystar den andra)', () => {
    const matchA = buildDedupMatch('egenkontroll_avvikelse', 'cl_123', 'doc_abc', 'ci_1')
    const matchB = buildDedupMatch('egenkontroll_avvikelse', 'cl_123', 'doc_abc', 'ci_2')
    expect(matchA).not.toEqual(matchB)
  })

  test('egenkontroll_avvikelse utan punktId → faller tillbaka till samma form som foto-dedup', () => {
    const match = buildDedupMatch('egenkontroll_avvikelse', 'cl_123', 'doc_abc')
    expect(match).toEqual({ checklist_id: 'cl_123', photo_ref: 'doc_abc' })
  })
})
