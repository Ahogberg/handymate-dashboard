import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'

interface CheckinResponseRow {
  id: string
  project_id: string | null
  project_name: string | null
  customer_name: string | null
  checked_in_at: string
  checked_out_at: string | null
  duration_minutes: number
  status: 'active' | 'completed' | 'approved' | 'rejected'
  note: string | null
}

interface SummaryResponse {
  total_minutes: number
  billable_minutes: number
  completed_count: number
  active_count: number
}

/**
 * GET /api/time-checkins
 * Mobile Tid-Idag "Dagens poster"-vy. Returnerar tid-incheckningar för en
 * användare, antingen för en specifik dag eller en hel vecka.
 *
 * Query-params:
 * - date: YYYY-MM-DD (default = idag, ignoreras om week_start satt)
 * - week_start: YYYY-MM-DD — om satt returneras week_start..week_start+7d
 * - user_id: auth-UUID — default current user. Annan användare kräver
 *   see_all_projects-permission.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const dateParam = url.searchParams.get('date')
  const weekStartParam = url.searchParams.get('week_start')
  const requestedUserId = url.searchParams.get('user_id') || business.user_id

  // Permission-check: läsning av annan användares data kräver see_all_projects.
  if (requestedUserId !== business.user_id) {
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_all_projects')) {
      return NextResponse.json(
        { error: 'Forbidden — kräver see_all_projects-permission för att läsa annan användares tid' },
        { status: 403 },
      )
    }
  }

  // Beräkna fönster (UTC). week_start har företräde över date.
  let rangeStart: Date
  let rangeEnd: Date

  if (weekStartParam) {
    const ws = parseDate(weekStartParam)
    if (!ws) {
      return NextResponse.json({ error: 'Ogiltigt week_start (YYYY-MM-DD)' }, { status: 400 })
    }
    rangeStart = ws
    rangeEnd = new Date(ws.getTime() + 7 * 24 * 60 * 60 * 1000)
  } else {
    const day = dateParam ? parseDate(dateParam) : startOfTodayUtc()
    if (!day) {
      return NextResponse.json({ error: 'Ogiltigt date (YYYY-MM-DD)' }, { status: 400 })
    }
    rangeStart = day
    rangeEnd = new Date(day.getTime() + 24 * 60 * 60 * 1000)
  }

  const supabase = getServerSupabase()

  const { data: rows, error } = await supabase
    .from('time_checkins')
    .select('id, project_id, checked_in_at, checked_out_at, duration_minutes, status, note')
    .eq('business_id', business.business_id)
    .eq('user_id', requestedUserId)
    .gte('checked_in_at', rangeStart.toISOString())
    .lt('checked_in_at', rangeEnd.toISOString())
    .order('checked_in_at', { ascending: false })

  if (error) {
    console.error('[time-checkins] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Bulk-resolva project + customer för alla project_ids som faktiskt
  // förekommer i resultatet. Färre rundresor än per-row-fetch.
  const projectIds = Array.from(
    new Set((rows || []).map((r) => r.project_id).filter((id): id is string => !!id)),
  )

  const projectMap = new Map<string, { name: string | null; customer_name: string | null }>()
  if (projectIds.length > 0) {
    const { data: projects } = await supabase
      .from('project')
      .select('project_id, name, customer_id')
      .eq('business_id', business.business_id)
      .in('project_id', projectIds)

    const customerIds = Array.from(
      new Set((projects || []).map((p) => p.customer_id).filter((id): id is string => !!id)),
    )

    const customerMap = new Map<string, string | null>()
    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name')
        .eq('business_id', business.business_id)
        .in('customer_id', customerIds)

      for (const c of customers || []) {
        customerMap.set(c.customer_id, c.name || null)
      }
    }

    for (const p of projects || []) {
      projectMap.set(p.project_id, {
        name: p.name || null,
        customer_name: p.customer_id ? customerMap.get(p.customer_id) || null : null,
      })
    }
  }

  const checkins: CheckinResponseRow[] = (rows || []).map((r) => {
    const projectInfo = r.project_id ? projectMap.get(r.project_id) : null
    return {
      id: r.id,
      project_id: r.project_id || null,
      project_name: projectInfo?.name || null,
      customer_name: projectInfo?.customer_name || null,
      checked_in_at: r.checked_in_at,
      checked_out_at: r.checked_out_at || null,
      duration_minutes: r.duration_minutes || 0,
      status: (r.status || 'active') as CheckinResponseRow['status'],
      note: r.note || null,
    }
  })

  // Billable = completed + approved. Active saknar slut-tid (duration ofta 0/null);
  // rejected räknas inte. Schema har ingen explicit billable-flagga.
  const summary: SummaryResponse = {
    total_minutes: checkins.reduce((sum, c) => sum + c.duration_minutes, 0),
    billable_minutes: checkins
      .filter((c) => c.status === 'completed' || c.status === 'approved')
      .reduce((sum, c) => sum + c.duration_minutes, 0),
    completed_count: checkins.filter((c) => c.status === 'completed').length,
    active_count: checkins.filter((c) => c.status === 'active').length,
  }

  return NextResponse.json({ checkins, summary })
}

function parseDate(input: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!match) return null
  const [, y, m, d] = match
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)))
  if (isNaN(date.getTime())) return null
  return date
}

function startOfTodayUtc(): Date {
  const now = new Date()
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}
