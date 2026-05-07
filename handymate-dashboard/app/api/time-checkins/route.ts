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
 * - date: YYYY-MM-DD (default = idag i tz, ignoreras om week_start satt)
 * - week_start: YYYY-MM-DD — om satt returneras week_start..week_start+7d
 * - user_id: auth-UUID — default current user. Annan användare kräver
 *   see_all_projects-permission.
 * - tz: IANA-tidszon, default 'Europe/Stockholm'. Avgör vad ett "dygn"
 *   är — DST-säkert via Intl.DateTimeFormat.
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
  const tz = url.searchParams.get('tz') || 'Europe/Stockholm'

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

  // Beräkna fönster — 00:00 lokal tid i tz, konverterat till UTC. För
  // week läggs 7 lokala dagar på (inte 7×24h UTC, så DST-skift inom
  // veckan inte ger ett 23/25h-fönster).
  let rangeStart: Date
  let rangeEnd: Date

  if (weekStartParam) {
    if (!isValidYmd(weekStartParam)) {
      return NextResponse.json({ error: 'Ogiltigt week_start (YYYY-MM-DD)' }, { status: 400 })
    }
    rangeStart = zonedMidnightToUtc(weekStartParam, tz)
    rangeEnd = zonedMidnightToUtc(addDaysToYmd(weekStartParam, 7), tz)
  } else {
    const ymd = dateParam || todayInTz(tz)
    if (!isValidYmd(ymd)) {
      return NextResponse.json({ error: 'Ogiltigt date (YYYY-MM-DD)' }, { status: 400 })
    }
    rangeStart = zonedMidnightToUtc(ymd, tz)
    rangeEnd = zonedMidnightToUtc(addDaysToYmd(ymd, 1), tz)
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

function isValidYmd(input: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input)
  if (!m) return false
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d)))
  return (
    !isNaN(date.getTime()) &&
    date.getUTCFullYear() === Number(y) &&
    date.getUTCMonth() === Number(mo) - 1 &&
    date.getUTCDate() === Number(d)
  )
}

function todayInTz(tz: string): string {
  // en-CA formatterar som YYYY-MM-DD och är stabilt över Node-versioner.
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function addDaysToYmd(ymd: string, days: number): string {
  const [y, mo, d] = ymd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, mo - 1, d + days))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

/**
 * Konverterar 00:00 lokal tid på en kalenderdag (YYYY-MM-DD i tz) till
 * motsvarande UTC-instans. Använder Intl.DateTimeFormat för att läsa av
 * TZ-offset i två varv — om DST-transition ligger mellan kandidaten och
 * justerad tid korrigeras offseten i andra varvet.
 */
function zonedMidnightToUtc(ymd: string, tz: string): Date {
  const [y, mo, d] = ymd.split('-').map(Number)
  const naiveUtc = new Date(Date.UTC(y, mo - 1, d, 0, 0, 0))
  const offset1 = getTzOffsetMinutes(naiveUtc, tz)
  const adjusted = new Date(naiveUtc.getTime() - offset1 * 60_000)
  const offset2 = getTzOffsetMinutes(adjusted, tz)
  if (offset2 !== offset1) {
    return new Date(naiveUtc.getTime() - offset2 * 60_000)
  }
  return adjusted
}

function getTzOffsetMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(at)
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value)
  let h = get('hour')
  if (h === 24) h = 0
  const asUtc = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    h,
    get('minute'),
    get('second'),
  )
  return (asUtc - at.getTime()) / 60_000
}
