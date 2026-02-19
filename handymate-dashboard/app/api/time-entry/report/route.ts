import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { calculateWeeklyOvertime, formatMinutes } from '@/lib/overtime'

/**
 * GET /api/time-entry/report - Generera tidsrapport
 * Query: startDate, endDate, format (json|csv), groupBy (day|week|customer|project)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const startDate = request.nextUrl.searchParams.get('startDate')
    const endDate = request.nextUrl.searchParams.get('endDate')
    const exportFormat = request.nextUrl.searchParams.get('format') || 'json'
    const groupBy = request.nextUrl.searchParams.get('groupBy') || 'day'

    if (!startDate || !endDate) {
      return NextResponse.json({ error: 'startDate och endDate krävs' }, { status: 400 })
    }

    const { data: entries, error } = await supabase
      .from('time_entry')
      .select(`
        *,
        customer:customer_id (customer_id, name),
        work_type:work_type_id (work_type_id, name),
        business_user:business_user_id (id, name)
      `)
      .eq('business_id', business.business_id)
      .gte('work_date', startDate)
      .lte('work_date', endDate)
      .order('work_date', { ascending: true })

    if (error) throw error

    const rows = entries || []

    // Beräkna övertid
    const overtimeResult = calculateWeeklyOvertime(rows.map((e: any) => ({
      work_date: e.work_date,
      duration_minutes: e.duration_minutes,
      break_minutes: e.break_minutes,
    })))

    // Gruppera data
    type GroupedRow = {
      key: string
      label: string
      total_minutes: number
      break_minutes: number
      billable_minutes: number
      entries_count: number
      revenue: number
    }

    const groups = new Map<string, GroupedRow>()

    for (const entry of rows as any[]) {
      let key: string
      let label: string

      switch (groupBy) {
        case 'customer':
          key = entry.customer_id || 'no-customer'
          label = entry.customer?.name || 'Ingen kund'
          break
        case 'project':
          key = entry.project_id || 'no-project'
          label = entry.project_id || 'Inget projekt'
          break
        case 'week':
          const d = new Date(entry.work_date)
          const weekNum = getISOWeek(d)
          key = `${d.getFullYear()}-W${weekNum}`
          label = `Vecka ${weekNum}, ${d.getFullYear()}`
          break
        default: // day
          key = entry.work_date
          label = entry.work_date
          break
      }

      const existing = groups.get(key) || {
        key,
        label,
        total_minutes: 0,
        break_minutes: 0,
        billable_minutes: 0,
        entries_count: 0,
        revenue: 0,
      }

      existing.total_minutes += entry.duration_minutes || 0
      existing.break_minutes += entry.break_minutes || 0
      existing.billable_minutes += entry.is_billable ? (entry.duration_minutes || 0) : 0
      existing.entries_count += 1
      existing.revenue += (entry.duration_minutes || 0) / 60 * (entry.hourly_rate || 0)
      groups.set(key, existing)
    }

    const groupedData = Array.from(groups.values())

    // Summary
    const summary = {
      period: `${startDate} – ${endDate}`,
      total_entries: rows.length,
      total_minutes: rows.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      total_break_minutes: rows.reduce((s: number, e: any) => s + (e.break_minutes || 0), 0),
      billable_minutes: rows.filter((e: any) => e.is_billable).reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0),
      total_revenue: Math.round(rows.reduce((s: number, e: any) => s + ((e.duration_minutes || 0) / 60 * (e.hourly_rate || 0)), 0)),
      overtime: {
        daily_minutes: overtimeResult.daily_overtime_minutes,
        weekly_minutes: overtimeResult.weekly_overtime_minutes,
        total_minutes: overtimeResult.total_overtime_minutes,
      },
    }

    // CSV export
    if (exportFormat === 'csv') {
      const BOM = '\uFEFF'
      const csvHeader = 'Datum;Kund;Arbetstyp;Person;Beskrivning;Tid (min);Rast (min);Timpris;Summa;Fakturerbar;Godkänd\n'
      const csvRows = (rows as any[]).map(e => [
        e.work_date,
        (e.customer?.name || '').replace(/;/g, ','),
        (e.work_type?.name || '').replace(/;/g, ','),
        (e.business_user?.name || '').replace(/;/g, ','),
        (e.description || '').replace(/;/g, ',').replace(/\n/g, ' '),
        e.duration_minutes || 0,
        e.break_minutes || 0,
        e.hourly_rate || 0,
        Math.round(((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)),
        e.is_billable ? 'Ja' : 'Nej',
        e.approval_status === 'approved' ? 'Ja' : e.approval_status === 'rejected' ? 'Avslagen' : 'Väntande',
      ].join(';')).join('\n')

      const summaryRows = [
        '',
        'SAMMANFATTNING',
        `Period;${summary.period}`,
        `Antal poster;${summary.total_entries}`,
        `Total tid;${formatMinutes(summary.total_minutes)}`,
        `Total rast;${formatMinutes(summary.total_break_minutes)}`,
        `Fakturerbar tid;${formatMinutes(summary.billable_minutes)}`,
        `Total intäkt;${summary.total_revenue} kr`,
        `Övertid daglig;${formatMinutes(summary.overtime.daily_minutes)}`,
        `Övertid vecka;${formatMinutes(summary.overtime.weekly_minutes)}`,
        `Övertid totalt;${formatMinutes(summary.overtime.total_minutes)}`,
      ].join('\n')

      const csv = BOM + csvHeader + csvRows + '\n' + summaryRows

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="tidsrapport-${startDate}-${endDate}.csv"`,
        },
      })
    }

    // JSON response
    return NextResponse.json({
      summary,
      groups: groupedData,
      overtime: overtimeResult,
    })
  } catch (error: any) {
    console.error('Time report error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}
