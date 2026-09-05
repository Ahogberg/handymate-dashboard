import { formatSEK } from '@/lib/format-price'
import type { ExecutionOutcome } from '@/lib/approvals/execution-outcome'
import { formatRequestedDateShort } from '@/lib/quotes/booking-suggestions'

export interface ValueReceiptApproval {
  approval_type: string
  payload?: Record<string, unknown> | null
}

export interface ValueReceipt {
  text: string
  link?: string
  linkLabel?: string
}

/**
 * Korttyperna som kan ge ett verifierat kvitto (switchen nedan). Exporterad
 * så aktiveringsmåtten (lib/admin/activation-metrics.ts) och kvittot aldrig
 * glider isär — facit låser att listan matchar case-satserna.
 */
export const RECEIPT_APPROVAL_TYPES = [
  'confirm_payment',
  'review_auto_invoice',
  'invoice_reminder',
  'fakturera_projekt',
  'send_sms',
  'create_ata_draft',
  'new_booking_request',
] as const

const positiveAmount = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null

const id = (value: unknown): string | null =>
  typeof value === 'string' && value.trim().length > 0 ? value : null

/**
 * Omedelbart värdekvitto efter en verifierat lyckad handling.
 *
 * Kvittot härleder aldrig status ur text eller payload. Serverns klassade
 * execution_outcome måste vara success OCH varje handling måste bära sitt
 * eget konkreta utförandebevis. Saknas något visas mindre, aldrig ett
 * påhittat belopp eller en handling som inte skedde.
 *
 * `missad_intakt` finns avsiktligt inte här. Den typen är REVIEW_REQUIRED:
 * generiska Godkänn skapar inget fakturaunderlag. Dess dedikerade review-yta
 * ansvarar för sitt eget kvitto när ett riktigt utkast har skapats.
 */
export function buildValueReceipt(
  approval: ValueReceiptApproval | null | undefined,
  execution: Record<string, unknown> | null | undefined,
  outcome: ExecutionOutcome | null | undefined,
): ValueReceipt | null {
  if (!approval || !execution || outcome !== 'success') return null
  if (execution.action !== approval.approval_type) return null

  const payload = approval.payload || {}

  switch (approval.approval_type) {
    case 'confirm_payment': {
      const amount = positiveAmount(payload.total)
      const invoiceId = id(payload.invoice_id)
      if (execution.ok !== true || amount === null || !invoiceId) return null
      return {
        text: `Betalning bekräftad — ${formatSEK(amount)} inbetalt`,
        link: `/dashboard/invoices/${invoiceId}`,
        linkLabel: 'Öppna fakturan',
      }
    }

    case 'review_auto_invoice': {
      const amount = positiveAmount(payload.total)
      const invoiceId = id(execution.invoice_id)
      if (amount === null || !invoiceId) return null
      const invoiceNumber = id(payload.invoice_number)
      return {
        text: invoiceNumber
          ? `Faktura ${invoiceNumber} skickad — ${formatSEK(amount)} fakturerat`
          : `Faktura skickad — ${formatSEK(amount)} fakturerat`,
        link: `/dashboard/invoices/${invoiceId}`,
        linkLabel: 'Öppna fakturan',
      }
    }

    case 'invoice_reminder': {
      const amount = positiveAmount(payload.amount_kr)
      const invoiceId = id(payload.invoice_id)
      if (execution.sent !== true || execution.executed !== true || amount === null || !invoiceId) return null
      return {
        text: `Påminnelsen skickad — ${formatSEK(amount)} bevakas nu`,
        link: `/dashboard/invoices/${invoiceId}`,
        linkLabel: 'Öppna fakturan',
      }
    }

    case 'fakturera_projekt': {
      const amount = positiveAmount(payload.amount_kr)
      const invoiceId = id(execution.invoice_id)
      if (amount === null || !invoiceId) return null
      return {
        text: `Faktura skickad — ${formatSEK(amount)} fakturerat`,
        link: `/dashboard/invoices/${invoiceId}`,
        linkLabel: 'Öppna fakturan',
      }
    }

    case 'send_sms': {
      // Executor-kontraktet (app/api/approvals/[id]/route.ts, send_sms-casen):
      // { sms_sent: boolean, sms_id?: string }. Inget belopp — inget fakturerades.
      // Daniels offertuppföljning bär payload.quote_id (lib/agents/daniel/
      // quote-follow-up-card.ts); ett generiskt SMS-kort saknar det och får
      // ett kvitto utan länk.
      if (execution.sms_sent !== true || !id(execution.sms_id)) return null
      const customerName = id(payload.customer_name)
      const quoteId = id(payload.quote_id)
      const vem = customerName ? ` till ${customerName}` : ''
      return quoteId
        ? { text: `Uppföljning skickad${vem}`, link: `/dashboard/quotes/${quoteId}`, linkLabel: 'Öppna offerten' }
        : { text: `SMS skickat${vem}` }
    }
    case 'create_ata_draft': {
      const amount = positiveAmount(execution.total)
      if (execution.ok !== true || amount === null) return null

      const quoteId = id(execution.quote_id)
      const ataId = id(execution.ata_id)
      const projectId = id(execution.project_id)
      if (!quoteId && !ataId) return null

      return {
        text: `ÄTA-utkast skapat — ${formatSEK(amount)} att granska`,
        ...(quoteId
          ? { link: `/dashboard/quotes/${quoteId}`, linkLabel: 'Öppna utkastet' }
          : projectId
            ? { link: `/dashboard/projects/${projectId}`, linkLabel: 'Öppna projektet' }
            : {}),
      }
    }

    case 'new_booking_request': {
      // Starttiden (2026-09-05) — bara offertsignerings-grenen (source
      // 'quote_signing', app/api/approvals/[id]/route.ts,
      // executeQuoteSigningBooking) returnerar booking_id här; Mattes
      // SMS-förslagsgren för samma approval_type gör det aldrig, så den
      // grenen ger aldrig ett kvitto via detta case.
      const bookingId = id(execution.booking_id)
      if (execution.ok !== true || !bookingId) return null

      const datum = typeof payload.requested_date === 'string' && payload.requested_date
        ? formatRequestedDateShort(payload.requested_date)
        : null
      const bokadText = datum ? `Bokad ${datum}` : 'Bokad'

      if (execution.sms_sent === false) {
        const phone = id(payload.customer_phone)
        return {
          text: phone
            ? `${bokadText}. Kunden kunde inte nås per SMS — ring ${phone}`
            : `${bokadText}. Kunden kunde inte nås — inget telefonnummer sparat`,
          link: `/dashboard/bookings/${bookingId}`,
          linkLabel: 'Öppna bokningen',
        }
      }

      return {
        text: `${bokadText} — kunden fick en bekräftelse`,
        link: `/dashboard/bookings/${bookingId}`,
        linkLabel: 'Öppna bokningen',
      }
    }

    default:
      return null
  }
}
