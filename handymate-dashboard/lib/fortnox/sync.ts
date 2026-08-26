/**
 * V7 Fortnox Sync Engine
 *
 * Wraps existing sync functions with fortnox_sync table tracking.
 * Provides batch sync and status tracking per entity.
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  syncCustomerToFortnox,
  syncQuoteToFortnox,
  registerFortnoxPayment,
  isFortnoxConnected,
} from '@/lib/fortnox'
import { syncInvoiceToFortnox } from '@/lib/invoices/sync-to-fortnox'

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
 * Kundsynk vid SKAPANDE (2026-08-26, Andreas-beslut: alla fem
 * skapandevägar, inkl. lead-webhooken).
 *
 * ═══ VARFÖR ═══
 * Synken var lat — bara vid första faktura/offert. Kunderna hamnade i
 * Fortnox i FAKTURERINGSordning, inte skapandeordning, och aldrig
 * fakturerade kunder fanns aldrig där. Fortnox tilldelar kundnumret vid
 * skapandet (createFortnoxCustomer skickar medvetet inget eget nummer), så
 * enda sättet att hålla Fortnox löpnummer i sann skapandeordning är att
 * synka i samma ögonblick kunden skapas i Handymate.
 *
 * ═══ KONTRAKT ═══
 * - Kastar ALDRIG. Awaitas i try/catch på anropsplatsen (repots konvention:
 *   aldrig en lösryckt promise — serverless dödar den när svaret går).
 * - Kortsluter på business_config.fortnox_connected (EN query) så en het
 *   skapandeväg (lead-webhook) inte betalar 5 rundturer för okopplade konton.
 *   OBS: isFortnoxConnected() läser en ANNAN sanning (token + connected_at)
 *   — flaggan räcker som förfilter; syncCustomerToFortnox gör den riktiga
 *   kollen ändå.
 * - Idempotent via vakten i syncCustomerToFortnox (fortnox_customer_number
 *   redan satt → inget nytt Fortnox-anrop). Dubbelanrop är billiga och
 *   ofarliga; fakturasynkens lata väg finns kvar som skyddsnät.
 * - Ett äkta fel (inte skipped) eskaleras via rapporteraTystFel så
 *   driftlarmet ser det — annars är en trasig kundsynk osynlig tills första
 *   fakturan failar.
 */
export async function syncNewCustomerToFortnox(
  supabase: SupabaseClient,
  businessId: string,
  customerId: string,
): Promise<{ synced: boolean; skipped: boolean; fortnoxId?: string; error?: string }> {
  try {
    const { data: cfg, error: cfgError } = await supabase
      .from('business_config')
      .select('fortnox_connected')
      .eq('business_id', businessId)
      .maybeSingle()
    if (cfgError || !cfg?.fortnox_connected) {
      return { synced: false, skipped: true }
    }

    const result = await syncCustomerWithTracking(businessId, customerId)
    if (result.skipped) return { synced: false, skipped: true }
    if (!result.success) {
      try {
        const { rapporteraTystFel } = await import('@/lib/observability/driftlarm')
        await rapporteraTystFel(
          supabase,
          businessId,
          'customer-create:fortnox-sync',
          result.error || 'okänt fel',
          { customerId },
        )
      } catch { /* driftlarmet får aldrig fälla skapandet */ }
      return { synced: false, skipped: false, error: result.error }
    }
    return { synced: true, skipped: false, fortnoxId: result.fortnoxId }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[syncNewCustomerToFortnox] oväntat fel (non-blocking):', message)
    return { synced: false, skipped: false, error: message }
  }
}

/**
 * Sync a single invoice and track in fortnox_sync.
 */
export async function syncInvoiceWithTracking(
  businessId: string,
  invoiceId: string
): Promise<{ success: boolean; skipped?: boolean; fortnoxId?: string; error?: string }> {
  const result = await syncInvoiceToFortnox(getSupabase(), { businessId, invoiceId })

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

  // Sync customers — i SKAPANDEORDNING (2026-08-26). Utan order gav
  // Postgres godtycklig ordning → Fortnox löpnummer i slumpordning, vilket
  // är motsatsen till hela poängen med svepet (skyddsnät för importer/
  // klientvägar som inte går genom syncNewCustomerToFortnox). Felet läses:
  // ett tyst misslyckat uppslag får inte se ut som "inga kunder att synka".
  if (!entityType || entityType === 'customer') {
    const { data: customers, error: customersError } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', businessId)
      .is('fortnox_customer_number', null)
      .order('created_at', { ascending: true })
      .limit(50)
    if (customersError) {
      errors++
      details.push({ entityType: 'customer', entityId: '', status: 'error', error: customersError.message })
    }

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
