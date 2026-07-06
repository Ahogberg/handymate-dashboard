/**
 * Aha-onboardingens testfönster — rena funktioner.
 * Körs: npx playwright test tests/test-call.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { isTestCallArmed, ARM_WINDOW_MINUTES, type TestCallState } from '../lib/onboarding/test-call'

const NOW = new Date('2026-07-06T12:00:00Z').getTime()

test.describe('isTestCallArmed', () => {
  test('armerad när armed_until ligger i framtiden', () => {
    const s: TestCallState = { armed_until: new Date(NOW + 60_000).toISOString() }
    expect(isTestCallArmed(s, NOW)).toBe(true)
  })
  test('oarmerad när fönstret passerat', () => {
    const s: TestCallState = { armed_until: new Date(NOW - 1_000).toISOString() }
    expect(isTestCallArmed(s, NOW)).toBe(false)
  })
  test('oarmerad för null/undefined/saknad armed_until', () => {
    expect(isTestCallArmed(null, NOW)).toBe(false)
    expect(isTestCallArmed(undefined, NOW)).toBe(false)
    expect(isTestCallArmed({}, NOW)).toBe(false)
    expect(isTestCallArmed({ armed_until: null }, NOW)).toBe(false)
  })
  test('oarmerad för ogiltigt datum', () => {
    expect(isTestCallArmed({ armed_until: 'skräp' }, NOW)).toBe(false)
  })
  test('ARM_WINDOW_MINUTES är 10', () => {
    expect(ARM_WINDOW_MINUTES).toBe(10)
  })
})
