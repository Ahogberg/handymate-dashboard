import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected, getFortnoxCustomers } from '@/lib/fortnox'

interface ExistingCustomer {
  email: string | null
  phone_number: string | null
  fortnox_customer_number: string | null
}

/**
 * POST /api/fortnox/import/customers
 * Import customers from Fortnox to Handymate
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

    const fortnoxCustomers = await getFortnoxCustomers(businessId)

    const { data: existingCustomers } = await supabase
      .from('customer')
      .select('email, phone_number, fortnox_customer_number')
      .eq('business_id', businessId)

    const typedCustomers = existingCustomers as ExistingCustomer[] | null
    const existingEmails = new Set(
      typedCustomers?.map(c => c.email?.toLowerCase()).filter(Boolean) || []
    )
    const existingPhones = new Set(
      typedCustomers?.map(c => normalizePhone(c.phone_number)).filter(Boolean) || []
    )
    const existingFortnoxNumbers = new Set(
      typedCustomers?.map(c => c.fortnox_customer_number).filter(Boolean) || []
    )

    const results = {
      imported: 0,
      skipped: 0,
      errors: [] as { customerNumber: string; name: string; error: string }[]
    }

    for (const fc of fortnoxCustomers) {
      if (fc.CustomerNumber && existingFortnoxNumbers.has(fc.CustomerNumber)) {
        results.skipped++
        continue
      }

      if (fc.Email && existingEmails.has(fc.Email.toLowerCase())) {
        results.skipped++
        continue
      }
      if (fc.Phone1 && existingPhones.has(normalizePhone(fc.Phone1))) {
        results.skipped++
        continue
      }

      try {
        let addressLine = ''
        if (fc.Address1) {
          addressLine = fc.Address1
          if (fc.ZipCode || fc.City) {
            addressLine += ', ' + [fc.ZipCode, fc.City].filter(Boolean).join(' ')
          }
        }

        const customerId = 'cust_' + Math.random().toString(36).substr(2, 12)

        const { error: insertError } = await supabase
          .from('customer')
          .insert({
            customer_id: customerId,
            business_id: businessId,
            name: fc.Name,
            email: fc.Email || null,
            phone_number: fc.Phone1 || null,
            address_line: addressLine || null,
            fortnox_customer_number: fc.CustomerNumber,
            fortnox_synced_at: new Date().toISOString()
          })

        if (insertError) {
          throw insertError
        }

        results.imported++

      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        results.errors.push({
          customerNumber: fc.CustomerNumber || 'N/A',
          name: fc.Name,
          error: errorMessage
        })
      }
    }

    return NextResponse.json({
      success: true,
      imported: results.imported,
      skipped: results.skipped,
      total: fortnoxCustomers.length,
      errors: results.errors
    })

  } catch (error: unknown) {
    console.error('Import customers error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Import failed'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}

function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^00/, '+')
}
