/**
 * Facit för frånvarofönstret (Etapp Å) — isAbsenceActive/isValidAbsenceRange
 * är rena funktioner, testbara utan Supabase/klocka.
 *
 *   npx playwright test tests/absence-window.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { isAbsenceActive, isValidAbsenceRange, type AbsenceWindow } from '../lib/absence/absence-window'

const window = (from: string, to: string, over: Partial<AbsenceWindow> = {}): AbsenceWindow => ({
  from, to, setBy: 'bu_1', setAt: '2026-08-14T08:00:00.000Z', ...over,
})

test.describe('isAbsenceActive', () => {
  test('null-fönster är aldrig aktivt', () => {
    expect(isAbsenceActive(null, new Date('2026-08-15T10:00:00.000Z'))).toBe(false)
  })

  test('nu inom [from, to] är aktivt, inklusive gränserna', () => {
    const w = window('2026-08-14T00:00:00.000Z', '2026-08-16T23:59:59.000Z')
    expect(isAbsenceActive(w, new Date('2026-08-15T12:00:00.000Z'))).toBe(true)
    expect(isAbsenceActive(w, new Date('2026-08-14T00:00:00.000Z'))).toBe(true)
    expect(isAbsenceActive(w, new Date('2026-08-16T23:59:59.000Z'))).toBe(true)
  })

  test('före from eller efter to är inaktivt', () => {
    const w = window('2026-08-14T00:00:00.000Z', '2026-08-16T23:59:59.000Z')
    expect(isAbsenceActive(w, new Date('2026-08-13T23:59:59.000Z'))).toBe(false)
    expect(isAbsenceActive(w, new Date('2026-08-17T00:00:00.000Z'))).toBe(false)
  })

  test('ett passerat fönster upphör automatiskt genom läs-tids-check', () => {
    const gammalt = window('2026-01-01T00:00:00.000Z', '2026-01-05T00:00:00.000Z')
    expect(isAbsenceActive(gammalt, new Date('2026-08-15T10:00:00.000Z'))).toBe(false)
  })

  test('trasiga datum är fail-closed inaktiva, inte ett kastat fel', () => {
    const trasigt = window('inte-ett-datum', '2026-08-16T00:00:00.000Z')
    expect(isAbsenceActive(trasigt, new Date('2026-08-15T10:00:00.000Z'))).toBe(false)
  })
})

test.describe('isValidAbsenceRange', () => {
  test('to efter from är giltigt', () => {
    expect(isValidAbsenceRange('2026-08-14T00:00:00.000Z', '2026-08-16T00:00:00.000Z')).toBe(true)
  })

  test('to före eller lika med from är ogiltigt', () => {
    expect(isValidAbsenceRange('2026-08-16T00:00:00.000Z', '2026-08-14T00:00:00.000Z')).toBe(false)
    expect(isValidAbsenceRange('2026-08-14T00:00:00.000Z', '2026-08-14T00:00:00.000Z')).toBe(false)
  })

  test('ogiltiga datum är alltid ogiltiga', () => {
    expect(isValidAbsenceRange('skräp', '2026-08-16T00:00:00.000Z')).toBe(false)
  })
})
