import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { isFortnoxConnected, getFortnoxCustomers } from '@/lib/fortnox'

/**
 * GET /api/fortnox/customers
 * Get customers from Fortnox (for preview before import)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const businessId = business.business_id

    const connected = await isFortnoxConnected(businessId)
    if (!connected) {
      return NextResponse.json({ error: 'Fortnox not connected' }, { status: 400 })
    }

    const fortnoxCustomers = await getFortnoxCustomers(businessId)

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
