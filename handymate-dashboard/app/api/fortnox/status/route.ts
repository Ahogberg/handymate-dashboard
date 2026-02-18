import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getFortnoxConfig } from '@/lib/fortnox'

/**
 * GET /api/fortnox/status
 * Get Fortnox connection status
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Fortnox config
    const config = await getFortnoxConfig(business.business_id)

    const connected = !!(config?.fortnox_access_token && config?.fortnox_connected_at)

    return NextResponse.json({
      connected,
      companyName: config?.fortnox_company_name || null,
      connectedAt: config?.fortnox_connected_at || null,
      expiresAt: config?.fortnox_token_expires_at || null
    })

  } catch (error: unknown) {
    console.error('Fortnox status error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to get status'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
