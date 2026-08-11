/**
 * Härdning av förtjänad autonomi — enhetstester för de rena funktionerna
 * (resolveAutonomyCap, underAutonomyCap, computeStreakFromRows-nedgraderingen
 * vid redigering, trimRecentFailures). Kompletterar tests/earned-autonomy.spec.ts
 * (som redan äger deriveAutonomyKey/autonomyKeyFromApproval/streak-grunderna).
 *
 * Bakgrund: tre säkerhetsluckor stängdes 2026-08-12 —
 *  1) ingen beloppsgräns (ett stort belopp tog samma autonoma väg som ett litet)
 *  2) nedgradering var onåbar efter grant (körningsfel rörde aldrig autonomin)
 *  3) en redigering av ett keyed kort hoppade över streaken i stället för att bryta den
 *
 * Körs: npx playwright test tests/autonomy-hardening.spec.ts --no-deps
 * (samma mönster som tests/earned-autonomy.spec.ts — inga browser/server-beroenden)
 */
import { test, expect } from '@playwright/test'
import {
  resolveAutonomyCap,
  underAutonomyCap,
  computeStreakFromRows,
  trimRecentFailures,
  DEFAULT_AUTONOMY_CAPS,
  type AutonomyState,
  type ResolvedApprovalRow,
} from '../lib/autonomy/earned-autonomy'

function row(over: Partial<ResolvedApprovalRow>): ResolvedApprovalRow {
  return {
    approval_type: 'automation',
    status: 'approved',
    payload: { autonomy_key: 'invoice_reminder' },
    created_at: new Date().toISOString(),
    ...over,
  }
}

test.describe('resolveAutonomyCap', () => {
  test('nyckel utan override → default-caps värde', () => {
    expect(resolveAutonomyCap({}, 'invoice_reminder')).toBe(25000)
    expect(resolveAutonomyCap({}, 'quote_followup_sms')).toBe(50000)
  })

  test('per-nyckel-override i state vinner över default', () => {
    const state: AutonomyState = {
      invoice_reminder: { status: 'autonomous', granted_at: new Date().toISOString(), cap_kr: 100000 },
    }
    expect(resolveAutonomyCap(state, 'invoice_reminder')).toBe(100000)
  })

  test('nycklar utan default (booking_reminder, review_request) → null om ingen override', () => {
    expect(resolveAutonomyCap({}, 'booking_reminder')).toBeNull()
    expect(resolveAutonomyCap({}, 'review_request')).toBeNull()
  })

  test('DEFAULT_AUTONOMY_CAPS bär bara de två belopp-bärande nycklarna', () => {
    expect(DEFAULT_AUTONOMY_CAPS.invoice_reminder).toBe(25000)
    expect(DEFAULT_AUTONOMY_CAPS.quote_followup_sms).toBe(50000)
    expect(DEFAULT_AUTONOMY_CAPS.booking_reminder).toBeUndefined()
    expect(DEFAULT_AUTONOMY_CAPS.review_request).toBeUndefined()
  })
})

test.describe('underAutonomyCap (fail-closed)', () => {
  test('ingen gräns (null) → alltid true', () => {
    expect(underAutonomyCap(null, 500000)).toBe(true)
    expect(underAutonomyCap(null, null)).toBe(true)
    expect(underAutonomyCap(null, undefined)).toBe(true)
  })

  test('belopp under/på gränsen → true', () => {
    expect(underAutonomyCap(25000, 10000)).toBe(true)
    expect(underAutonomyCap(25000, 25000)).toBe(true)
  })

  test('belopp över gränsen → false', () => {
    expect(underAutonomyCap(25000, 25001)).toBe(false)
    expect(underAutonomyCap(25000, 500000)).toBe(false)
  })

  test('gräns satt men beloppet okänt → FALSE, fail-closed', () => {
    expect(underAutonomyCap(25000, null)).toBe(false)
    expect(underAutonomyCap(25000, undefined)).toBe(false)
  })
})

test.describe('computeStreakFromRows — redigering bryter streaken', () => {
  test('en redigering mitt i stoppar räkningen precis som en avvisning', () => {
    const rows = [
      row({}),
      row({}),
      row({ payload: { autonomy_key: 'invoice_reminder', edited: true } }),
      row({}),
      row({}),
    ]
    // Två godkända FÖRE redigeringen räknas, resten (efter — dvs äldre) räknas inte.
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(2)
  })

  test('redigeringen är den nyaste raden → streak blir 0', () => {
    const rows = [
      row({ payload: { autonomy_key: 'invoice_reminder', edited: true } }),
      row({}),
      row({}),
    ]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(0)
  })

  test('ingen redigering i fönstret → oförändrat beteende (räknar alla godkända)', () => {
    const rows = [row({}), row({}), row({})]
    expect(computeStreakFromRows(rows, 'invoice_reminder')).toBe(3)
  })
})

test.describe('trimRecentFailures (14-dagarsfönstret)', () => {
  const now = new Date('2026-08-12T10:00:00.000Z').toISOString()

  test('färska fel (inom 14 dagar) behålls', () => {
    const nine = new Date('2026-08-03T10:00:00.000Z').toISOString() // 9 dagar sedan
    expect(trimRecentFailures([nine], now)).toEqual([nine])
  })

  test('gamla fel (äldre än 14 dagar) filtreras bort', () => {
    const fifteen = new Date('2026-07-28T09:00:00.000Z').toISOString() // 15 dagar sedan
    expect(trimRecentFailures([fifteen], now)).toEqual([])
  })

  test('blandat: bara de färska överlever, ordningen bevaras', () => {
    const fresh1 = new Date('2026-08-10T10:00:00.000Z').toISOString()
    const old = new Date('2026-07-01T10:00:00.000Z').toISOString()
    const fresh2 = new Date('2026-08-01T10:00:00.000Z').toISOString() // exakt 11 dagar — inom fönstret
    expect(trimRecentFailures([fresh1, old, fresh2], now)).toEqual([fresh1, fresh2])
  })

  test('undefined/tom lista → tom lista', () => {
    expect(trimRecentFailures(undefined, now)).toEqual([])
    expect(trimRecentFailures([], now)).toEqual([])
  })

  test('trasig tidsstämpel filtreras bort (aldrig NaN-jämförelse som råkar bli sann)', () => {
    expect(trimRecentFailures(['inte-ett-datum'], now)).toEqual([])
  })
})
