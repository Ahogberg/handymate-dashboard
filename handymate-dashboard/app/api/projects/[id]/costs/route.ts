import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/costs - Hämta projektkostnader
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
    const projectId = params.id

    // Verify project belongs to business
    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })
    }

    const { data: costs, error } = await supabase
      .from('project_cost')
      .select('*')
      .eq('project_id', projectId)
      .order('date', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ costs: costs || [] })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/costs - Lägg till projektkostnad
 * Body: { category, description, amount, date }
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
    const projectId = params.id
    const body = await request.json()

    // Verify project belongs to business
    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Projekt hittades inte' }, { status: 404 })
    }

    if (!body.category || !body.amount) {
      return NextResponse.json({ error: 'Kategori och belopp krävs' }, { status: 400 })
    }

    const validCategories = ['subcontractor', 'other']
    if (!validCategories.includes(body.category)) {
      return NextResponse.json({ error: 'Ogiltig kategori. Använd: subcontractor, other' }, { status: 400 })
    }

    const { data: cost, error } = await supabase
      .from('project_cost')
      .insert({
        business_id: business.business_id,
        project_id: projectId,
        category: body.category,
        description: body.description || null,
        amount: parseFloat(body.amount),
        date: body.date || new Date().toISOString().split('T')[0],
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ cost }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/costs - Ta bort projektkostnad
 * Query: cost_id
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const { searchParams } = new URL(request.url)
    const costId = searchParams.get('cost_id')

    if (!costId) {
      return NextResponse.json({ error: 'Saknar cost_id' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_cost')
      .delete()
      .eq('id', costId)
      .eq('business_id', business.business_id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
