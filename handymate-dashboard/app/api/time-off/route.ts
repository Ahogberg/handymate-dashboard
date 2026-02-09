import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/time-off - Lista ledighetsansökningar
 * Query params: status (valfritt filter)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const status = request.nextUrl.searchParams.get('status')

    let query = supabase
      .from('time_off_request')
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .eq('business_id', businessId)
      .order('created_at', { ascending: false })

    if (status) {
      const validStatuses = ['pending', 'approved', 'rejected']
      if (!validStatuses.includes(status)) {
        return NextResponse.json(
          { error: `Ogiltig status. Giltiga: ${validStatuses.join(', ')}` },
          { status: 400 }
        )
      }
      query = query.eq('status', status)
    }

    const { data: requests, error } = await query

    if (error) throw error

    return NextResponse.json({ requests: requests || [] })

  } catch (error: any) {
    console.error('Get time off requests error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/time-off - Skapa ledighetsansökan
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()

    const { start_date, end_date, type, note } = body

    // Validate required fields
    if (!start_date || !end_date || !type) {
      return NextResponse.json(
        { error: 'start_date, end_date och type krävs' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['vacation', 'sick', 'parental', 'other']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Ogiltig typ. Giltiga typer: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate start_date <= end_date
    if (new Date(start_date) > new Date(end_date)) {
      return NextResponse.json(
        { error: 'start_date kan inte vara efter end_date' },
        { status: 400 }
      )
    }

    // Generate a TEXT id
    const id = `toff_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    const { data: timeOffRequest, error: insertError } = await supabase
      .from('time_off_request')
      .insert({
        id,
        business_id: business.business_id,
        business_user_id: currentUser.id,
        start_date,
        end_date,
        type,
        status: 'pending',
        note: note || null,
      })
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .single()

    if (insertError) throw insertError

    return NextResponse.json({ request: timeOffRequest })

  } catch (error: any) {
    console.error('Create time off request error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
