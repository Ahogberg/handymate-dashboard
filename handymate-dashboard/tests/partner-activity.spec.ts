/**
 * Sanningstabell för partnerportalens aktivitetsnivå (2026-08-11).
 *
 *   npx playwright test tests/partner-activity.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import { deriveActivityLevel, INAKTIV_EFTER_DAGAR } from '../lib/partners/activity'

const NU = new Date('2026-08-11T12:00:00Z')
const dagarSedan = (d: number) => new Date(NU.getTime() - d * 24 * 60 * 60 * 1000).toISOString()

test('churn slår allt — även med färsk betalning', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'cancelled',
    onboardingCompletedAt: dagarSedan(100),
    lastPaymentAt: dagarSedan(1),
    now: NU,
  })).toBe('churnad')
})

test('ingen betalning än → onboardar', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'active',
    onboardingCompletedAt: dagarSedan(2),
    lastPaymentAt: null,
    now: NU,
  })).toBe('onboardar')
})

test('onboarding ej klar → onboardar trots betalning', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'active',
    onboardingCompletedAt: null,
    lastPaymentAt: dagarSedan(5),
    now: NU,
  })).toBe('onboardar')
})

test('past_due → inaktiv', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'past_due',
    onboardingCompletedAt: dagarSedan(60),
    lastPaymentAt: dagarSedan(10),
    now: NU,
  })).toBe('inaktiv')
})

test(`betalning äldre än ${INAKTIV_EFTER_DAGAR} dagar → inaktiv`, () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'active',
    onboardingCompletedAt: dagarSedan(120),
    lastPaymentAt: dagarSedan(INAKTIV_EFTER_DAGAR + 1),
    now: NU,
  })).toBe('inaktiv')
})

test('färsk betalning + klar onboarding → aktiv', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'active',
    onboardingCompletedAt: dagarSedan(90),
    lastPaymentAt: dagarSedan(12),
    now: NU,
  })).toBe('aktiv')
})

test('betalning på gränsdagen räknas som aktiv', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'active',
    onboardingCompletedAt: dagarSedan(90),
    lastPaymentAt: dagarSedan(INAKTIV_EFTER_DAGAR),
    now: NU,
  })).toBe('aktiv')
})

test('amerikansk stavning canceled hanteras', () => {
  expect(deriveActivityLevel({
    subscriptionStatus: 'canceled',
    onboardingCompletedAt: dagarSedan(10),
    lastPaymentAt: dagarSedan(5),
    now: NU,
  })).toBe('churnad')
})
