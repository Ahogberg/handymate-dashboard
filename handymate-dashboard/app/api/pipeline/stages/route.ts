import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { ensureDefaultStages } from '@/lib/pipeline'

/**
 * GET - Hämta pipeline-steg för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const stages = await ensureDefaultStages(business.business_id)

    const sorted = [...stages].sort((a, b) => a.sort_order - b.sort_order)

    return NextResponse.json({ stages: sorted })
  } catch (error: any) {
    console.error('Get pipeline stages error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
