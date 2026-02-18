import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { clearFortnoxConnection } from '@/lib/fortnox'

/**
 * POST /api/fortnox/disconnect
 * Disconnect Fortnox integration
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    await clearFortnoxConnection(business.business_id)

    return NextResponse.json({
      success: true,
      message: 'Fortnox disconnected successfully'
    })

  } catch (error: unknown) {
    console.error('Fortnox disconnect error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to disconnect'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}
