import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const { data, error } = await supabase
    .from('monthly_reviews')
    .select('id, month, data, analysis, recommendations, sent_at, viewed_at, created_at')
    .eq('business_id', business.business_id)
    .order('month', { ascending: false })
    .limit(12)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ reviews: data || [] })
}

export async function PATCH(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await request.json().catch(() => ({}))
  if (!body.id) {
    return NextResponse.json({ error: 'Saknar id' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const { error } = await supabase
    .from('monthly_reviews')
    .update({ viewed_at: new Date().toISOString() })
    .eq('id', body.id)
    .eq('business_id', business.business_id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
