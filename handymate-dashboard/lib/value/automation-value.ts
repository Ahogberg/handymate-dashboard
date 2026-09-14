/**
 * Automationsvärde senaste 7 dagarna — ren härledning (2026-09-14).
 *
 * Bakgrund (ROI-audit P0): den gamla rutten app/api/automation/value
 * räknade om "sparad tid" till kronor med en schablon (15 kronor per minut) och la
 * kronorna i SAMMA lista och SAMMA summa som signerade offerter och betalda
 * fakturor, alla märkta `confirmed`. Det bröt Value Ledgerns första regel
 * (lib/value/ledger.ts): en uppskattning får aldrig redovisas som bekräftad
 * krona.
 *
 * ═══ ÄRLIGHETSREGLERNA (facit i tests/automation-value-honesty.spec.ts) ═══
 *
 * 1. Sparad tid är MINUTER, aldrig kronor. Den summeras för sig
 *    (`estimated_minutes`) med schablonen synlig (`estimate_basis`).
 * 2. `confirmed_value` innehåller bara belopp som kommer från en faktura
 *    eller offert i databasen — aldrig från kortets eller loggens egen
 *    gissning, aldrig från tid.
 * 3. Betald faktura räknas med registrerat betalt belopp (paid_amount) när
 *    det finns, annars fakturans total — samma metod som ledgern.
 * 4. Signerad offert är bekräftad HÄNDELSE men inte kassaflöde: den
 *    redovisas i `signed_quote_value`, separat från `paid_value`.
 * 5. Samma offert eller faktura räknas aldrig två gånger.
 * 6. `total_value` finns kvar för bakåtkompatibilitet och är exakt
 *    `confirmed_value` — pengar, aldrig tid.
 */

export const ESTIMATED_MINUTES_PER_BOOKING_REMINDER = 5
export const ESTIMATED_MINUTES_PER_PIPELINE_UPDATE = 2
export const ESTIMATE_BASIS =
  `Uppskattning: ${ESTIMATED_MINUTES_PER_BOOKING_REMINDER} min per bokningspåminnelse, `
  + `${ESTIMATED_MINUTES_PER_PIPELINE_UPDATE} min per pipeline-uppdatering. Ingen tid mäts ännu.`

export interface AutomationLogRow {
  rule_name: string | null
  action_type: string | null
  context: Record<string, unknown> | null
  result: Record<string, unknown> | null
  created_at: string
}

export interface QuoteFacit { status: string | null; total: number | string | null; title?: string | null }
export interface InvoiceFacit {
  status: string | null
  total: number | string | null
  paid_amount?: number | string | null
  paid_at: string | null
  invoice_number?: string | null
}

export type AutomationValueItem =
  | { type: 'quote_signed'; label: string; amount: number; status: 'confirmed'; date?: string; ref: string }
  | { type: 'invoice_paid'; label: string; amount: number; status: 'confirmed'; date?: string; ref: string }
  | { type: 'time_saved'; label: string; minutes: number; status: 'estimated'; date?: string }

export interface AutomationValueSummary {
  /** Bekräftade kronor: betalda fakturor + signerade offerter. Aldrig tid. */
  confirmed_value: number
  /** Delmängd av confirmed_value: bara registrerade betalningar. */
  paid_value: number
  /** Delmängd av confirmed_value: signerade offerters totalbelopp (inte kassaflöde). */
  signed_quote_value: number
  /** Uppskattad sparad tid i minuter, aldrig omräknad till kronor. */
  estimated_minutes: number
  estimate_basis: string
  items: AutomationValueItem[]
  pending_count: number
  period_days: 7
  /** Bakåtkompatibelt alias för confirmed_value. */
  total_value: number
}

const PAID_WINDOW_DAYS = 7

function kr(value: number | string | null | undefined): number {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

/**
 * Ren. Ingen I/O. `quotes` och `invoices` är de uppslag rutten redan gjort
 * per id — funktionen gissar aldrig fram ett belopp som inte finns där.
 */
export function summariseAutomationValue(
  logs: AutomationLogRow[],
  facit: { quotes: Map<string, QuoteFacit>; invoices: Map<string, InvoiceFacit> },
): AutomationValueSummary {
  const items: AutomationValueItem[] = []
  const seenRefs = new Set<string>()
  let pendingCount = 0

  for (const log of logs) {
    const ctx = log.context || {}
    const res = log.result || {}

    if (log.rule_name === 'quote_followup' || log.action_type === 'send_sms') {
      const quoteId = (ctx.quote_id ?? res.quote_id) as string | undefined
      if (quoteId) {
        const quote = facit.quotes.get(quoteId)
        if (quote?.status === 'accepted') {
          const ref = `quote:${quoteId}`
          if (!seenRefs.has(ref)) {
            seenRefs.add(ref)
            items.push({
              type: 'quote_signed',
              label: `Offert signerad efter uppföljning${quote.title ? ': ' + quote.title : ''}`,
              amount: kr(quote.total),
              status: 'confirmed',
              date: log.created_at,
              ref,
            })
          }
        } else if (quote && quote.status !== 'declined') {
          pendingCount++
        }
      }
    }

    if (log.rule_name === 'invoice_reminder') {
      const invoiceId = (ctx.invoice_id ?? res.invoice_id) as string | undefined
      if (invoiceId) {
        const invoice = facit.invoices.get(invoiceId)
        if (invoice?.status === 'paid' && invoice.paid_at) {
          const daysDiff = (new Date(invoice.paid_at).getTime() - new Date(log.created_at).getTime()) / (24 * 3600000)
          const ref = `invoice:${invoiceId}`
          if (daysDiff >= 0 && daysDiff <= PAID_WINDOW_DAYS && !seenRefs.has(ref)) {
            seenRefs.add(ref)
            items.push({
              type: 'invoice_paid',
              label: `Faktura betald efter påminnelse: ${invoice.invoice_number || ''}`.trim(),
              amount: kr(invoice.paid_amount) || kr(invoice.total),
              status: 'confirmed',
              date: invoice.paid_at,
              ref,
            })
          }
        }
      }
    }

    if (log.rule_name === 'booking_reminder') {
      items.push({ type: 'time_saved', label: 'Bokningspåminnelse skickad', minutes: ESTIMATED_MINUTES_PER_BOOKING_REMINDER, status: 'estimated', date: log.created_at })
    }
    if (log.action_type === 'update_pipeline' || log.action_type === 'move_deal') {
      items.push({ type: 'time_saved', label: 'Pipeline uppdaterad automatiskt', minutes: ESTIMATED_MINUTES_PER_PIPELINE_UPDATE, status: 'estimated', date: log.created_at })
    }
  }

  let paidValue = 0
  let signedQuoteValue = 0
  let estimatedMinutes = 0
  for (const item of items) {
    if (item.type === 'invoice_paid') paidValue += item.amount
    else if (item.type === 'quote_signed') signedQuoteValue += item.amount
    else estimatedMinutes += item.minutes
  }
  const confirmedValue = Math.round(paidValue + signedQuoteValue)

  return {
    confirmed_value: confirmedValue,
    paid_value: Math.round(paidValue),
    signed_quote_value: Math.round(signedQuoteValue),
    estimated_minutes: estimatedMinutes,
    estimate_basis: ESTIMATE_BASIS,
    items,
    pending_count: pendingCount,
    period_days: 7,
    total_value: confirmedValue,
  }
}
