/**
 * Facit för Pengar på bordet (2026-08-08).
 *
 * Sidan är säljdemons tyngsta yta — och därmed platsen där en ihopblandad
 * eller påhittad summa gör mest skada. Reglerna som låses:
 *
 * 1. Poster utan känt belopp räknas i ANTAL, aldrig i summan.
 * 2. Tomma kategorier utelämnas — aldrig "0 kr" på en rad.
 * 3. Fakturabeloppet följer check-overdues konvention (ROT → customer_pays).
 * 4. Totalsumman är exakt summan av kategorierna, ingenting mer.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/pengar-pa-bordet.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { buildPengarSummary, invoiceAmount } from '../lib/value/pengar-pa-bordet'
import type { MissedRevenueFinding } from '../lib/value/missed-revenue'

function fynd(
  kind: MissedRevenueFinding['kind'],
  amountKr: number,
  confidence: MissedRevenueFinding['confidence'] = amountKr > 0 ? 'LIKELY_UNBILLED' : 'NEEDS_REVIEW',
): MissedRevenueFinding {
  return {
    kind,
    projectId: 'p1',
    projectName: 'Projekt',
    amountKr,
    sourceAmountKr: amountKr,
    confidence,
    action: 'REVIEW_ONLY',
    sourceIds: ['source'],
    evidence: 'e',
    dedupeKey: `${kind}:x`,
  }
}

const TOMT = { staleQuotes: [], missedRevenue: [], overdueInvoices: [], marginOverruns: [], ataEstimates: [] }

test.describe('summan hittas aldrig på', () => {
  test('tomt bord ger noll kategorier — inte fem nollrader', () => {
    const s = buildPengarSummary(TOMT)
    expect(s.totalKr).toBe(0)
    expect(s.kategorier).toEqual([])
  })

  test('projekt utan faktura räknas i antal, aldrig i kronor', () => {
    const s = buildPengarSummary({
      ...TOMT,
      missedRevenue: [fynd('ata_ej_fakturerad', 8900), fynd('projekt_utan_faktura', 0)],
    })
    const kat = s.kategorier.find(k => k.key === 'ofakturerat')!
    expect(kat.summaKr).toBe(8900)
    expect(kat.antal).toBe(1)
    expect(kat.antalUtanBelopp).toBe(1)
    expect(s.totalKr).toBe(8900)
  })

  test('NEEDS_REVIEW kan bära ett källbelopp men bidrar aldrig till potentialen', () => {
    const review = { ...fynd('material_ej_fakturerat', 0, 'NEEDS_REVIEW'), sourceAmountKr: 45_000 }
    const s = buildPengarSummary({ ...TOMT, missedRevenue: [review] })
    const kat = s.kategorier.find(k => k.key === 'ofakturerat')!
    expect(kat.summaKr).toBe(0)
    expect(kat.antalUtanBelopp).toBe(1)
    expect(s.totalKr).toBe(0)
    expect(kat.titel).toBe('Fakturaunderlag att granska')
  })

  test('ROT-faktura bidrar med det kunden betalar, inte totalen', () => {
    expect(invoiceAmount({ total: 40_000, customer_pays: 28_000, rot_rut_type: 'rot' })).toBe(28_000)
    expect(invoiceAmount({ total: 40_000, customer_pays: 28_000, rot_rut_type: null })).toBe(40_000)
    expect(invoiceAmount({ total: null, customer_pays: null, rot_rut_type: null })).toBe(0)
  })

  test('negativa och trasiga belopp räknas som noll', () => {
    const s = buildPengarSummary({
      ...TOMT,
      marginOverruns: [9250, -500, NaN as unknown as number],
      ataEstimates: [0, 4500],
    })
    expect(s.kategorier.find(k => k.key === 'marginalrisk')!.summaKr).toBe(9250)
    expect(s.kategorier.find(k => k.key === 'ata')!.summaKr).toBe(4500)
  })

  test('totalen är exakt kategorisumman', () => {
    const s = buildPengarSummary({
      staleQuotes: [{ total: 214_000, sent_at: '2026-08-01' }],
      missedRevenue: [fynd('material_ej_fakturerat', 34_900)],
      overdueInvoices: [{ total: 24_300, customer_pays: null, rot_rut_type: null }],
      marginOverruns: [9_250],
      ataEstimates: [],
    })
    expect(s.totalKr).toBe(214_000 + 34_900 + 24_300 + 9_250)
    expect(s.kategorier).toHaveLength(4)
  })

  test('varje kategori har en väg vidare', () => {
    const s = buildPengarSummary({
      staleQuotes: [{ total: 1000, sent_at: '2026-08-01' }],
      missedRevenue: [fynd('ata_ej_fakturerad', 1000)],
      overdueInvoices: [{ total: 1000, customer_pays: null, rot_rut_type: null }],
      marginOverruns: [1000],
      ataEstimates: [1000],
    })
    for (const k of s.kategorier) {
      expect(k.href.startsWith('/dashboard/'), `${k.key} saknar länk`).toBe(true)
    }
  })
})

test.describe('trikotomin — Hämta nu / Möjligheter / Risk (A2, 2026-08-10)', () => {
  const { grupperaPengar, GRUPP_AV_KATEGORI } = require('../lib/value/pengar-pa-bordet')

  const summering = buildPengarSummary({
    staleQuotes: [{ total: 45000, sent_at: '2026-08-01' }],
    missedRevenue: [fynd('ata_ej_fakturerad', 8900)],
    overdueInvoices: [{ total: 7626, customer_pays: null, rot_rut_type: null }],
    marginOverruns: [11400],
    ataEstimates: [4250],
  })

  test('varje kategorinyckel har en handlingsnivå — uttömmande mappning', () => {
    // En ny kategori utan grupp hade tyst försvunnit från sidan.
    for (const key of ['offerter', 'ofakturerat', 'forfallet', 'marginalrisk', 'ata']) {
      expect(GRUPP_AV_KATEGORI[key], `${key} saknar grupp`).toBeTruthy()
    }
  })

  test('ordningen är alltid hämta → möjligheter → risk', () => {
    const grupper = grupperaPengar(summering)
    expect(grupper.map((g: any) => g.key)).toEqual(['hamta_nu', 'mojligheter', 'risk'])
  })

  test('ingen krona flyttas — gruppsummorna är exakt totalsumman', () => {
    const grupper = grupperaPengar(summering)
    const gruppTotal = grupper.reduce((s: number, g: any) => s + g.summaKr, 0)
    expect(gruppTotal).toBe(summering.totalKr)
    // Och varje gruppsumma är exakt sina kategoriers summa.
    for (const g of grupper) {
      expect(g.summaKr).toBe(g.kategorier.reduce((s: number, k: any) => s + k.summaKr, 0))
    }
  })

  test('tomma grupper utelämnas — aldrig en tom rubrik', () => {
    const baraOfferter = buildPengarSummary({
      ...TOMT,
      staleQuotes: [{ total: 45000, sent_at: '2026-08-01' }],
    })
    const grupper = grupperaPengar(baraOfferter)
    expect(grupper.map((g: any) => g.key)).toEqual(['mojligheter'])
  })

  test('intjänat hamnar i hämta nu, prognoser i risk', () => {
    const grupper = grupperaPengar(summering)
    const hamta = grupper.find((g: any) => g.key === 'hamta_nu')
    const risk = grupper.find((g: any) => g.key === 'risk')
    expect(hamta.kategorier.map((k: any) => k.key).sort()).toEqual(['forfallet', 'ofakturerat'])
    expect(risk.kategorier.map((k: any) => k.key)).toEqual(['marginalrisk'])
  })
})
