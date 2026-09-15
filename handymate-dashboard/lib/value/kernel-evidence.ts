import type { SupabaseClient } from '@supabase/supabase-js'
import type { LedgerInvoiceFacit } from './ledger'
import { kernelValueEnabled } from './events/kernel-consumer'

export async function usesKernelValue(
  db: SupabaseClient,
  businessId: string,
): Promise<boolean> {
  if (!kernelValueEnabled()) return false
  const { data, error } = await db
    .from('business_config')
    .select('financial_kernel_enabled')
    .eq('business_id', businessId)
    .maybeSingle()
  if (error) throw new Error('value_kernel_rollout_read_failed')
  return data?.financial_kernel_enabled === true
}
export function minorToKr(raw: unknown): number {
  if (typeof raw !== 'string' || !/^\d+$/.test(raw))
    throw new Error('value_money_invalid_amount')
  const value = BigInt(raw)
  if (value > BigInt(Number.MAX_SAFE_INTEGER))
    throw new Error('value_money_unsafe_amount')
  return Number(value) / 100
}
export async function readKernelInvoiceEvidence(
  db: SupabaseClient,
  businessId: string,
  invoiceIds: string[],
): Promise<Map<string, LedgerInvoiceFacit>> {
  const result = new Map<string, LedgerInvoiceFacit>()
  let watermark: string | undefined
  for (let offset = 0; offset < invoiceIds.length; offset += 100) {
    const ids = invoiceIds.slice(offset, offset + 100)
    const { data, error } = await db.rpc('read_value_invoice_evidence', {
      p_business_id: businessId,
      p_invoice_ids: ids,
    })
    if (error) throw new Error(`value_money_read_failed: ${error.message}`)
    if (
      data?.source !== 'kernel' ||
      typeof data.through_seq !== 'string' ||
      !Array.isArray(data.invoices)
    )
      throw new Error('value_money_invalid_response')
    if (watermark !== undefined && watermark !== data.through_seq)
      throw new Error('value_money_changed_during_read')
    watermark = data.through_seq
    for (const row of data.invoices) {
      if (
        !ids.includes(row.invoice_id) ||
        row.currency !== 'SEK' ||
        result.has(row.invoice_id)
      )
        throw new Error('value_money_invalid_identity')
      const total = minorToKr(row.billed_minor),
        paid = minorToKr(row.paid_minor)
      if (paid > total || typeof row.customer_settled !== 'boolean')
        throw new Error('value_money_invalid_state')
      const paidAt = row.paid_at ? Date.parse(row.paid_at) : NaN
      if (paid > 0 && !Number.isFinite(paidAt))
        throw new Error('value_money_missing_payment_time')
      const allocated = minorToKr(row.allocated_customer_minor)
      // Match the established credited-invoice exclusion; immutable history remains available.
      if (total === 0 && minorToKr(row.issued_minor) > 0) continue
      result.set(row.invoice_id, {
        total_kr: total,
        paid_kr: paid,
        paid: row.customer_settled && paid > 0,
        paid_at_ms: Number.isFinite(paidAt) ? paidAt : null,
        ...(!row.customer_settled && allocated > 0
          ? { partial_paid_kr: Math.min(allocated, total) }
          : {}),
      })
    }
  }
  return result
}

export async function readKernelPayments(
  db: SupabaseClient,
  businessId: string,
  from: string,
  to: string,
) {
  const rows: Array<{
    invoice_id: string
    customer_id: string
    quote_id: string | null
    invoice_number: string | null
    total: number
    paid_amount: number
    status: 'paid'
    paid_at: string
  }> = []
  let cursor = '',
    watermark: string | undefined
  for (;;) {
    const { data, error } = await db.rpc('read_value_payment_window', {
      p_business_id: businessId,
      p_from: from,
      p_to: to,
      p_after: cursor,
    })
    if (
      error ||
      !Array.isArray(data?.payments) ||
      typeof data.through_seq !== 'string'
    )
      throw new Error('value_money_window_read_failed')
    if (watermark !== undefined && watermark !== data.through_seq)
      throw new Error('value_money_changed_during_read')
    watermark = data.through_seq
    for (const row of data.payments) {
      if (
        row.currency !== 'SEK' ||
        typeof row.invoice_id !== 'string' ||
        row.invoice_id <= cursor ||
        row.customer_settled !== true ||
        !Number.isFinite(Date.parse(row.paid_at))
      )
        throw new Error('value_money_invalid_payment')
      rows.push({
        invoice_id: row.invoice_id,
        customer_id: row.customer_id,
        quote_id: row.quote_id,
        invoice_number: row.invoice_number,
        total: minorToKr(row.billed_minor),
        paid_amount: minorToKr(row.paid_minor),
        status: 'paid',
        paid_at: row.paid_at,
      })
    }
    if (data.next_cursor === null) return rows
    if (typeof data.next_cursor !== 'string' || data.next_cursor <= cursor)
      throw new Error('value_money_cursor_not_advancing')
    cursor = data.next_cursor
  }
}

export async function readKernelWatermark(
  db: SupabaseClient,
  businessId: string,
): Promise<string> {
  const { data, error } = await db.rpc('read_value_invoice_evidence', {
    p_business_id: businessId,
    p_invoice_ids: [],
  })
  if (
    error ||
    data?.source !== 'kernel' ||
    typeof data.through_seq !== 'string'
  )
    throw new Error('value_money_projection_not_ready')
  return data.through_seq
}
