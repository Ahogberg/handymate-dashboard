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

/**
 * GET /api/fortnox/customers
 * Get customers from Fortnox (for preview before import)
 */
export async function GET(request: NextRequest) {
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

    // Return simplified list
    const customers = fortnoxCustomers.map(c => ({
      customerNumber: c.CustomerNumber,
      name: c.Name,
      email: c.Email || null,
      phone: c.Phone1 || null,
      city: c.City || null
    }))

    return NextResponse.json({
      customers,
      total: customers.length
    })

  } catch (error: unknown) {
    console.error('Get Fortnox customers error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get customers'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
