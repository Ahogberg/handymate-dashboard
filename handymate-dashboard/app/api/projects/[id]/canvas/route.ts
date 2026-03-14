import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/projects/[id]/canvas — Hämta canvas-data
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('project_canvas')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (error && error.code !== 'PGRST116') throw error

    // Return empty canvas if none exists
    if (!data) {
      return NextResponse.json({
        canvas: {
          project_id: params.id,
          canvas_data: { objects: [], background: '#ffffff' },
        },
      })
    }

    return NextResponse.json({ canvas: data })
  } catch (error: any) {
    console.error('GET canvas error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT /api/projects/[id]/canvas — Spara canvas-data (upsert)
 */
export async function PUT(
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

    if (!body.canvas_data) {
      return NextResponse.json({ error: 'canvas_data krävs' }, { status: 400 })
    }

    // Upsert — create or update
    const { data: existing } = await supabase
      .from('project_canvas')
      .select('id')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    let data
    if (existing) {
      const { data: updated, error } = await supabase
        .from('project_canvas')
        .update({
          canvas_data: body.canvas_data,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existing.id)
        .select()
        .single()
      if (error) throw error
      data = updated
    } else {
      const { data: created, error } = await supabase
        .from('project_canvas')
        .insert({
          business_id: business.business_id,
          project_id: params.id,
          canvas_data: body.canvas_data,
        })
        .select()
        .single()
      if (error) throw error
      data = created
    }

    return NextResponse.json({ canvas: data })
  } catch (error: any) {
    console.error('PUT canvas error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
