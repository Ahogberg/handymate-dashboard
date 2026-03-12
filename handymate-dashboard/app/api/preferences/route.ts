import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

export const dynamic = 'force-dynamic'

/**
 * GET /api/preferences — list all preferences
 * POST /api/preferences — upsert a preference { key, value }
 * DELETE /api/preferences — delete a preference { key }
 */

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()
    const { data, error } = await supabase
      .from('business_preferences')
      .select('*')
      .eq('business_id', business.business_id)
      .order('updated_at', { ascending: false })

    if (error) throw error
    return NextResponse.json({ preferences: data || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key, value } = await request.json()
    if (!key || !value) return NextResponse.json({ error: 'Missing key or value' }, { status: 400 })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('business_preferences')
      .upsert(
        {
          business_id: business.business_id,
          key,
          value,
          source: 'user',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'business_id,key' }
      )

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { key } = await request.json()
    if (!key) return NextResponse.json({ error: 'Missing key' }, { status: 400 })

    const supabase = getServerSupabase()
    const { error } = await supabase
      .from('business_preferences')
      .delete()
      .eq('business_id', business.business_id)
      .eq('key', key)

    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
