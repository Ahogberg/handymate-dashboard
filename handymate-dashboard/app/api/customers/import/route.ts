import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/customers/import
 * Bulk import customers from CSV data
 * Body: { customers: Array<{ name, phone_number, email, address }> }
 */
export async function POST(request: NextRequest) {
  const auth = await getAuthenticatedBusiness(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json()
  const { customers } = body

  if (!Array.isArray(customers) || customers.length === 0) {
    return NextResponse.json({ error: 'No customers provided' }, { status: 400 })
  }

  if (customers.length > 5000) {
    return NextResponse.json({ error: 'Max 5000 customers per import' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  let success = 0
  let failed = 0
  const errors: string[] = []

  // Process in batches of 50
  const batchSize = 50
  for (let i = 0; i < customers.length; i += batchSize) {
    const batch = customers.slice(i, i + batchSize)

    for (const row of batch) {
      try {
        const name = (row.name || '').trim()
        const phone = (row.phone_number || '').trim()
        const email = (row.email || '').trim()
        const address = (row.address || '').trim()

        if (!name && !phone) {
          failed++
          continue
        }

        // Check for existing customer by phone number
        if (phone) {
          const { data: existing } = await supabase
            .from('customer')
            .select('customer_id')
            .eq('business_id', auth.business_id)
            .eq('phone_number', phone)
            .maybeSingle()

          if (existing) {
            // Update existing customer
            const updates: Record<string, string> = {}
            if (name) updates.name = name
            if (email) updates.email = email
            if (address) updates.address_line = address

            if (Object.keys(updates).length > 0) {
              await supabase
                .from('customer')
                .update(updates)
                .eq('customer_id', existing.customer_id)
            }
            success++
            continue
          }
        }

        // Create new customer
        const customerId = 'cust_' + Math.random().toString(36).substr(2, 9)
        const { error } = await supabase
          .from('customer')
          .insert({
            customer_id: customerId,
            business_id: auth.business_id,
            name: name || 'Okänd',
            phone_number: phone || null,
            email: email || null,
            address_line: address || null,
          })

        if (error) {
          failed++
          if (errors.length < 10) errors.push(`Rad ${i + batch.indexOf(row) + 1}: ${error.message}`)
        } else {
          success++
        }
      } catch {
        failed++
      }
    }
  }

  return NextResponse.json({ success, failed, errors, total: customers.length })
}
