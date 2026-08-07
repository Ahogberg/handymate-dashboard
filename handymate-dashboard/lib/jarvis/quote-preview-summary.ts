/**
 * Offertutkastets beloppsruta på hemskärmen (2026-08-07).
 *
 * ═══ VARFÖR SAMMA RÄKNARE SOM EDITORN, INTE EN EGEN ═══
 *
 * Kortet ber hantverkaren godkänna en offert han inte öppnat. Då måste
 * siffrorna han läser vara **exakt** de som sparas — annars är Godkänn inte
 * ett löfte utan en gissning.
 *
 * Därför räknas ingenting här. Funktionen kör samma två steg som exekveraren
 * gör vid godkännande (app/api/approvals/[id]/route.ts, case
 * 'create_quote_draft'):
 *
 *   1. `generatedQuoteToQuoteItems` — payload.preview → riktiga offertrader
 *   2. `calculateQuoteTotals`       — den enda summa-sanningen i kodbasen
 *
 * Det är samma felklass som B4 rättade i offertflödet: kortet visade rader
 * från en generering och godkännandet sparade en annan. Ett godkännande som
 * inte betyder "spara det jag ser" är inget godkännande.
 *
 * ═══ VARFÖR INTE total_before_vat ═══
 *
 * `payload.preview.total_before_vat` finns och vore enklare — men den är
 * modellens egen summa, exkl. moms och före avdrag. Kunden betalar inklusive
 * moms och efter ROT. Att visa modellens tal hade gett ett annat belopp än
 * offerten, på just den plats där beloppet är hela beslutet.
 *
 * Rena funktioner — tests/quote-preview-summary.spec.ts.
 */

import {
  generatedQuoteToQuoteItems,
  type GeneratedQuoteItemInput,
} from '@/lib/quotes/generated-to-quote-items'
import { calculateQuoteTotals } from '@/lib/quote-calculations'

/** Formen `lib/quotes/suggest-quote-draft.ts` lägger i payload.preview. */
export interface QuoteDraftPreview {
  job_title?: string | null
  job_description?: string | null
  items?: GeneratedQuoteItemInput[] | null
  options?: GeneratedQuoteItemInput[] | null
  suggested_deduction_type?: 'rot' | 'rut' | 'none' | null
  total_before_vat?: number | null
}

export interface QuoteSummaryRow {
  label: string
  amount: number
  /** Avdragsrader visas i teal med minustecken. */
  deduction?: boolean
}

export interface QuoteSummary {
  /** Raderna i beloppsrutan, i ordning. */
  rows: QuoteSummaryRow[]
  /** Vad kunden faktiskt betalar — inkl. moms, efter avdrag. */
  customerPays: number
  /** Offertens rader, för radtabellen i det expanderade läget. */
  lines: Array<{ description: string; qualifier: string; amount: number }>
  /** Går summan att lita på? False → visa ingen beloppsruta alls. */
  ready: boolean
}

function kr(n: number): number {
  return Math.round(n)
}

/**
 * Bygger beloppsrutan ur payload.preview.
 *
 * `ready: false` när previewen saknar rader — då faller exekveraren tillbaka
 * på omgenerering, och kortet vet alltså inte vad som kommer att sparas. Att
 * visa en summa då hade varit att lova något vi inte kan hålla.
 */
export function quoteDraftSummary(preview: QuoteDraftPreview | null | undefined): QuoteSummary {
  const tomt: QuoteSummary = { rows: [], customerPays: 0, lines: [], ready: false }
  if (!preview?.items?.length) return tomt

  const items = generatedQuoteToQuoteItems(
    preview.items,
    preview.options,
    preview.suggested_deduction_type,
  )
  const t = calculateQuoteTotals(items)

  // Arbete och material visas INKLUSIVE moms, precis som mockupen — det är
  // vad kunden ser på offerten. Momsen fördelas proportionellt mot subtotalen
  // så delarna alltid summerar till totalen.
  const subtotal = t.subtotal || 1
  const momsfaktor = t.total / subtotal

  const arbete = kr((t.laborTotal + t.serviceTotal) * momsfaktor)
  const material = kr(t.materialTotal * momsfaktor)

  const rows: QuoteSummaryRow[] = []
  if (arbete > 0) rows.push({ label: 'Arbete inkl. moms', amount: arbete })
  if (material > 0) rows.push({ label: 'Material', amount: material })
  if (t.discountAmount > 0) rows.push({ label: 'Rabatt', amount: kr(t.discountAmount), deduction: true })

  // Avdragen namnges vid rätt namn — "avdrag" i största allmänhet säger inte
  // vilket, och ROT och RUT har olika regler kunden kan behöva känna till.
  if (t.rotDeduction > 0) rows.push({ label: 'ROT-avdrag', amount: kr(t.rotDeduction), deduction: true })
  if (t.rutDeduction > 0) rows.push({ label: 'RUT-avdrag', amount: kr(t.rutDeduction), deduction: true })
  if (t.gronDeduction > 0) rows.push({ label: 'Grön teknik-avdrag', amount: kr(t.gronDeduction), deduction: true })

  const lines = items
    .filter(i => i.item_type === 'item' || i.item_type === 'option')
    .map(i => ({
      description: i.description,
      // Kvalificeraren är antal och enhet — men bara när den säger något.
      // "1 st" bakom varje rad är brus.
      qualifier: i.quantity && i.quantity !== 1 ? `${i.quantity} ${i.unit}` : '',
      amount: kr(i.quantity * i.unit_price),
    }))

  return {
    rows,
    customerPays: kr(t.customerPaysAfterDeductions),
    lines,
    ready: true,
  }
}
