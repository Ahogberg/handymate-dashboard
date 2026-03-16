import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET — Lista lead-källor (leverantörsportaler) för företaget
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Hämta alla lead-källor
    const { data: sources, error } = await supabase
      .from('lead_sources')
      .select('*')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    // Hämta lead-statistik per källa
    const sourceIds = (sources || []).map((s: { id: string }) => s.id)
    let leadStats: Record<string, { total: number; won: number }> = {}

    if (sourceIds.length > 0) {
      const { data: leads } = await supabase
        .from('leads')
        .select('lead_source_id, status')
        .in('lead_source_id', sourceIds)

      for (const lead of leads || []) {
        if (!lead.lead_source_id) continue
        if (!leadStats[lead.lead_source_id]) {
          leadStats[lead.lead_source_id] = { total: 0, won: 0 }
        }
        leadStats[lead.lead_source_id].total++
        if (lead.status === 'won') leadStats[lead.lead_source_id].won++
      }
    }

    const sourcesWithStats = (sources || []).map((s: { id: string; [key: string]: unknown }) => ({
      ...s,
      lead_count: leadStats[s.id]?.total || 0,
      won_count: leadStats[s.id]?.won || 0,
    }))

    return NextResponse.json({ sources: sourcesWithStats })
  } catch (error: any) {
    console.error('Get lead sources error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST — Skapa ny lead-källa
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { name, notes } = await request.json()

    if (!name) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400 })
    }

    const { data: source, error } = await supabase
      .from('lead_sources')
      .insert({
        business_id: business.business_id,
        name,
        notes: notes || null,
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
 * PUT — Uppdatera lead-källa
 */
export async function PUT(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { id, name, notes, is_active } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'ID krävs' }, { status: 400 })
    }

    const updates: Record<string, unknown> = {}
    if (name !== undefined) updates.name = name
    if (notes !== undefined) updates.notes = notes
    if (is_active !== undefined) updates.is_active = is_active

    const { data: source, error } = await supabase
      .from('lead_sources')
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
 * DELETE — Ta bort lead-källa
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
      .from('lead_sources')
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
