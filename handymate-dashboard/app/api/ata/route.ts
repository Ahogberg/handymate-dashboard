import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { randomUUID } from 'crypto'

/**
 * GET /api/ata?projectId=xxx — Lista ÄTA för ett projekt
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = request.nextUrl.searchParams.get('projectId')

    if (!projectId) {
      return NextResponse.json({ error: 'projectId krävs' }, { status: 400 })
    }

    const { data, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .order('ata_number', { ascending: true })

    if (error) throw error

    return NextResponse.json({ atas: data || [] })
  } catch (error: any) {
    console.error('GET /api/ata error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/ata — Skapa ny ÄTA
 * Body: { projectId, changeType, description, items, notes, customerId }
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { projectId, changeType, description, items, notes, customerId } = body

    if (!projectId || !description || !changeType) {
      return NextResponse.json({ error: 'projectId, description och changeType krävs' }, { status: 400 })
    }

    // Calculate total from items if provided
    const parsedItems = Array.isArray(items) ? items : []
    const total = parsedItems.reduce((sum: number, item: any) => {
      return sum + ((item.quantity || 0) * (item.unit_price || 0))
    }, 0)

    // Also calculate legacy amount field for backwards compat
    const amount = changeType === 'removal' ? -Math.abs(total) : Math.abs(total)

    const signToken = randomUUID()

    const { data, error } = await supabase
      .from('project_change')
      .insert({
        business_id: business.business_id,
        project_id: projectId,
        change_type: changeType,
        description,
        items: parsedItems,
        total,
        amount: Math.abs(total),
        hours: body.hours || 0,
        status: 'draft',
        sign_token: signToken,
        notes: notes || null,
        customer_id: customerId || null,
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ ata: data })
  } catch (error: any) {
    console.error('POST /api/ata error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
