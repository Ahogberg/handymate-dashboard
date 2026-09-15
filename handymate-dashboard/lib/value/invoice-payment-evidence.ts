import { isCustomerSettled } from '@/lib/invoices/status'

/** Shared legacy invoice evidence. A status never replaces a recorded partial amount. */
export function invoicePaymentEvidence(invoice: { total: unknown; status: string; paid_amount?: unknown; paid_at?: string | null }) {
  const total = Number(invoice.total)
  const raw = invoice.paid_amount == null ? (invoice.status === 'paid' ? total : null) : Number(invoice.paid_amount)
  const paidKr = Number.isFinite(total) && total >= 0 && raw !== null && Number.isFinite(raw) && raw > 0 ? Math.min(total, raw) : 0
  const paidAt = invoice.paid_at ? Date.parse(invoice.paid_at) : NaN
  return { paid_kr: paidKr, paid: isCustomerSettled(invoice.status) && paidKr > 0, paid_at_ms: Number.isFinite(paidAt) ? paidAt : null }
}
