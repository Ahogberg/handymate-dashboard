import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { undoActivity } from '@/lib/pipeline'

/**
 * POST - Ångra en pipeline-aktivitet
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id } = params

    // Verify activity belongs to business
    const supabase = getServerSupabase()
    const { data: activity } = await supabase
      .from('pipeline_activity')
      .select('id, business_id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!activity) {
      return NextResponse.json({ error: 'Activity not found' }, { status: 404 })
    }

    await undoActivity(id, business.user_id)

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Undo activity error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
