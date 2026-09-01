import type { PartnerRevenueSnapshot, StripeInvoiceLike } from './revenue-classification'
import { classifyPaidInvoice } from './revenue-classification'

interface SupabaseLike {
  from(table: string): {
    select(columns: string): PromiseLike<{
      data: Array<{ stripe_price_id?: string | null }> | null
      error: { message: string } | null
    }>
  }
}

/**
 * Hämtar allowlistan från samma billing_plan-rader som skapar Checkout.
 * Miljöpris för leads-addon är en explicit exkluderingslista. Allt annat
 * förblir unknown och provisionsgrundas inte.
 */
export async function classifyStripeInvoiceForPartner(
  supabase: SupabaseLike,
  invoice: StripeInvoiceLike,
): Promise<PartnerRevenueSnapshot> {
  const { data, error } = await supabase
    .from('billing_plan')
    .select('stripe_price_id')

  if (error) {
    throw new Error(`Partnerintäktens prislista kunde inte verifieras: ${error.message}`)
  }

  const corePriceIds = new Set(
    (data || [])
      .map(row => row.stripe_price_id)
      .filter((id): id is string => typeof id === 'string' && id.startsWith('price_')),
  )
  const excludedPriceIds = new Set(
    [process.env.STRIPE_LEADS_STARTER_PRICE_ID, process.env.STRIPE_LEADS_PRO_PRICE_ID]
      .filter((id): id is string => typeof id === 'string' && id.startsWith('price_')),
  )

  return classifyPaidInvoice(invoice, { corePriceIds, excludedPriceIds })
}

