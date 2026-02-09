import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, AuthError } from '@/lib/permissions'

/**
 * GET /api/projects/[id]/team - Lista tilldelade användare på projekt
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

    // Verifiera att projektet tillhör businessn
    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Hämta tilldelningar med användarinfo
    const { data: assignments, error } = await supabase
      .from('project_assignment')
      .select(`
        id, project_id, business_user_id, role, assigned_at, assigned_by,
        business_user:business_user_id (id, name, email, role, title, color, avatar_url, is_active)
      `)
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ assignments: assignments || [] })

  } catch (error: any) {
    console.error('Get project team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/projects/[id]/team - Tilldela användare till projekt
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

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_all_projects')) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id
    const body = await request.json()

    const { businessUserId, role } = body

    if (!businessUserId) {
      return NextResponse.json({ error: 'businessUserId krävs' }, { status: 400 })
    }

    // Verifiera att projektet tillhör businessn
    const { data: project } = await supabase
      .from('project')
      .select('project_id')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Verifiera att användaren tillhör businessn
    const { data: targetUser } = await supabase
      .from('business_users')
      .select('id, name')
      .eq('id', businessUserId)
      .eq('business_id', business.business_id)
      .eq('is_active', true)
      .single()

    if (!targetUser) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Kolla om redan tilldelad
    const { data: existing } = await supabase
      .from('project_assignment')
      .select('id')
      .eq('project_id', projectId)
      .eq('business_user_id', businessUserId)
      .single()

    if (existing) {
      return NextResponse.json({ error: 'Användaren är redan tilldelad detta projekt' }, { status: 400 })
    }

    // Skapa tilldelning
    const { data: assignment, error } = await supabase
      .from('project_assignment')
      .insert({
        business_id: business.business_id,
        project_id: projectId,
        business_user_id: businessUserId,
        role: role || 'member',
        assigned_by: currentUser.id
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ assignment })

  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Assign project team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/projects/[id]/team - Ta bort tilldelning
 * Query param: userId (business_user_id)
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

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_all_projects')) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id
    const userId = request.nextUrl.searchParams.get('userId')

    if (!userId) {
      return NextResponse.json({ error: 'userId krävs som query parameter' }, { status: 400 })
    }

    const { error } = await supabase
      .from('project_assignment')
      .delete()
      .eq('project_id', projectId)
      .eq('business_user_id', userId)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Remove project team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
