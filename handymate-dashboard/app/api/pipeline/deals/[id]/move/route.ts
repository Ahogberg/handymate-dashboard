import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { moveDeal } from '@/lib/pipeline'

/**
 * POST - Flytta deal till nytt steg
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

    const supabase = getServerSupabase()
    const body = await request.json()
    const { toStageSlug } = body
    const { id } = params

    if (!toStageSlug) {
      return NextResponse.json({ error: 'toStageSlug is required' }, { status: 400 })
    }

    // Verify deal belongs to business
    const { data: existing } = await supabase
      .from('deal')
      .select('id')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!existing) {
      return NextResponse.json({ error: 'Deal not found' }, { status: 404 })
    }

    await moveDeal({
      dealId: id,
      businessId: business.business_id,
      toStageSlug,
      triggeredBy: 'user',
    })

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Move deal error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
