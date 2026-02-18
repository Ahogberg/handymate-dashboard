import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Hämta företagsinställningar
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: config, error } = await supabase
      .from('business_config')
      .select('*')
      .eq('business_id', business.business_id)
      .single()

    if (error) throw error

    return NextResponse.json({ config })
  } catch (error: any) {
    console.error('Get settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera företagsinställningar
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    // Only allow updating specific fields
    const allowedFields = [
      'business_name', 'display_name', 'contact_name', 'contact_email',
      'phone_number', 'branch', 'service_area', 'working_hours',
      'call_mode', 'forward_phone_number', 'call_recording_enabled',
      'pricing_settings', 'knowledge_base', 'accent_color',
      'default_quote_terms', 'logo_url'
    ]

    const updates: Record<string, any> = {}
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates[field] = body[field]
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    const { data: config, error } = await supabase
      .from('business_config')
      .update(updates)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ config })
  } catch (error: any) {
    console.error('Update settings error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
