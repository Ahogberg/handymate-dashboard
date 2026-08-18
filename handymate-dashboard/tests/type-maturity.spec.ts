/**
 * Facit för lib/mandates/type-maturity.ts (Mission Mandates V1, Etapp Y —
 * kvantifierad grind, tasks/jaunty-pondering-hummingbird.md).
 *
 * Ren funktion, ingen I/O, ingen crypto: bedömer om en åtgärdstyp är MOGEN
 * (får öppnas för fler mandat) utifrån NAMNGIVNA konstanter, aldrig
 * magkänsla. mogen = ALLA kriterier uppfyllda, aldrig delbetyg. Låst här:
 *   - varje kriterium för sig, exakt gränsvärde (25/0%/2%/0/30 dagar)
 *   - "0 utförda" degraderar leveransfel-kriteriet ärligt ("0% av 0"),
 *     räknas ALDRIG som uppfyllt även om täljaren är 0
 *   - mogen flippar av VARJE enskilt kriterium, aldrig partiell kredit
 *   - varde-strängarnas exakta format
 *   - källkodsskanning: ren fil, ingen I/O, ingen crypto, ingen kausalitet
 *
 * Körs: npx playwright test tests/type-maturity.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import fs from 'fs'
import path from 'path'
import {
  bedomTypMognad,
  MATURITY_MIN_EXECUTED,
  MATURITY_MAX_STOPP,
  MATURITY_MAX_DELIVERY_FAILURE_PCT,
  MATURITY_MAX_SAFETY_REVOCATIONS,
  MATURITY_MIN_HISTORY_DAYS,
} from '../lib/mandates/type-maturity'

const ROOT = path.resolve(__dirname, '..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const NOW = '2026-08-18T12:00:00.000Z'

/** Allt precis vid gränsen och godkänt — basfallet varje enskilt-kriterium-
    test avviker FRÅN. */
function fullyMature(over: Partial<Parameters<typeof bedomTypMognad>[0]> = {}) {
  return bedomTypMognad({
    action_type: 'invoice_reminder',
    utforda: MATURITY_MIN_EXECUTED,
    leveransfel: 0,
    stopp_inom_7d: MATURITY_MAX_STOPP,
    sakerhets_aterkallelser: MATURITY_MAX_SAFETY_REVOCATIONS,
    forsta_utford_iso: '2026-07-19T12:00:00.000Z', // exakt 30 dagar före NOW
    nowIso: NOW,
    ...over,
  })
}

function kriterium(result: ReturnType<typeof bedomTypMognad>, krav: RegExp) {
  return result.kriterier.find(k => krav.test(k.krav))
}

test.describe('bedomTypMognad — namngivna konstanter', () => {
  test('trösklarna är de dokumenterade startförslagen', () => {
    expect(MATURITY_MIN_EXECUTED).toBe(25)
    expect(MATURITY_MAX_STOPP).toBe(0)
    expect(MATURITY_MAX_DELIVERY_FAILURE_PCT).toBe(2)
    expect(MATURITY_MAX_SAFETY_REVOCATIONS).toBe(0)
    expect(MATURITY_MIN_HISTORY_DAYS).toBe(30)
  })
})

test.describe('bedomTypMognad — helt mogen (alla gränser exakt uppfyllda)', () => {
  test('mogen är true, alla fem kriterier uppfyllda', () => {
    const result = fullyMature()
    expect(result.action_type).toBe('invoice_reminder')
    expect(result.mogen).toBe(true)
    expect(result.kriterier).toHaveLength(5)
    for (const k of result.kriterier) expect(k.uppfyllt).toBe(true)
  })

  test('action_type kopieras rätt för en annan typ', () => {
    expect(fullyMature({ action_type: 'review_request' }).action_type).toBe('review_request')
  })
})

test.describe('bedomTypMognad — utförda-kriteriet, exakt gräns', () => {
  test('25 exakt → uppfyllt', () => {
    const k = kriterium(fullyMature({ utforda: 25 }), /utförd/i)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('25/25')
  })
  test('24 → INTE uppfyllt', () => {
    const result = fullyMature({ utforda: 24, leveransfel: 0 })
    const k = kriterium(result, /utförd/i)!
    expect(k.uppfyllt).toBe(false)
    expect(k.varde).toBe('24/25')
    expect(result.mogen).toBe(false)
  })
  test('26 → uppfyllt (över kravet räcker)', () => {
    expect(kriterium(fullyMature({ utforda: 26 }), /utförd/i)!.uppfyllt).toBe(true)
  })
})

test.describe('bedomTypMognad — STOPP-kriteriet, exakt gräns', () => {
  test('0 STOPP → uppfyllt', () => {
    const k = kriterium(fullyMature({ stopp_inom_7d: 0 }), /STOPP/)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('0 STOPP')
  })
  test('1 STOPP → INTE uppfyllt', () => {
    const result = fullyMature({ stopp_inom_7d: 1 })
    const k = kriterium(result, /STOPP/)!
    expect(k.uppfyllt).toBe(false)
    expect(k.varde).toBe('1 STOPP')
    expect(result.mogen).toBe(false)
  })
})

test.describe('bedomTypMognad — leveransfel-kriteriet (%)', () => {
  test('0 leveransfel av 25 → 0%, uppfyllt', () => {
    const k = kriterium(fullyMature({ utforda: 25, leveransfel: 0 }), /leveransfel/i)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('0% av 25')
  })

  test('exakt 2.0% (1 av 50) → uppfyllt (gränsen är <=)', () => {
    const result = fullyMature({ utforda: 50, leveransfel: 1 })
    const k = kriterium(result, /leveransfel/i)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('2% av 50')
  })

  test('över 2% (2 av 50 = 4%) → INTE uppfyllt', () => {
    const result = fullyMature({ utforda: 50, leveransfel: 2 })
    const k = kriterium(result, /leveransfel/i)!
    expect(k.uppfyllt).toBe(false)
    expect(k.varde).toBe('4% av 50')
    expect(result.mogen).toBe(false)
  })

  test('0 utförda → 0% av 0, ALDRIG uppfyllt (ingen tyst nolla räknas som ren)', () => {
    const result = fullyMature({ utforda: 0, leveransfel: 0, forsta_utford_iso: null })
    const k = kriterium(result, /leveransfel/i)!
    expect(k.varde).toBe('0% av 0')
    expect(k.uppfyllt).toBe(false)
    expect(result.mogen).toBe(false)
  })

  test('avrundning till en decimal, trailing nolla trimmad (1 av 30 ≈ 3.3%)', () => {
    const result = fullyMature({ utforda: 30, leveransfel: 1 })
    const k = kriterium(result, /leveransfel/i)!
    expect(k.varde).toBe('3.3% av 30')
    expect(k.uppfyllt).toBe(false)
  })
})

test.describe('bedomTypMognad — säkerhetsåterkallelser-kriteriet, exakt gräns', () => {
  test('0 återkallelser → uppfyllt', () => {
    const k = kriterium(fullyMature({ sakerhets_aterkallelser: 0 }), /återkallelse/i)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('0 återkallelser')
  })
  test('1 återkallelse → INTE uppfyllt', () => {
    const result = fullyMature({ sakerhets_aterkallelser: 1 })
    const k = kriterium(result, /återkallelse/i)!
    expect(k.uppfyllt).toBe(false)
    expect(k.varde).toBe('1 återkallelser')
    expect(result.mogen).toBe(false)
  })
})

test.describe('bedomTypMognad — historik-kriteriet, exakt gräns', () => {
  test('exakt 30 dagar → uppfyllt', () => {
    const result = fullyMature({ forsta_utford_iso: '2026-07-19T12:00:00.000Z', nowIso: NOW })
    const k = kriterium(result, /historik/i)!
    expect(k.uppfyllt).toBe(true)
    expect(k.varde).toBe('30/30 dagar')
  })

  test('29 dagar → INTE uppfyllt', () => {
    const result = fullyMature({ forsta_utford_iso: '2026-07-20T12:00:00.000Z', nowIso: NOW })
    const k = kriterium(result, /historik/i)!
    expect(k.uppfyllt).toBe(false)
    expect(k.varde).toBe('29/30 dagar')
    expect(result.mogen).toBe(false)
  })

  test('forsta_utford_iso null → 0 dagar, INTE uppfyllt', () => {
    const result = fullyMature({ forsta_utford_iso: null })
    const k = kriterium(result, /historik/i)!
    expect(k.varde).toBe('0/30 dagar')
    expect(k.uppfyllt).toBe(false)
  })

  test('ogiltigt datum → 0 dagar (fail-closed, kastar aldrig)', () => {
    const result = fullyMature({ forsta_utford_iso: 'not-a-date' })
    const k = kriterium(result, /historik/i)!
    expect(k.varde).toBe('0/30 dagar')
    expect(k.uppfyllt).toBe(false)
  })
})

test.describe('bedomTypMognad — mogen flippar av VARJE enskilt kriterium, ingen delbetyg', () => {
  test('bara utförda under gränsen → omogen, övriga fyra ändå uppfyllda', () => {
    const result = fullyMature({ utforda: 10 })
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(4)
  })
  test('bara STOPP över gränsen → omogen, övriga fyra ändå uppfyllda', () => {
    const result = fullyMature({ stopp_inom_7d: 2 })
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(4)
  })
  test('bara leveransfel över gränsen → omogen, övriga fyra ändå uppfyllda', () => {
    const result = fullyMature({ utforda: 100, leveransfel: 5 }) // 5%
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(4)
  })
  test('bara säkerhetsåterkallelser över gränsen → omogen, övriga fyra ändå uppfyllda', () => {
    const result = fullyMature({ sakerhets_aterkallelser: 3 })
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(4)
  })
  test('bara historik under gränsen → omogen, övriga fyra ändå uppfyllda', () => {
    const result = fullyMature({ forsta_utford_iso: '2026-08-10T12:00:00.000Z' }) // 8 dagar
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(4)
  })
  test('alla fem brustna samtidigt → omogen, noll uppfyllda', () => {
    const result = fullyMature({
      utforda: 0, leveransfel: 0, stopp_inom_7d: 5, sakerhets_aterkallelser: 2, forsta_utford_iso: null,
    })
    expect(result.mogen).toBe(false)
    expect(result.kriterier.filter(k => k.uppfyllt)).toHaveLength(0)
  })
})

test.describe('bedomTypMognad — kriterieordning', () => {
  test('exakt de fem kriterierna, i planens ordning (utförda, STOPP, leveransfel, återkallelser, historik)', () => {
    const result = fullyMature()
    expect(result.kriterier.map(k => k.krav.toLowerCase())).toEqual([
      expect.stringMatching(/utförd/i),
      expect.stringMatching(/stopp/i),
      expect.stringMatching(/leveransfel/i),
      expect.stringMatching(/återkallelse/i),
      expect.stringMatching(/historik/i),
    ])
  })
})

// ─────────────────────────────────────────────────────────────────
// Källkodsskanning — ren fil, ingen I/O, ingen crypto, ingen kausalitet
// ─────────────────────────────────────────────────────────────────

test.describe('lib/mandates/type-maturity.ts — källskanning', () => {
  const kalla = read('lib/mandates/type-maturity.ts')

  test('ingen node:crypto-import (importerbar var som helst, inkl. klient/edge)', () => {
    expect(kalla).not.toContain('node:crypto')
    expect(kalla).not.toContain("from 'crypto'")
  })

  test('ingen Supabase-import eller I/O', () => {
    expect(kalla).not.toContain('SupabaseClient')
    expect(kalla).not.toContain('supabase.from(')
    expect(kalla).not.toMatch(/\.from\('[a-z_]+'\)/)
  })

  test('inget kausalitetspåstående i filen', () => {
    const lower = kalla.toLowerCase()
    const forbjudnaOrd = ['orsakade', 'gav bättre', 'berodde på', 'ledde till', 'fick kunden']
    for (const ord of forbjudnaOrd) expect(lower).not.toContain(ord)
  })

  test('refererar aldrig den förbjudna exekveringsspegeln', () => {
    expect(kalla).not.toContain('executeApprovalPayloadInternal')
  })
})
