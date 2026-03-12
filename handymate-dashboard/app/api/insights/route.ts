import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/insights — list insights for the business
 * POST /api/insights — submit feedback (thumbs up/down)
 */

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('business_insights')
      .select('*')
      .eq('business_id', business.business_id)
      .gt('expires_at', new Date().toISOString())
      .order('priority', { ascending: false })
      .order('generated_at', { ascending: false })
      .limit(10)

    if (error) throw error

    return NextResponse.json({ insights: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id, feedback } = await request.json()
    if (!id || !['helpful', 'not_helpful'].includes(feedback)) {
      return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { error } = await supabase
      .from('business_insights')
      .update({ feedback })
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
