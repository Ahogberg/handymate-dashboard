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
import {
  buildPengarSummary,
  invoiceAmount,
  pengarBandPresentation,
  pengarKategoriAntal,
} from '../lib/value/pengar-pa-bordet'
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

/**
 * Beloppslistorna blev rader när posterna infördes (2026-09-18) — summan
 * räknas nu UR raderna. De här två gör om de gamla beloppslistorna till
 * rader så proven nedan mäter samma sak som förut.
 */
const mr = (belopp: number[]) => belopp.map((overrunKr, i) => ({ id: `mr-${i}`, overrunKr }))
const af = (belopp: number[]) => belopp.map((estimateKr, i) => ({ id: `af-${i}`, estimateKr }))

const TOMT = { staleQuotes: [], missedRevenue: [], overdueInvoices: [], marginRisker: mr([]), ataForslag: af([]) }

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

  test('hemskärmen döljer inte ofakturerat arbete bara för att beloppet är okänt', () => {
    const summary = buildPengarSummary({
      ...TOMT,
      missedRevenue: [fynd('projekt_utan_faktura', 0, 'NEEDS_REVIEW')],
    })
    const presentation = pengarBandPresentation(summary)
    expect(presentation.tomt).toBe(false)
    expect(presentation.harKantBelopp).toBe(false)
    expect(presentation.grupper.map(g => g.key)).toEqual(['hamta_nu'])
    expect(pengarKategoriAntal(presentation.grupper[0].kategorier[0])).toBe(1)
  })

  test('hemskärmen visar fortsatt ett ärligt tomläge när inga kategorier finns', () => {
    expect(pengarBandPresentation(buildPengarSummary(TOMT))).toMatchObject({
      grupper: [],
      tomt: true,
      harKantBelopp: false,
    })
  })

  test('ROT-faktura bidrar med det kunden betalar, inte totalen', () => {
    expect(invoiceAmount({ total: 40_000, customer_pays: 28_000, rot_rut_type: 'rot' })).toBe(28_000)
    expect(invoiceAmount({ total: 40_000, customer_pays: 28_000, rot_rut_type: null })).toBe(40_000)
    expect(invoiceAmount({ total: null, customer_pays: null, rot_rut_type: null })).toBe(0)
  })

  test('negativa och trasiga belopp räknas som noll', () => {
    const s = buildPengarSummary({
      ...TOMT,
      marginRisker: mr([9250, -500, NaN as unknown as number]),
      ataForslag: af([0, 4500]),
    })
    expect(s.kategorier.find(k => k.key === 'marginalrisk')!.summaKr).toBe(9250)
    expect(s.kategorier.find(k => k.key === 'ata')!.summaKr).toBe(4500)
  })

  test('totalen är exakt kategorisumman', () => {
    const s = buildPengarSummary({
      staleQuotes: [{ total: 214_000, sent_at: '2026-08-01' }],
      missedRevenue: [fynd('material_ej_fakturerat', 34_900)],
      overdueInvoices: [{ total: 24_300, customer_pays: null, rot_rut_type: null }],
      marginRisker: mr([9_250]),
      ataForslag: af([]),
    })
    expect(s.totalKr).toBe(214_000 + 34_900 + 24_300 + 9_250)
    expect(s.kategorier).toHaveLength(4)
  })

  test('VARIFRÅN KOMMER SIFFRAN: summan är exakt raderna, aldrig satt för hand', () => {
    const s = buildPengarSummary({
      staleQuotes: [
        { quote_id: 'q1', quote_number: '104', total: 50_000, sent_at: '2026-09-01T00:00:00Z' },
        { quote_id: 'q2', quote_number: '105', total: null, sent_at: '2026-09-02T00:00:00Z' },
      ],
      missedRevenue: [],
      overdueInvoices: [],
      marginRisker: mr([]),
      ataForslag: af([]),
    })
    const k = s.kategorier[0]
    // Talet OCH raderna, och de kan inte glida ifrån varandra: summan
    // räknas ur posterna, så det här är samma sak sagd två gånger — vilket
    // är hela poängen.
    expect(k.summaKr).toBe(50_000)
    expect(k.poster.reduce((a, p) => a + (p.belopp || 0), 0)).toBe(k.summaKr)
    // Posten utan belopp finns kvar och redovisas som sådan.
    expect(k.poster).toHaveLength(2)
    expect(k.poster[1].belopp).toBeNull()
    expect(k.antal).toBe(1)
    expect(k.antalUtanBelopp).toBe(1)
  })

  test('varje post pekar på SIN egen rad, inte på en lista', () => {
    const s = buildPengarSummary({
      staleQuotes: [{ quote_id: 'q1', quote_number: '104', total: 1000, sent_at: '2026-09-01T00:00:00Z' }],
      missedRevenue: [fynd('ata_ej_fakturerad', 1000)],
      overdueInvoices: [{ invoice_id: 'i1', invoice_number: '55', total: 1000, customer_pays: null, rot_rut_type: null }],
      marginRisker: mr([1000]),
      ataForslag: af([1000]),
    })
    for (const k of s.kategorier) {
      expect(k.poster.length, `${k.key} har inga rader bakom siffran`).toBeGreaterThan(0)
      for (const post of k.poster) {
        expect(post.id, `${k.key}: post utan identitet`).toBeTruthy()
        expect(post.etikett, `${k.key}: post utan etikett`).toBeTruthy()
        // En post vars länk är kategorilänken är ingen spårning — den leder
        // tillbaka till samma lista som inte matchar talet.
        expect(post.href, `${k.key}: posten pekar på kategorilistan`).not.toBe(k.href)
        expect(post.href.startsWith('/dashboard/'), `${k.key}: ogiltig länk`).toBe(true)
      }
    }
  })

  test('en post utan belopp drar aldrig ner summan till noll för de andra', () => {
    const s = buildPengarSummary({
      ...TOMT,
      overdueInvoices: [
        { invoice_id: 'i1', invoice_number: '1', total: 10_000, customer_pays: null, rot_rut_type: null },
        { invoice_id: 'i2', invoice_number: '2', total: null, customer_pays: null, rot_rut_type: null },
        { invoice_id: 'i3', invoice_number: '3', total: -5_000, customer_pays: null, rot_rut_type: null },
      ],
    })
    const k = s.kategorier[0]
    expect(k.summaKr).toBe(10_000)
    expect(k.poster).toHaveLength(3)
    expect(k.antalUtanBelopp).toBe(2)
  })

  test('ingen post bär någonsin ett icke-positivt belopp — det blir null', () => {
    // Varför testet finns: summeraPoster har en `> 0`-vakt, och en mutation
    // som tar bort den ändrar ingenting. Skälet är att VARJE byggare mappar
    // ett saknat, noll eller negativt belopp till null redan när posten
    // skapas. Det är den egenskapen som gör vakten oåtkomlig, så den är värd
    // att hålla fast: går den sönder blir vakten plötsligt det enda som står
    // mellan ett negativt källbelopp och en felaktig summa.
    const s = buildPengarSummary({
      staleQuotes: [
        { quote_id: 'q1', total: -5_000, sent_at: '2026-09-01T00:00:00Z' },
        { quote_id: 'q2', total: 0, sent_at: '2026-09-01T00:00:00Z' },
        { quote_id: 'q3', total: null, sent_at: '2026-09-01T00:00:00Z' },
      ],
      missedRevenue: [fynd('material_ej_fakturerat', 0)],
      overdueInvoices: [{ invoice_id: 'i1', total: -100, customer_pays: null, rot_rut_type: null }],
      marginRisker: mr([-1, 0]),
      ataForslag: af([-1, 0]),
    })
    for (const k of s.kategorier) {
      for (const post of k.poster) {
        if (post.belopp !== null) {
          expect(post.belopp, `${k.key}: post med icke-positivt belopp`).toBeGreaterThan(0)
        }
      }
      expect(k.summaKr, `${k.key}: summan ska vara noll`).toBe(0)
    }
    // Marginal och ÄTA har inga poster kvar alls — ett larm utan överdrag är
    // ingen risk, och det filtret är äldre än posterna.
    expect(s.kategorier.map(k => k.key)).not.toContain('marginalrisk')
    expect(s.kategorier.map(k => k.key)).not.toContain('ata')
  })

  test('raderna bär identitet ur källan — aldrig ett index när id finns', () => {
    const s = buildPengarSummary({
      ...TOMT,
      staleQuotes: [{ quote_id: 'q-abc', quote_number: '104', total: 1000, sent_at: '2026-09-01T00:00:00Z' }],
    })
    expect(s.kategorier[0].poster[0].id).toBe('q-abc')
    expect(s.kategorier[0].poster[0].href).toBe('/dashboard/quotes/q-abc')
  })

  test('varje kategori har en väg vidare', () => {
    const s = buildPengarSummary({
      staleQuotes: [{ total: 1000, sent_at: '2026-08-01' }],
      missedRevenue: [fynd('ata_ej_fakturerad', 1000)],
      overdueInvoices: [{ total: 1000, customer_pays: null, rot_rut_type: null }],
      marginRisker: mr([1000]),
      ataForslag: af([1000]),
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
    marginRisker: mr([11400]),
    ataForslag: af([4250]),
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

// ─────────────────────────────────────────────────────────────────────────
// Ytorna: siffran och raderna måste sitta ihop hela vägen ut.
// ─────────────────────────────────────────────────────────────────────────
test.describe('ytan visar raderna bakom siffran', () => {
  const fs = require('fs') as typeof import('fs')
  const path = require('path') as typeof import('path')
  const ROOT = path.resolve(__dirname, '..')
  const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

  test('Pengar-sidan renderar posterna per kategori', () => {
    const src = read('app/dashboard/pengar/page.tsx')
    expect(src).toContain('<PengarPoster poster={k.poster} />')
    // Kortet får inte vara ett <Link> igen: en <details> i en länk är
    // ogiltig och går inte att öppna på en telefon.
    const kort = src.slice(src.indexOf('{grupp.kategorier.map(k => ('), src.indexOf('<PengarPoster'))
    expect(kort).not.toMatch(/<Link\s+key=\{k\.key\}/)
  })

  test('varje kategori har ett ankare så bandets länk landar rätt', () => {
    const src = read('app/dashboard/pengar/page.tsx')
    expect(src).toContain('id={k.key}')
    expect(src).toContain('scroll-mt-20')
  })

  test('hemskärmens band leder till siffran, inte till en annan lista', () => {
    const src = read('components/jarvis/PengarBand.tsx')
    expect(src).toContain('href={`/dashboard/pengar#${k.key}`}')
    // Kategorins egen href pekar på en lista med ett ANNAT urval — den får
    // inte vara bandets destination.
    expect(src).not.toContain('href={k.href}')
  })

  test('postkomponenten räknar aldrig om något själv', () => {
    const src = read('components/value/PengarPoster.tsx')
    // Ingen summering: talet är redan räknat ur posterna i den rena modulen.
    expect(src).not.toMatch(/reduce\(/)
    expect(src).toContain('belopp saknas')
    // Tummen på en telefon.
    expect(src).toContain('min-h-[44px]')
  })
})
