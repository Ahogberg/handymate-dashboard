/**
 * Facit för provisionsmotorn (partnerprogram, standard sedan 2026-09-01:
 * flat 20 % i 36 kalendermånader, 0 % därefter — se
 * content/partner/partneravtal-v1.md Bilaga 1). Motorn själv förblir
 * generisk (trappa, tier_mode, ladder_months, base_rate_after är alla
 * fortsatt konfigurerbara per partner för en individuell avvikelse enligt
 * avtalets punkt 16.3) — bara STANDARDVÄRDET är flat nu.
 *
 * Motorn producerar utbetalningsunderlag för självfakturering — en motor
 * som räknar fel en enda gång kostar förtroende och pengar. Därför testas
 * default-satsen, 36-månadersgränsen, konfigurerbarheten (trappa/marginal-
 * läge/eget ladder_months/egen basnivå) och momshärledningen hårt.
 *
 *   npx playwright test tests/partner-commission.spec.ts --no-deps --project=chromium
 */
import { test, expect } from '@playwright/test'
import {
  computeLedgerRows,
  deriveExMomsSek,
  evaluateBookRate,
  allocateMarginalBands,
  previousMonth,
  periodBounds,
  type CustomerPayment,
  type PartnerCommissionConfig,
} from '../lib/partners/commission-engine'

/** Explicit flertrappa — används för att bevisa att motorn fortfarande
 *  klarar en avvikande per-partner-konfiguration, inte för att den är
 *  standard längre. */
const TRAPPA = [
  { min: 0, rate: 0.2 },
  { min: 6, rate: 0.25 },
  { min: 16, rate: 0.3 },
]

const config = (over: Partial<PartnerCommissionConfig> = {}): PartnerCommissionConfig => ({
  tiers: [{ min: 0, rate: 0.2 }],
  legacyRate: 0.2,
  baseRateAfter: 0,
  tierMode: 'book',
  ladderMonths: 36,
  ...over,
})

const kund = (n: number, over: Partial<CustomerPayment> = {}): CustomerPayment => ({
  businessId: `biz_${String(n).padStart(3, '0')}`,
  referralId: `ref_${n}`,
  customerMonth: 1,
  paidExMomsSek: 2495,
  convertedAt: `2026-0${Math.min(n, 9)}-01T00:00:00Z`,
  billingEventIds: [`ev_${n}`],
  ...over,
})

const kunder = (antal: number): CustomerPayment[] =>
  Array.from({ length: antal }, (_, i) => kund(i + 1, { convertedAt: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00Z` }))

test.describe('Trappgränser (book-läge, avvikande per-partner-konfiguration)', () => {
  test('5 aktiva → 20 %', () => {
    expect(evaluateBookRate(TRAPPA, 5)).toEqual({ rate: 0.2, band: 0 })
  })
  test('6 aktiva → 25 % (exakt tröskel)', () => {
    expect(evaluateBookRate(TRAPPA, 6)).toEqual({ rate: 0.25, band: 1 })
  })
  test('16 aktiva → 30 %', () => {
    expect(evaluateBookRate(TRAPPA, 16)).toEqual({ rate: 0.3, band: 2 })
  })
  test('osorterad trappa hanteras', () => {
    const stokig = [TRAPPA[2], TRAPPA[0], TRAPPA[1]]
    expect(evaluateBookRate(stokig, 7)).toEqual({ rate: 0.25, band: 1 })
  })
  test('tom/null trappa → null (legacy-satsen tar över)', () => {
    expect(evaluateBookRate(null, 5)).toBeNull()
    expect(evaluateBookRate([], 5)).toBeNull()
  })
})

test.describe('Standard flat-rate (book-läge): hela stocken', () => {
  test('7 kunder → alla får 20 %', () => {
    const rows = computeLedgerRows(config(), kunder(7))
    expect(rows).toHaveLength(7)
    for (const r of rows) {
      expect(r.rate).toBe(0.2)
      expect(r.rateSource).toBe('tier')
      expect(r.tierSnapshot.active_count).toBe(7)
    }
  })
  test('svans-kund (mån 37) räknas i volymen men får basnivån (0 %)', () => {
    const alla = [...kunder(5), kund(6, { customerMonth: 37, convertedAt: '2023-01-01T00:00:00Z' })]
    const rows = computeLedgerRows(config(), alla)
    const trappRader = rows.filter(r => r.rateSource === 'tier')
    const svansRader = rows.filter(r => r.rateSource === 'base_rate')
    expect(trappRader).toHaveLength(5)
    expect(svansRader).toHaveLength(1)
    for (const r of trappRader) expect(r.rate).toBe(0.2)
    expect(svansRader[0].rate).toBe(0)
    expect(svansRader[0].tierSnapshot.active_count).toBe(6)
  })
})

test.describe('36-månadersgränsen', () => {
  test('månad 36 → 20 %; månad 37 → 0 %', () => {
    const rows = computeLedgerRows(config(), [
      kund(1, { customerMonth: 36 }),
      kund(2, { customerMonth: 37 }),
    ])
    const m36 = rows.find(r => r.customerMonth === 36)!
    const m37 = rows.find(r => r.customerMonth === 37)!
    expect(m36.rateSource).toBe('tier')
    expect(m36.rate).toBe(0.2)
    expect(m37.rateSource).toBe('base_rate')
    expect(m37.rate).toBe(0)
  })
  test('konfigurerbar ladder_months respekteras (per-partner-avvikelse)', () => {
    const rows = computeLedgerRows(config({ ladderMonths: 24 }), [kund(1, { customerMonth: 25 })])
    expect(rows[0].rateSource).toBe('base_rate')
  })
  test('basnivån är konfigurerbar per partner', () => {
    const rows = computeLedgerRows(config({ baseRateAfter: 0.15, ladderMonths: 6 }), [kund(1, { customerMonth: 20 })])
    expect(rows[0].rate).toBe(0.15)
  })
})

test.describe('Marginal-läge (avvikande per-partner-konfiguration)', () => {
  test('8 kunder → position 1–5 får 20 %, 6–8 får 25 %', () => {
    const rows = computeLedgerRows(config({ tierMode: 'marginal', tiers: TRAPPA }), kunder(8))
    const perKund = new Map(rows.map(r => [r.businessId, r.rate]))
    // Sorterade på convertedAt: biz_001 äldst → position 1
    for (let i = 1; i <= 5; i++) expect(perKund.get(`biz_${String(i).padStart(3, '0')}`)).toBe(0.2)
    for (let i = 6; i <= 8; i++) expect(perKund.get(`biz_${String(i).padStart(3, '0')}`)).toBe(0.25)
  })
  test('deterministisk ordning — samma converted_at bryts på businessId', () => {
    const a = kund(1, { convertedAt: '2026-01-01T00:00:00Z' })
    const b = kund(2, { convertedAt: '2026-01-01T00:00:00Z' })
    const band1 = allocateMarginalBands([a, b], TRAPPA)
    const band2 = allocateMarginalBands([b, a], TRAPPA)
    expect(band1.get('biz_001')).toEqual(band2.get('biz_001'))
    expect(band1.get('biz_002')).toEqual(band2.get('biz_002'))
  })
})

test.describe('Momshärledning (deriveExMomsSek)', () => {
  test('total_excluding_tax föredras', () => {
    expect(deriveExMomsSek({ amount_paid: 311875, total_excluding_tax: 249500 })).toBe(2495)
  })
  test('amount_paid minus tax när tax > 0', () => {
    expect(deriveExMomsSek({ amount_paid: 311875, tax: 62375 })).toBe(2495)
  })
  test('amount_paid rakt av utan momsfält (dagens läge)', () => {
    expect(deriveExMomsSek({ amount_paid: 249500 })).toBe(2495)
  })
  test('icke-SEK skippas', () => {
    expect(deriveExMomsSek({ amount_paid: 249500, currency: 'eur' })).toBe(0)
  })
  test('noll/negativt/tomt skippas', () => {
    expect(deriveExMomsSek({ amount_paid: 0 })).toBe(0)
    expect(deriveExMomsSek({ amount_paid: -100 })).toBe(0)
    expect(deriveExMomsSek(null)).toBe(0)
    expect(deriveExMomsSek({})).toBe(0)
  })
})

test.describe('Grundregler', () => {
  test('ingen betalning → ingen rad', () => {
    const rows = computeLedgerRows(config(), [kund(1, { paidExMomsSek: 0 })])
    expect(rows).toHaveLength(0)
  })
  test('avrundning till hela kronor', () => {
    const rows = computeLedgerRows(config(), [kund(1, { paidExMomsSek: 2495 })])
    expect(rows[0].amountSek).toBe(Math.round(2495 * 0.2))
    expect(Number.isInteger(rows[0].amountSek)).toBe(true)
  })
  test('legacy-satsen används när trappa saknas', () => {
    const rows = computeLedgerRows(config({ tiers: null, legacyRate: 0.22 }), kunder(3))
    for (const r of rows) {
      expect(r.rate).toBe(0.22)
      expect(r.rateSource).toBe('legacy_rate')
    }
  })
  test('determinism: samma indata → identiska utkast', () => {
    const a = computeLedgerRows(config(), kunder(10))
    const b = computeLedgerRows(config(), kunder(10))
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
  test('inga negativa belopp', () => {
    const rows = computeLedgerRows(config(), kunder(20))
    for (const r of rows) expect(r.amountSek).toBeGreaterThanOrEqual(0)
  })
})

test.describe('Periodhjälpare', () => {
  test('previousMonth', () => {
    expect(previousMonth(new Date('2026-08-11T10:00:00Z'))).toBe('2026-07')
    expect(previousMonth(new Date('2026-01-05T10:00:00Z'))).toBe('2025-12')
  })
  test('periodBounds ger [start, slut)', () => {
    const { start, end } = periodBounds('2026-07')
    expect(start).toBe('2026-07-01T00:00:00.000Z')
    expect(end).toBe('2026-08-01T00:00:00.000Z')
  })
})
