import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected } from '@/lib/fortnox'
import { syncCustomerWithTracking } from '@/lib/fortnox/sync'
import { logFortnoxOperation } from '@/lib/fortnox/api-log'

/**
 * POST /api/integrations/fortnox/sync/customers
 *
 * Pushar alla kunder utan fortnox_customer_number till Fortnox — i
 * skapandeordning, så Fortnox löpnummer följer Handymates ordning.
 *
 * KONSOLIDERAD 2026-08-26: rutten reimplementerade tidigare skapandet inline
 * (egen adressparsning + createFortnoxCustomer) UTAN Type/OrganisationNumber/
 * GLN → manuellt pushade företagskunder fick fel typ i Fortnox och
 * e-faktura kunde inte adresseras. Den skrev dessutom den då icke
 * existerande kolumnen fortnox_sync_error (se sql/v169). Nu går varje kund
 * genom samma väg som skapandesynken och fakturasynken:
 * syncCustomerToFortnox (via syncCustomerWithTracking, som även skriver
 * fortnox_sync-raden). En väg in, inga kopior som glider isär.
 */
export async function POST(request: NextRequest) {
  let businessId: string | null = null
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const { data: customers, error: fetchError } = await supabase
      .from('customer')
      .select('customer_id, name')
      .eq('business_id', businessId)
      .is('fortnox_customer_number', null)
      .order('created_at', { ascending: true })

    if (fetchError) {
      throw fetchError
    }

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as { customerId: string; name: string; error: string }[]
    }

    for (const customer of customers || []) {
      const r = await syncCustomerWithTracking(businessId, customer.customer_id)
      if (r.success) {
        results.synced++
      } else {
        results.failed++
        results.errors.push({
          customerId: customer.customer_id,
          name: customer.name,
          error: r.error || 'Unknown error',
        })
      }
    }

    await logFortnoxOperation(businessId, 'sync_customers', {
      synced: results.synced,
      failed: results.failed,
      error_count: results.errors.length,
    })

    return NextResponse.json({
      success: true,
      synced: results.synced,
      failed: results.failed,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Sync customers error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    if (businessId) {
      await logFortnoxOperation(businessId, 'sync_customers', null, errorMessage)
    }
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
