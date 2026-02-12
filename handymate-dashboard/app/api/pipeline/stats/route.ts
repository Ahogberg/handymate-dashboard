import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { getPipelineStats } from '@/lib/pipeline'

/**
 * GET - Hämta pipeline-statistik
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stats = await getPipelineStats(business.business_id)

    return NextResponse.json(stats)
  } catch (error: any) {
    console.error('Get pipeline stats error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
