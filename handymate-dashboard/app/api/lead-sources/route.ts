import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET - Lista lead-källor för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { data: sources, error } = await supabase
      .from('lead_source')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ sources: sources || [] })
  } catch (error: any) {
    console.error('Get lead sources error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny lead-källa
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { platform, name, config } = await request.json()

    if (!platform || !name) {
      return NextResponse.json({ error: 'Platform och namn krävs' }, { status: 400 })
    }

    // Generate unique inbound email for email-based sources
    const randomId = Math.random().toString(36).substring(2, 8)
    const inboundEmail = `leads+${business.business_id.substring(0, 6)}-${platform}-${randomId}@inbound.handymate.se`

    const { data: source, error } = await supabase
      .from('lead_source')
      .insert({
        business_id: business.business_id,
        platform,
        name,
        config: config || {},
        inbound_email: inboundEmail,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ source })
  } catch (error: any) {
    console.error('Create lead source error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera lead-källa
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { id, name, is_active, config } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const updates: any = {}
    if (name !== undefined) updates.name = name
    if (is_active !== undefined) updates.is_active = is_active
    if (config !== undefined) updates.config = config

    const { data: source, error } = await supabase
      .from('lead_source')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ source })
  } catch (error: any) {
    console.error('Update lead source error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort lead-källa
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const { error } = await supabase
      .from('lead_source')
      .delete()
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Delete lead source error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
