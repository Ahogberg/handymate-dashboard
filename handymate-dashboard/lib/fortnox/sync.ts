/**
 * V7 Fortnox Sync Engine
 *
 * Wraps existing sync functions with fortnox_sync table tracking.
 * Provides batch sync and status tracking per entity.
 */

import { createClient } from '@supabase/supabase-js'
import {
  syncCustomerToFortnox,
  syncInvoiceToFortnox,
  syncQuoteToFortnox,
  registerFortnoxPayment,
  isFortnoxConnected,
} from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

interface SyncResult {
  success: boolean
  skipped?: boolean
  synced: number
  errors: number
  details: Array<{
    entityType: string
    entityId: string
    status: 'synced' | 'error' | 'skipped'
    fortnoxId?: string
    error?: string
  }>
}

/**
 * Track a sync attempt in the fortnox_sync table.
 */
async function trackSync(
  businessId: string,
  entityType: string,
  entityId: string,
  status: 'synced' | 'error' | 'pending',
  fortnoxId?: string,
  errorMessage?: string
): Promise<void> {
  const supabase = getSupabase()

  try {
    await supabase
      .from('fortnox_sync')
      .upsert(
        {
          business_id: businessId,
          entity_type: entityType,
          entity_id: entityId,
          fortnox_id: fortnoxId || null,
          sync_status: status,
          last_synced_at: status === 'synced' ? new Date().toISOString() : null,
          error_message: errorMessage || null,
        },
        { onConflict: 'business_id,entity_type,entity_id' }
      )
  } catch (err) {
    console.error('[fortnox-sync] Failed to track sync:', err)
  }
}

/**
 * Sync a single customer and track in fortnox_sync.
 */
export async function syncCustomerWithTracking(
  businessId: string,
  customerId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }> {
  const result = await syncCustomerToFortnox(businessId, customerId)

  if (result.skipped) {
    return { success: false, skipped: true, error: result.error }
  }

  await trackSync(
    businessId,
    'customer',
    customerId,
    result.success ? 'synced' : 'error',
    result.customerNumber,
    result.error
  )

  return {
    success: result.success,
    fortnoxId: result.customerNumber,
    error: result.error,
  }
}

/**
 * Sync a single invoice and track in fortnox_sync.
 */
export async function syncInvoiceWithTracking(
  businessId: string,
  invoiceId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }> {
  const result = await syncInvoiceToFortnox(businessId, invoiceId)

  if (result.skipped) {
    return { success: false, skipped: true, error: result.error }
  }

  await trackSync(
    businessId,
    'invoice',
    invoiceId,
    result.success ? 'synced' : 'error',
    result.fortnoxInvoiceNumber || result.fortnoxDocumentNumber,
    result.error
  )

  return {
    success: result.success,
    fortnoxId: result.fortnoxInvoiceNumber || result.fortnoxDocumentNumber,
    error: result.error,
  }
}

/**
 * Sync a single quote and track in fortnox_sync.
 */
export async function syncQuoteWithTracking(
  businessId: string,
  quoteId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }> {
  const result = await syncQuoteToFortnox(businessId, quoteId)

  if (result.skipped) {
    return { success: false, skipped: true, error: result.error }
  }

  await trackSync(
    businessId,
    'quote',
    quoteId,
    result.success ? 'synced' : 'error',
    result.fortnoxOfferNumber,
    result.error
  )

  return {
    success: result.success,
    fortnoxId: result.fortnoxOfferNumber,
    error: result.error,
  }
}

/**
 * Register a payment in Fortnox and track.
 */
export async function syncPaymentWithTracking(
  businessId: string,
  invoiceId: string,
  fortnoxInvoiceNumber: string,
  amount: number,
  paymentDate?: string
): Promise<{ success: boolean; skipped?: boolean; error?: string }> {
  const result = await registerFortnoxPayment(businessId, fortnoxInvoiceNumber, amount, paymentDate)

  if (result.skipped) {
    return { success: false, skipped: true, error: result.error }
  }

  // Track payment as a sync event on the invoice
  await trackSync(
    businessId,
    'invoice',
    invoiceId,
    result.success ? 'synced' : 'error',
    fortnoxInvoiceNumber,
    result.error
  )

  return { success: result.success, error: result.error }
}

/**
 * Batch sync all unsynced entities for a business.
 * Safe to call even if Fortnox is not connected — returns skipped.
 */
export async function batchSync(
  businessId: string,
  entityType?: 'customer' | 'invoice' | 'quote'
): Promise<SyncResult> {
  const connected = await isFortnoxConnected(businessId)
  if (!connected) {
    return {
      success: false,
      skipped: true,
      synced: 0,
      errors: 0,
      details: [{ entityType: 'all', entityId: '', status: 'skipped', error: 'fortnox_not_connected' }],
    }
  }

  const supabase = getSupabase()
  const details: SyncResult['details'] = []
  let synced = 0
  let errors = 0

  // Sync customers
  if (!entityType || entityType === 'customer') {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', businessId)
      .is('fortnox_customer_number', null)
      .limit(50)

    for (const c of customers || []) {
      const result = await syncCustomerWithTracking(businessId, c.customer_id)
      if (result.success) synced++
      else errors++
      details.push({
        entityType: 'customer',
        entityId: c.customer_id,
        status: result.success ? 'synced' : 'error',
        fortnoxId: result.fortnoxId,
        error: result.error,
      })
    }
  }

  // Sync invoices
  if (!entityType || entityType === 'invoice') {
    const { data: invoices } = await supabase
      .from('invoice')
      .select('invoice_id')
      .eq('business_id', businessId)
      .is('fortnox_invoice_number', null)
      .limit(50)

    for (const inv of invoices || []) {
      const result = await syncInvoiceWithTracking(businessId, inv.invoice_id)
      if (result.success) synced++
      else errors++
      details.push({
        entityType: 'invoice',
        entityId: inv.invoice_id,
        status: result.success ? 'synced' : 'error',
        fortnoxId: result.fortnoxId,
        error: result.error,
      })
    }
  }

  // Sync quotes
  if (!entityType || entityType === 'quote') {
    const { data: quotes } = await supabase
      .from('quotes')
      .select('quote_id')
      .eq('business_id', businessId)
      .is('fortnox_offer_number', null)
      .limit(50)

    for (const q of quotes || []) {
      const result = await syncQuoteWithTracking(businessId, q.quote_id)
      if (result.success) synced++
      else errors++
      details.push({
        entityType: 'quote',
        entityId: q.quote_id,
        status: result.success ? 'synced' : 'error',
        fortnoxId: result.fortnoxId,
        error: result.error,
      })
    }
  }

  return { success: errors === 0, synced, errors, details }
}
