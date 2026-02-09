import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'

/**
 * GET /api/schedule - Lista schema-poster
 * Query params: start_date, end_date, user_ids (kommaseparerade), type
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const startDate = request.nextUrl.searchParams.get('start_date')
    const endDate = request.nextUrl.searchParams.get('end_date')
    const userIds = request.nextUrl.searchParams.get('user_ids')
    const type = request.nextUrl.searchParams.get('type')
    const projectId = request.nextUrl.searchParams.get('project_id')

    // Build schedule_entry query
    let query = supabase
      .from('schedule_entry')
      .select(`
        *,
        business_user:business_user_id (id, name, color),
        project:project_id (project_id, name)
      `)
      .eq('business_id', businessId)
      .order('start_datetime', { ascending: true })

    // Filter by date range (overlap: entry starts before range ends AND entry ends after range starts)
    if (startDate) {
      query = query.gte('end_datetime', startDate)
    }
    if (endDate) {
      query = query.lte('start_datetime', endDate)
    }

    // Filter by user IDs
    if (userIds) {
      const ids = userIds.split(',').map(id => id.trim()).filter(Boolean)
      if (ids.length > 0) {
        query = query.in('business_user_id', ids)
      }
    }

    // Filter by type
    if (type) {
      query = query.eq('type', type)
    }

    // Filter by project
    if (projectId) {
      query = query.eq('project_id', projectId)
    }

    const { data: entries, error } = await query

    if (error) throw error

    // Fetch approved time_off_requests for the date range and merge as virtual entries
    let timeOffQuery = supabase
      .from('time_off_request')
      .select(`
        *,
        business_user:business_user_id (id, name, color)
      `)
      .eq('business_id', businessId)
      .eq('status', 'approved')

    if (startDate) {
      timeOffQuery = timeOffQuery.gte('end_date', startDate)
    }
    if (endDate) {
      timeOffQuery = timeOffQuery.lte('start_date', endDate)
    }

    if (userIds) {
      const ids = userIds.split(',').map(id => id.trim()).filter(Boolean)
      if (ids.length > 0) {
        timeOffQuery = timeOffQuery.in('business_user_id', ids)
      }
    }

    const { data: timeOffRequests, error: timeOffError } = await timeOffQuery

    if (timeOffError) {
      console.error('Error fetching time off requests:', timeOffError)
    }

    // Convert time_off_requests to virtual schedule entries
    const timeOffEntries = (timeOffRequests || []).map((tor: any) => ({
      id: `time_off_${tor.id}`,
      business_id: tor.business_id,
      business_user_id: tor.business_user_id,
      project_id: null,
      title: getTimeOffTitle(tor.type),
      description: tor.note || null,
      start_datetime: `${tor.start_date}T00:00:00`,
      end_datetime: `${tor.end_date}T23:59:59`,
      all_day: true,
      type: 'time_off' as const,
      status: 'scheduled' as const,
      color: '#9ca3af',
      created_by: null,
      created_at: tor.created_at,
      updated_at: tor.created_at,
      business_user: tor.business_user,
      project: null,
      _source: 'time_off_request',
      _time_off_request_id: tor.id,
      _time_off_type: tor.type,
    }))

    // Merge and sort by start_datetime
    const allEntries = [...(entries || []), ...timeOffEntries].sort((a: any, b: any) => {
      return new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
    })

    return NextResponse.json({ entries: allEntries })

  } catch (error: any) {
    console.error('Get schedule entries error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/schedule - Skapa ny schema-post
 */
export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const currentUser = await getCurrentUser(request)
    const supabase = getServerSupabase()
    const body = await request.json()

    const {
      business_user_id,
      project_id,
      title,
      description,
      start_datetime,
      end_datetime,
      all_day,
      type,
      color,
    } = body

    // Validate required fields
    if (!business_user_id || !title || !start_datetime || !end_datetime || !type) {
      return NextResponse.json(
        { error: 'business_user_id, title, start_datetime, end_datetime och type krävs' },
        { status: 400 }
      )
    }

    // Validate type
    const validTypes = ['project', 'internal', 'time_off', 'travel']
    if (!validTypes.includes(type)) {
      return NextResponse.json(
        { error: `Ogiltig typ. Giltiga typer: ${validTypes.join(', ')}` },
        { status: 400 }
      )
    }

    // Validate that start < end
    if (new Date(start_datetime) >= new Date(end_datetime)) {
      return NextResponse.json(
        { error: 'start_datetime måste vara före end_datetime' },
        { status: 400 }
      )
    }

    // Verify business_user belongs to this business
    const { data: businessUser, error: userError } = await supabase
      .from('business_users')
      .select('id, name')
      .eq('id', business_user_id)
      .eq('business_id', business.business_id)
      .single()

    if (userError || !businessUser) {
      return NextResponse.json({ error: 'Användare hittades inte' }, { status: 404 })
    }

    // Check for scheduling conflicts (same user, overlapping times)
    const { data: conflicting, error: conflictError } = await supabase
      .from('schedule_entry')
      .select('id, title, start_datetime, end_datetime')
      .eq('business_id', business.business_id)
      .eq('business_user_id', business_user_id)
      .neq('status', 'cancelled')
      .lt('start_datetime', end_datetime)
      .gt('end_datetime', start_datetime)

    if (conflictError) {
      console.error('Conflict check error:', conflictError)
    }

    const conflicts = conflicting || []

    // Generate a TEXT id
    const id = `sch_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`

    // Insert the entry
    const { data: entry, error: insertError } = await supabase
      .from('schedule_entry')
      .insert({
        id,
        business_id: business.business_id,
        business_user_id,
        project_id: project_id || null,
        title,
        description: description || null,
        start_datetime,
        end_datetime,
        all_day: all_day ?? false,
        type,
        status: 'scheduled',
        color: color || null,
        created_by: currentUser?.id || null,
      })
      .select(`
        *,
        business_user:business_user_id (id, name, color),
        project:project_id (project_id, name)
      `)
      .single()

    if (insertError) throw insertError

    return NextResponse.json({
      entry,
      conflicts: conflicts.length > 0 ? conflicts : undefined,
    })

  } catch (error: any) {
    console.error('Create schedule entry error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * Helper: Hämta titel för ledighetstyp
 */
function getTimeOffTitle(type: string): string {
  const titles: Record<string, string> = {
    vacation: 'Semester',
    sick: 'Sjukfrånvaro',
    parental: 'Föräldraledighet',
    other: 'Ledig',
  }
  return titles[type] || 'Ledig'
}
