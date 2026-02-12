import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Get system rules + business-specific rules
    const { data, error } = await supabase
      .from('communication_rule')
      .select('*')
      .or(`business_id.is.null,business_id.eq.${business.business_id}`)
      .order('sort_order')

    if (error) throw error

    return NextResponse.json(data || [])
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('communication_rule')
      .insert({
        business_id: business.business_id,
        name: body.name,
        description: body.description || null,
        trigger_type: body.trigger_type || 'manual',
        trigger_config: body.trigger_config || {},
        message_template: body.message_template,
        channel: body.channel || 'sms',
        is_enabled: true,
        is_system: false,
        sort_order: body.sort_order || 99,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json(data)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
