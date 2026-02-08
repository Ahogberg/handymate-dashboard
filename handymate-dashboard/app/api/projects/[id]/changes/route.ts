import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista ÄTA för ett projekt
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

    const { data: changes, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })

    if (error) throw error

    return NextResponse.json({ changes: changes || [] })

  } catch (error: any) {
    console.error('Get changes error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny ÄTA
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

    if (!body.description || !body.change_type) {
      return NextResponse.json({ error: 'Description and change_type required' }, { status: 400 })
    }

    const { data: change, error } = await supabase
      .from('project_change')
      .insert({
        business_id: business.business_id,
        project_id: params.id,
        change_type: body.change_type,
        description: body.description,
        amount: body.amount || 0,
        hours: body.hours || 0,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ change })

  } catch (error: any) {
    console.error('Create change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera ÄTA (godkänn/avslå)
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

    if (!body.change_id) {
      return NextResponse.json({ error: 'Missing change_id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}

    if (body.description !== undefined) updates.description = body.description
    if (body.amount !== undefined) updates.amount = body.amount
    if (body.hours !== undefined) updates.hours = body.hours
    if (body.change_type !== undefined) updates.change_type = body.change_type

    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'approved') {
        updates.approved_at = new Date().toISOString()
      } else {
        updates.approved_at = null
      }
    }

    const { data: change, error } = await supabase
      .from('project_change')
      .update(updates)
      .eq('change_id', body.change_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // If approved/rejected, update project budget with all approved changes
    if (body.status === 'approved' || body.status === 'rejected') {
      const { data: project } = await supabase
        .from('project')
        .select('budget_amount, budget_hours')
        .eq('project_id', params.id)
        .single()

      if (project) {
        await supabase
          .from('project')
          .update({ updated_at: new Date().toISOString() })
          .eq('project_id', params.id)
      }
    }

    return NextResponse.json({ change })

  } catch (error: any) {
    console.error('Update change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort ÄTA (bara pending)
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
    const changeId = request.nextUrl.searchParams.get('changeId')

    if (!changeId) {
      return NextResponse.json({ error: 'Missing changeId' }, { status: 400 })
    }

    // Only allow deleting pending changes
    const { data: existing } = await supabase
      .from('project_change')
      .select('status')
      .eq('change_id', changeId)
      .single()

    if (existing?.status !== 'pending') {
      return NextResponse.json(
        { error: 'Kan bara ta bort väntande ÄTA' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('project_change')
      .delete()
      .eq('change_id', changeId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete change error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
