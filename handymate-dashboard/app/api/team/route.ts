import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission, AuthError } from '@/lib/permissions'

/**
 * GET /api/team - Lista teammedlemmar
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    const { data: members, error } = await supabase
      .from('business_users')
      .select('id, business_id, user_id, role, name, email, phone, title, hourly_cost, hourly_rate, color, avatar_url, is_active, can_see_all_projects, can_see_financials, can_manage_users, can_approve_time, can_create_invoices, invite_token, invite_expires_at, invited_at, accepted_at, last_login_at, created_at')
      .eq('business_id', business.business_id)
      .order('role')
      .order('name')

    if (error) throw error

    return NextResponse.json({ members: members || [] })

  } catch (error: any) {
    console.error('Get team error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/team - Uppdatera teammedlem
 */
export async function PATCH(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()
    const body = await request.json()
    const { id } = body

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Hämta target user
    const { data: target } = await supabase
      .from('business_users')
      .select('*')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Behörighetscheck: manage_users ELLER redigerar sig själv
    const isSelf = currentUser?.id === id
    if (!isSelf && (!currentUser || !hasPermission(currentUser, 'manage_users'))) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    // Kan inte ändra owner's roll
    if (target.role === 'owner' && body.role && body.role !== 'owner') {
      return NextResponse.json({ error: 'Kan inte ändra ägarens roll' }, { status: 400 })
    }

    // Kan inte ge högre roll än sin egen
    const roleHierarchy: Record<string, number> = { owner: 3, admin: 2, employee: 1 }
    if (body.role && currentUser) {
      const myLevel = roleHierarchy[currentUser.role] || 0
      const targetLevel = roleHierarchy[body.role] || 0
      if (targetLevel > myLevel) {
        return NextResponse.json({ error: 'Kan inte ge högre roll än din egen' }, { status: 400 })
      }
    }

    const updates: Record<string, any> = {}

    // Fält som alla kan redigera på sig själva
    if (body.name !== undefined) updates.name = body.name
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url

    // Fält som kräver manage_users
    if (currentUser && hasPermission(currentUser, 'manage_users')) {
      if (body.role !== undefined) updates.role = body.role
      if (body.title !== undefined) updates.title = body.title
      if (body.hourly_cost !== undefined) updates.hourly_cost = body.hourly_cost
      if (body.hourly_rate !== undefined) updates.hourly_rate = body.hourly_rate
      if (body.color !== undefined) updates.color = body.color
      if (body.is_active !== undefined) updates.is_active = body.is_active
      if (body.can_see_all_projects !== undefined) updates.can_see_all_projects = body.can_see_all_projects
      if (body.can_see_financials !== undefined) updates.can_see_financials = body.can_see_financials
      if (body.can_manage_users !== undefined) updates.can_manage_users = body.can_manage_users
      if (body.can_approve_time !== undefined) updates.can_approve_time = body.can_approve_time
      if (body.can_create_invoices !== undefined) updates.can_create_invoices = body.can_create_invoices
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: member, error } = await supabase
      .from('business_users')
      .update(updates)
      .eq('id', id)
      .eq('business_id', business.business_id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ member })

  } catch (error: any) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    console.error('Update team member error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * DELETE /api/team - Inaktivera teammedlem (soft delete)
 */
export async function DELETE(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'manage_users')) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const id = request.nextUrl.searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    }

    // Hämta target
    const { data: target } = await supabase
      .from('business_users')
      .select('role')
      .eq('id', id)
      .eq('business_id', business.business_id)
      .single()

    if (!target) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // Kan inte ta bort owner
    if (target.role === 'owner') {
      return NextResponse.json({ error: 'Kan inte ta bort ägaren' }, { status: 400 })
    }

    // Kan inte ta bort sig själv
    if (currentUser.id === id) {
      return NextResponse.json({ error: 'Kan inte ta bort dig själv' }, { status: 400 })
    }

    // Soft delete
    const { error } = await supabase
      .from('business_users')
      .update({ is_active: false })
      .eq('id', id)
      .eq('business_id', business.business_id)

    if (error) throw error

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Delete team member error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
