import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/me - Hämta min profil med business-info
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()

    // Hämta business-info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_id, business_name, contact_email')
      .eq('business_id', currentUser.business_id)
      .single()

    return NextResponse.json({
      user: currentUser,
      business: business || null
    })

  } catch (error: any) {
    console.error('Get me error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * PATCH /api/me - Uppdatera min profil
 */
export async function PATCH(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const updates: Record<string, any> = {}

    // Fält användaren kan uppdatera själv
    if (body.name !== undefined) updates.name = body.name
    if (body.phone !== undefined) updates.phone = body.phone
    if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 })
    }

    const { data: user, error } = await supabase
      .from('business_users')
      .update(updates)
      .eq('id', currentUser.id)
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ user })

  } catch (error: any) {
    console.error('Update me error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
