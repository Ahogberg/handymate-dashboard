import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import {
  isFortnoxConnected,
  createFortnoxCustomer,
} from '@/lib/fortnox'

interface Customer {
  customer_id: string
  name: string
  email: string | null
  phone_number: string | null
  address_line: string | null
  fortnox_customer_number: string | null
}

/**
 * POST /api/fortnox/sync/customers
 * Sync all unsynced customers to Fortnox
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const { data: customers, error: fetchError } = await supabase
      .from('customer')
      .select('customer_id, name, email, phone_number, address_line, fortnox_customer_number')
      .eq('business_id', businessId)
      .is('fortnox_customer_number', null)

    if (fetchError) {
      throw fetchError
    }

    const results = {
      synced: 0,
      failed: 0,
      errors: [] as { customerId: string; name: string; error: string }[]
    }

    for (const customer of (customers as Customer[]) || []) {
      try {
        let address1 = ''
        let zipCode = ''
        let city = ''
        if (customer.address_line) {
          const parts = customer.address_line.split(',').map(p => p.trim())
          if (parts.length >= 1) address1 = parts[0]
          if (parts.length >= 2) {
            const cityParts = parts[1].match(/(\d{5})\s*(.*)/)
            if (cityParts) {
              zipCode = cityParts[1]
              city = cityParts[2] || ''
            } else {
              city = parts[1]
            }
          }
        }

        const fortnoxCustomer = await createFortnoxCustomer(businessId, {
          Name: customer.name,
          Email: customer.email || undefined,
          Phone1: customer.phone_number || undefined,
          Address1: address1 || undefined,
          ZipCode: zipCode || undefined,
          City: city || undefined
        })

        await supabase
          .from('customer')
          .update({
            fortnox_customer_number: fortnoxCustomer.CustomerNumber,
            fortnox_synced_at: new Date().toISOString(),
            fortnox_sync_error: null
          })
          .eq('customer_id', customer.customer_id)

        results.synced++

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.failed++
        results.errors.push({
          customerId: customer.customer_id,
          name: customer.name,
          error: errorMessage
        })

        await supabase
          .from('customer')
          .update({ fortnox_sync_error: errorMessage })
          .eq('customer_id', customer.customer_id)
      }
    }

    return NextResponse.json({
      success: true,
      synced: results.synced,
      failed: results.failed,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Sync customers error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Sync failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
