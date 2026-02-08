import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET - Lista milestones för ett projekt
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

    const { data: milestones, error } = await supabase
      .from('project_milestone')
      .select('*')
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .order('sort_order')

    if (error) throw error

    return NextResponse.json({ milestones: milestones || [] })

  } catch (error: any) {
    console.error('Get milestones error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST - Skapa ny milestone
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

    if (!body.name) {
      return NextResponse.json({ error: 'Name is required' }, { status: 400 })
    }

    // Get next sort_order
    const { data: existing } = await supabase
      .from('project_milestone')
      .select('sort_order')
      .eq('project_id', params.id)
      .order('sort_order', { ascending: false })
      .limit(1)

    const nextOrder = (existing?.[0]?.sort_order ?? -1) + 1

    const { data: milestone, error } = await supabase
      .from('project_milestone')
      .insert({
        business_id: business.business_id,
        project_id: params.id,
        name: body.name,
        description: body.description || null,
        budget_hours: body.budget_hours || null,
        budget_amount: body.budget_amount || null,
        due_date: body.due_date || null,
        sort_order: body.sort_order ?? nextOrder,
        status: 'pending'
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ milestone })

  } catch (error: any) {
    console.error('Create milestone error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PUT - Uppdatera milestone (status, namn, etc)
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

    if (!body.milestone_id) {
      return NextResponse.json({ error: 'Missing milestone_id' }, { status: 400 })
    }

    const updates: Record<string, any> = {}
    if (body.name !== undefined) updates.name = body.name
    if (body.description !== undefined) updates.description = body.description
    if (body.budget_hours !== undefined) updates.budget_hours = body.budget_hours
    if (body.budget_amount !== undefined) updates.budget_amount = body.budget_amount
    if (body.due_date !== undefined) updates.due_date = body.due_date
    if (body.sort_order !== undefined) updates.sort_order = body.sort_order
    if (body.status !== undefined) {
      updates.status = body.status
      if (body.status === 'completed') {
        updates.completed_at = new Date().toISOString()
      } else {
        updates.completed_at = null
      }
    }

    const { data: milestone, error } = await supabase
      .from('project_milestone')
      .update(updates)
      .eq('milestone_id', body.milestone_id)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    // Auto-update project progress
    const { data: allMilestones } = await supabase
      .from('project_milestone')
      .select('status')
      .eq('project_id', params.id)

    if (allMilestones && allMilestones.length > 0) {
      const completed = allMilestones.filter((m: any) => m.status === 'completed').length
      const progress = Math.round((completed / allMilestones.length) * 100)

      await supabase
        .from('project')
        .update({ progress_percent: progress, updated_at: new Date().toISOString() })
        .eq('project_id', params.id)
    }

    return NextResponse.json({ milestone })

  } catch (error: any) {
    console.error('Update milestone error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE - Ta bort milestone
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
    const milestoneId = request.nextUrl.searchParams.get('milestoneId')

    if (!milestoneId) {
      return NextResponse.json({ error: 'Missing milestoneId' }, { status: 400 })
    }

    // Check for linked time entries
    const { count } = await supabase
      .from('time_entry')
      .select('*', { count: 'exact', head: true })
      .eq('milestone_id', milestoneId)

    if (count && count > 0) {
      return NextResponse.json(
        { error: 'Kan inte ta bort delmoment med tidrapporter' },
        { status: 400 }
      )
    }

    const { error } = await supabase
      .from('project_milestone')
      .delete()
      .eq('milestone_id', milestoneId)
      .eq('project_id', params.id)
      .eq('business_id', business.business_id)

    if (error) throw error

    // Re-calc project progress
    const { data: remaining } = await supabase
      .from('project_milestone')
      .select('status')
      .eq('project_id', params.id)

    if (remaining && remaining.length > 0) {
      const completed = remaining.filter((m: any) => m.status === 'completed').length
      const progress = Math.round((completed / remaining.length) * 100)
      await supabase
        .from('project')
        .update({ progress_percent: progress, updated_at: new Date().toISOString() })
        .eq('project_id', params.id)
    } else {
      await supabase
        .from('project')
        .update({ progress_percent: 0, updated_at: new Date().toISOString() })
        .eq('project_id', params.id)
    }

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete milestone error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
