import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/schedule/availability - Kolla tillgänglighet för användare
 * Query params: user_ids (kommaseparerade), start, end
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const userIdsParam = request.nextUrl.searchParams.get('user_ids')
    const start = request.nextUrl.searchParams.get('start')
    const end = request.nextUrl.searchParams.get('end')

    if (!userIdsParam || !start || !end) {
      return NextResponse.json(
        { error: 'user_ids, start och end krävs' },
        { status: 400 }
      )
    }

    const userIds = userIdsParam.split(',').map(id => id.trim()).filter(Boolean)

    if (userIds.length === 0) {
      return NextResponse.json(
        { error: 'Minst en user_id krävs' },
        { status: 400 }
      )
    }

    // Fetch business users
    const { data: businessUsers, error: usersError } = await supabase
      .from('business_users')
      .select('id, name, color')
      .eq('business_id', businessId)
      .in('id', userIds)

    if (usersError) throw usersError

    // Fetch schedule entries for all requested users in the date range
    const { data: entries, error: entriesError } = await supabase
      .from('schedule_entry')
      .select(`
        *,
        project:project_id (project_id, name)
      `)
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .neq('status', 'cancelled')
      .lt('start_datetime', end)
      .gt('end_datetime', start)
      .order('start_datetime', { ascending: true })

    if (entriesError) throw entriesError

    // Also fetch approved time off for the range
    const { data: timeOffRequests, error: timeOffError } = await supabase
      .from('time_off_request')
      .select('*')
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .eq('status', 'approved')
      .lte('start_date', end)
      .gte('end_date', start)

    if (timeOffError) {
      console.error('Error fetching time off for availability:', timeOffError)
    }

    // Build per-user availability
    const users = (businessUsers || []).map((user: any) => {
      // Get this user's schedule entries
      const userEntries = (entries || []).filter(
        (e: any) => e.business_user_id === user.id
      )

      // Get this user's time off
      const userTimeOff = (timeOffRequests || []).filter(
        (t: any) => t.business_user_id === user.id
      )

      // Convert time off to virtual entries
      const timeOffEntries = userTimeOff.map((tor: any) => ({
        id: `time_off_${tor.id}`,
        business_user_id: tor.business_user_id,
        title: getTimeOffTitle(tor.type),
        start_datetime: `${tor.start_date}T00:00:00`,
        end_datetime: `${tor.end_date}T23:59:59`,
        all_day: true,
        type: 'time_off',
        status: 'scheduled',
        _time_off_type: tor.type,
      }))

      // Combine all entries
      const allEntries = [...userEntries, ...timeOffEntries].sort(
        (a: any, b: any) =>
          new Date(a.start_datetime).getTime() - new Date(b.start_datetime).getTime()
      )

      // Calculate total scheduled hours (excluding cancelled and time_off)
      const totalHours = userEntries.reduce((sum: number, entry: any) => {
        const startMs = new Date(entry.start_datetime).getTime()
        const endMs = new Date(entry.end_datetime).getTime()
        const hours = (endMs - startMs) / (1000 * 60 * 60)
        return sum + hours
      }, 0)

      return {
        id: user.id,
        name: user.name,
        color: user.color,
        entries: allEntries,
        totalHours: Math.round(totalHours * 100) / 100,
      }
    })

    return NextResponse.json({ users })

  } catch (error: any) {
    console.error('Get availability error:', error)
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
