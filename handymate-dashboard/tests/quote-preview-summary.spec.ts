/**
 * Facit för offertutkastets beloppsruta (2026-08-07).
 *
 * ═══ DET SOM VAKTAS ═══
 *
 * Kortet ber hantverkaren godkänna en offert han inte öppnat. Siffran han
 * läser måste därför vara **exakt** den som sparas — annars är Godkänn en
 * gissning, inte ett löfte.
 *
 * Det är samma felklass som B4 rättade i offertflödet: kortet visade rader
 * från en generering och godkännandet sparade en annan.
 *
 * Körs utan browser/session:
 *   npx playwright test tests/quote-preview-summary.spec.ts --no-deps
 */
import { test, expect } from '@playwright/test'
import { quoteDraftSummary } from '../lib/jarvis/quote-preview-summary'
import { generatedQuoteToQuoteItems } from '../lib/quotes/generated-to-quote-items'
import { calculateQuoteTotals } from '../lib/quote-calculations'

const BADRUM = {
  job_title: 'Badrumsrenovering',
  suggested_deduction_type: 'rot' as const,
  items: [
    { description: 'Rivning & förberedelse', quantity: 2, unit: 'dag', unitPrice: 5800, type: 'labor' as const },
    { description: 'Tätskikt & gjutning', quantity: 1, unit: 'st', unitPrice: 23120, type: 'labor' as const },
    { description: 'Kakel & klinker, arbete', quantity: 12, unit: 'kvm', unitPrice: 4280, type: 'labor' as const },
    { description: 'Material & maskinhyra', quantity: 1, unit: 'st', unitPrice: 26400, type: 'material' as const },
  ],
  options: [],
  total_before_vat: 158800,
}

test.describe('SUMMAN MÅSTE VARA DEN SOM SPARAS', () => {
  test('customerPays är identisk med calculateQuoteTotals på samma rader', () => {
    // Exakt de två steg exekveraren kör vid godkännande
    // (approvals/[id]/route.ts, case 'create_quote_draft').
    const items = generatedQuoteToQuoteItems(BADRUM.items, BADRUM.options, BADRUM.suggested_deduction_type)
    const facit = calculateQuoteTotals(items)

    expect(quoteDraftSummary(BADRUM).customerPays).toBe(Math.round(facit.customerPaysAfterDeductions))
  })

  test('modellens total_before_vat används ALDRIG som kundens belopp', () => {
    // Den är exkl. moms och före avdrag. Att visa den hade gett ett annat
    // belopp än offerten, på just den plats där beloppet är hela beslutet.
    expect(quoteDraftSummary(BADRUM).customerPays).not.toBe(BADRUM.total_before_vat)
  })

  test('delarna summerar till kundens belopp', () => {
    // Annars ser rutan ut som ett räknefel för den som kontrollräknar.
    const s = quoteDraftSummary(BADRUM)
    const summa = s.rows.reduce((n, r) => n + (r.deduction ? -r.amount : r.amount), 0)
    expect(Math.abs(summa - s.customerPays)).toBeLessThanOrEqual(2) // avrundning per rad
  })
})

test.describe('ROT', () => {
  test('ROT-raden finns och är ett avdrag', () => {
    const rot = quoteDraftSummary(BADRUM).rows.find(r => r.label.startsWith('ROT'))
    expect(rot).toBeTruthy()
    expect(rot!.deduction).toBe(true)
    expect(rot!.amount).toBeGreaterThan(0)
  })

  test('utan avdragstyp finns ingen avdragsrad', () => {
    const s = quoteDraftSummary({ ...BADRUM, suggested_deduction_type: 'none' })
    expect(s.rows.some(r => r.deduction)).toBe(false)
  })

  test('avdraget namnges vid rätt namn — RUT är inte ROT', () => {
    const s = quoteDraftSummary({ ...BADRUM, suggested_deduction_type: 'rut' })
    expect(s.rows.some(r => r.label.startsWith('RUT'))).toBe(true)
    expect(s.rows.some(r => r.label.startsWith('ROT'))).toBe(false)
  })
})

test.describe('NÄR VI INTE VISAR NÅGON RUTA ALLS', () => {
  test('utan rader är summan inte klar', () => {
    // Saknas preview.items faller exekveraren tillbaka på omgenerering —
    // kortet vet alltså inte vad som kommer att sparas. Att visa en summa då
    // vore att lova något vi inte kan hålla.
    for (const p of [null, undefined, {}, { items: [] }, { items: null }]) {
      expect(quoteDraftSummary(p as never).ready, `${JSON.stringify(p)}`).toBe(false)
    }
  })

  test('en ofärdig summa är noll, inte ett halvt belopp', () => {
    const s = quoteDraftSummary(null)
    expect(s.customerPays).toBe(0)
    expect(s.rows).toEqual([])
    expect(s.lines).toEqual([])
  })
})

test.describe('radtabellen i det expanderade läget', () => {
  test('varje rad kommer med', () => {
    expect(quoteDraftSummary(BADRUM).lines).toHaveLength(4)
  })

  test('kvalificeraren visar antal bara när den säger något', () => {
    // "1 st" bakom varje rad är brus.
    const lines = quoteDraftSummary(BADRUM).lines
    expect(lines.find(l => l.description.startsWith('Kakel'))!.qualifier).toBe('12 kvm')
    expect(lines.find(l => l.description.startsWith('Tätskikt'))!.qualifier).toBe('')
  })

  test('radbeloppen summerar till subtotalen exkl. moms', () => {
    const s = quoteDraftSummary(BADRUM)
    const summa = s.lines.reduce((n, l) => n + l.amount, 0)
    const facit = calculateQuoteTotals(
      generatedQuoteToQuoteItems(BADRUM.items, BADRUM.options, BADRUM.suggested_deduction_type),
    )
    expect(Math.abs(summa - facit.subtotal)).toBeLessThanOrEqual(4)
  })

  test('tillval räknas med i raderna', () => {
    const s = quoteDraftSummary({
      ...BADRUM,
      options: [{ description: 'Golvvärme', quantity: 1, unit: 'st', unitPrice: 12000, type: 'labor' as const }],
    })
    expect(s.lines.some(l => l.description === 'Golvvärme')).toBe(true)
  })
})
