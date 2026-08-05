/**
 * Facit-tester för tyst-kund-primitiven (VP3 gap 6,
 * tasks/vilande-pengar-masterplan.md) — de RENA funktionerna i
 * lib/customers/quiet-customer.ts. I/O-funktionen (fetchQuietCustomers)
 * testas medvetet inte — den är ett tunt fail-soft-skal runt samma villkor.
 *
 * Kärnkravet: EN beräkning, parametriserade trösklar. hanna-outbounds
 * 6 mån (=180 dgr) och capacity-fills 90 dgr är MEDVETET olika och ska
 * förbli det — det som förenas är matematiken (30-dagarsmånad, inklusiv
 * gräns, Math.floor på dagar).
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quiet-customer.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import {
  quietCutoffIso,
  isQuietCustomer,
  daysSinceLastJob,
  monthsSinceLastJob,
  QUIET_MONTH_DAYS,
  HANNA_OUTBOUND_QUIET_DAYS,
  CAPACITY_FILL_QUIET_DAYS,
} from '../lib/customers/quiet-customer'

const DAY_MS = 24 * 60 * 60 * 1000
// Fast tidsankare — aldrig Date.now() i facit-tester.
const T0 = new Date('2026-08-05T12:00:00.000Z').getTime()

function daysAgoIso(days: number): string {
  return new Date(T0 - days * DAY_MS).toISOString()
}

test.describe('trösklarna — medvetet olika, dokumenterade värden', () => {
  test('hanna-outbound: 6 mån = 180 dagar (6 × 30-dagarsmånad, bevarat beteende)', () => {
    expect(HANNA_OUTBOUND_QUIET_DAYS).toBe(180)
    expect(HANNA_OUTBOUND_QUIET_DAYS).toBe(6 * QUIET_MONTH_DAYS)
  })

  test('capacity-fill: 90 dagar (bevarat beteende)', () => {
    expect(CAPACITY_FILL_QUIET_DAYS).toBe(90)
  })
})

test.describe('quietCutoffIso — querycutoffen', () => {
  test('cutoff är exakt thresholdDays bakåt', () => {
    expect(quietCutoffIso(T0, 90)).toBe(new Date(T0 - 90 * DAY_MS).toISOString())
    expect(quietCutoffIso(T0, 180)).toBe(new Date(T0 - 180 * DAY_MS).toISOString())
  })
})

test.describe('isQuietCustomer — inklusiv gräns, null-hantering', () => {
  test('exakt på tröskeldagen räknas som tyst (samma som queryns lte)', () => {
    expect(isQuietCustomer(daysAgoIso(90), T0, 90)).toBe(true)
  })

  test('en millisekund innanför tröskeln → inte tyst', () => {
    expect(isQuietCustomer(new Date(T0 - 90 * DAY_MS + 1).toISOString(), T0, 90)).toBe(false)
  })

  test('äldre än tröskeln → tyst', () => {
    expect(isQuietCustomer(daysAgoIso(91), T0, 90)).toBe(true)
    expect(isQuietCustomer(daysAgoIso(400), T0, 180)).toBe(true)
  })

  test('null/undefined/ogiltigt datum → aldrig tyst (kan ej bekräftas som tidigare kund)', () => {
    expect(isQuietCustomer(null, T0, 90)).toBe(false)
    expect(isQuietCustomer(undefined, T0, 90)).toBe(false)
    expect(isQuietCustomer('inte-ett-datum', T0, 90)).toBe(false)
  })

  test('DATE-format (utan tid) fungerar — customer.last_job_date är en DATE-kolumn', () => {
    expect(isQuietCustomer('2026-01-01', T0, 90)).toBe(true)
    expect(isQuietCustomer('2026-08-04', T0, 90)).toBe(false)
  })
})

test.describe('daysSinceLastJob / monthsSinceLastJob — golvad räkning', () => {
  test('hela dagar golvas (Math.floor)', () => {
    expect(daysSinceLastJob(daysAgoIso(90), T0)).toBe(90)
    expect(daysSinceLastJob(new Date(T0 - 90 * DAY_MS - 1).toISOString(), T0)).toBe(90)
    expect(daysSinceLastJob(new Date(T0 - 91 * DAY_MS).toISOString(), T0)).toBe(91)
  })

  test('månader är 30-dagarsmånader, golvade — samma som hanna-outbounds gamla inline-beräkning', () => {
    expect(monthsSinceLastJob(daysAgoIso(180), T0)).toBe(6)
    expect(monthsSinceLastJob(daysAgoIso(179), T0)).toBe(5)
    expect(monthsSinceLastJob(daysAgoIso(30), T0)).toBe(1)
    expect(monthsSinceLastJob(daysAgoIso(29), T0)).toBe(0)
  })

  test('proactive-cares livscykelfönster fungerar med 30-dagarsmånader (24 mån-exemplet)', () => {
    // 24 mån = 720 dagar; fönstret är [months, months+6] i hela månader
    const months = monthsSinceLastJob(daysAgoIso(720), T0)!
    expect(months).toBe(24)
    expect(months >= 24 && months <= 24 + 6).toBe(true)
    // 31 månader (930 dgr) → utanför fönstret
    const tooOld = monthsSinceLastJob(daysAgoIso(930), T0)!
    expect(tooOld > 24 + 6).toBe(true)
  })

  test('null/ogiltigt datum → null', () => {
    expect(daysSinceLastJob(null, T0)).toBeNull()
    expect(monthsSinceLastJob(undefined, T0)).toBeNull()
    expect(monthsSinceLastJob('trasigt', T0)).toBeNull()
  })
})
