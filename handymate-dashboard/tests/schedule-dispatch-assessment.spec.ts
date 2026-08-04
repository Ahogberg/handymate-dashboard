/**
 * Dispatch-bedömningen för resurstavlans drag-drop-tilldelning — facit-
 * tester för den rena funktionen (tasks/resurs-masterplan.md, R2 punkt
 * 4). Körs:
 *   npx playwright test tests/schedule-dispatch-assessment.spec.ts --no-deps
 *
 * assessDispatchCandidate återanvänder normalizeJobType/resolveMemberSkills
 * (redan facit-testade i tests/dispatch-matching.spec.ts) — testerna här
 * fokuserar på det NYA: skillMatch-sammanslagningen och krockdetekteringen.
 */
import { test, expect } from '@playwright/test'
import { assessDispatchCandidate } from '../lib/schedule/dispatch-assessment'
import type { PersonDayShift } from '../lib/schedule/person-day'

function existingShift(overrides: Partial<PersonDayShift> = {}): PersonDayShift {
  return {
    source: 'schedule',
    type: 'internal',
    start: '2026-08-10T08:00:00.000Z',
    end: '2026-08-10T10:00:00.000Z',
    title: 'Internmöte',
    refId: 'entry_1',
    projectId: null,
    customerId: null,
    allDay: false,
    conflict: false,
    ...overrides,
  }
}

test.describe('assessDispatchCandidate — kompetens', () => {
  test('rätt kompetens → skillMatch true, matchedSkills fylld', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'Elinstallation i kök',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [],
    })
    expect(result.skillMatch).toBe(true)
    expect(result.matchedSkills).toEqual(['el'])
    expect(result.isGeneralist).toBe(false)
  })

  test('fel kompetens → skillMatch false, isGeneralist false', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['vvs'] },
      jobText: 'Elinstallation i kök',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [],
    })
    expect(result.skillMatch).toBe(false)
    expect(result.isGeneralist).toBe(false)
  })

  test('ingen specialitet alls → generalist, skillMatch false', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: [] },
      jobText: 'Elinstallation i kök',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [],
    })
    expect(result.skillMatch).toBe(false)
    expect(result.isGeneralist).toBe(true)
  })

  test('skills-JSONB fallback används när specialties tom (resolveMemberSkills-parity)', () => {
    const result = assessDispatchCandidate({
      member: { skills: ['bygg'], specialties: [] },
      jobText: 'Renovera kök',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [],
    })
    expect(result.skillMatch).toBe(true)
    expect(result.memberSkills).toEqual(['bygg'])
  })
})

test.describe('assessDispatchCandidate — krock', () => {
  test('inga befintliga pass → ingen krock', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'El',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [],
    })
    expect(result.hasConflict).toBe(false)
    expect(result.conflictingShifts).toEqual([])
  })

  test('överlappande befintligt pass → krock flaggas men blockerar aldrig (bara data)', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'El',
      bookingStart: '2026-08-10T09:00:00.000Z',
      bookingEnd: '2026-08-10T11:00:00.000Z',
      existingShifts: [existingShift()], // 08:00-10:00, överlappar 09:00-11:00
    })
    expect(result.hasConflict).toBe(true)
    expect(result.conflictingShifts).toHaveLength(1)
  })

  test('pass som bara nuddar varandra (halvöppet intervall) → INTE krock', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'El',
      bookingStart: '2026-08-10T10:00:00.000Z',
      bookingEnd: '2026-08-10T12:00:00.000Z',
      existingShifts: [existingShift({ start: '2026-08-10T08:00:00.000Z', end: '2026-08-10T10:00:00.000Z' })],
    })
    expect(result.hasConflict).toBe(false)
  })

  test('pass en annan dag → ingen krock', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'El',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T10:00:00.000Z',
      existingShifts: [existingShift({ start: '2026-08-11T08:00:00.000Z', end: '2026-08-11T10:00:00.000Z' })],
    })
    expect(result.hasConflict).toBe(false)
  })

  test('flera krockande pass → alla listas', () => {
    const result = assessDispatchCandidate({
      member: { skills: [], specialties: ['el'] },
      jobText: 'El',
      bookingStart: '2026-08-10T08:00:00.000Z',
      bookingEnd: '2026-08-10T17:00:00.000Z',
      existingShifts: [
        existingShift({ refId: 'a', start: '2026-08-10T08:00:00.000Z', end: '2026-08-10T09:00:00.000Z' }),
        existingShift({ refId: 'b', start: '2026-08-10T15:00:00.000Z', end: '2026-08-10T16:00:00.000Z' }),
      ],
    })
    expect(result.conflictingShifts).toHaveLength(2)
  })
})
