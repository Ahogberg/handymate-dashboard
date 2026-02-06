import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { isFortnoxConnected, getFortnoxCustomers } from '@/lib/fortnox'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

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
    const cookieStore = await cookies()
    const supabase = getSupabase()

    // Get user from auth cookie
    const authCookie = cookieStore.get('sb-access-token')?.value ||
                       cookieStore.get('supabase-auth-token')?.value

    if (!authCookie) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: { user }, error: authError } = await createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    ).auth.getUser(authCookie)

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get business_id
    const { data: business, error: businessError } = await supabase
      .from('business_config')
      .select('business_id')
      .eq('user_id', user.id)
      .single()

    if (businessError || !business) {
      return NextResponse.json({ error: 'Business not found' }, { status: 404 })
    }

    const businessId = business.business_id

    // Check Fortnox connection
    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    // Get customers from Fortnox
    const fortnoxCustomers = await getFortnoxCustomers(businessId)

    // Get existing customers from Handymate
    const { data: existingCustomers } = await supabase
      .from('customer')
      .select('email, phone_number, fortnox_customer_number')
      .eq('business_id', businessId)

    // Create lookup sets for matching
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

    // Import each customer
    for (const fc of fortnoxCustomers) {
      // Skip if already linked
      if (fc.CustomerNumber && existingFortnoxNumbers.has(fc.CustomerNumber)) {
        results.skipped++
        continue
      }

      // Skip if matching email or phone exists
      if (fc.Email && existingEmails.has(fc.Email.toLowerCase())) {
        results.skipped++
        continue
      }
      if (fc.Phone1 && existingPhones.has(normalizePhone(fc.Phone1))) {
        results.skipped++
        continue
      }

      try {
        // Build address line
        let addressLine = ''
        if (fc.Address1) {
          addressLine = fc.Address1
          if (fc.ZipCode || fc.City) {
            addressLine += ', ' + [fc.ZipCode, fc.City].filter(Boolean).join(' ')
          }
        }

        // Create customer in Handymate
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

/**
 * Normalize phone number for comparison
 */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return ''
  return phone.replace(/[\s\-\(\)]/g, '').replace(/^00/, '+')
}
