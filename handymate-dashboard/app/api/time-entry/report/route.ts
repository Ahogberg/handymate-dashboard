import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { calculateWeeklyOvertime, formatMinutes } from '@/lib/overtime'
import {
  escapeHtml,
  formatCurrency,
  formatDateShort,
  buildContactLine,
  renderDocumentHeader,
  renderTealLine,
  renderFooterGrid,
  wrapInPage,
} from '@/lib/document-html'

/**
 * GET /api/time-entry/report - Generera tidsrapport
 * Query: startDate, endDate, format (json|csv|html), groupBy (day|week|customer|project)
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
        case 'week': {
          const d = new Date(entry.work_date)
          const weekNum = getISOWeek(d)
          key = `${d.getFullYear()}-W${weekNum}`
          label = `Vecka ${weekNum}, ${d.getFullYear()}`
          break
        }
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

    // ── HTML export ──
    if (exportFormat === 'html') {
      const { data: config } = await supabase
        .from('business_config')
        .select('business_name, contact_name, phone_number, contact_email, org_number, f_skatt_registered, website')
        .eq('business_id', business.business_id)
        .single()

      const html = generateTimeReportHTML(rows as any[], summary, overtimeResult, config, business, startDate, endDate)

      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    // ── CSV export ──
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
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    console.error('Time report error:', error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
  const dayNum = d.getUTCDay() || 7
  d.setUTCDate(d.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
}

// ── HTML generation ────────────────────────────────────────────

function generateTimeReportHTML(
  entries: any[],
  summary: any,
  overtimeResult: any,
  config: any,
  business: any,
  startDate: string,
  endDate: string,
): string {
  // Determine week label
  const startD = new Date(startDate)
  const weekNum = getISOWeek(startD)
  const year = startD.getFullYear()
  const docNumber = `Vecka ${weekNum}, ${year}`

  const contactLine = buildContactLine(
    config?.contact_name || business?.contact_name,
    config?.phone_number || business?.phone_number,
    config?.contact_email || business?.contact_email,
  )

  const header = renderDocumentHeader(
    config?.business_name || business?.business_name || 'Företag',
    contactLine,
    'Tidrapport',
    docNumber,
  )

  // ── Meta row ──
  // Find most common customer/project
  const customerCounts = new Map<string, { name: string; count: number }>()
  for (const e of entries) {
    const cName = e.customer?.name || 'Inget projekt'
    const existing = customerCounts.get(cName) || { name: cName, count: 0 }
    existing.count++
    customerCounts.set(cName, existing)
  }
  const topCustomer = Array.from(customerCounts.values()).sort((a, b) => b.count - a.count)[0]

  const formatPeriodDate = (d: string) => {
    const date = new Date(d)
    return `${date.getDate()} ${['januari','februari','mars','april','maj','juni','juli','augusti','september','oktober','november','december'][date.getMonth()]} ${date.getFullYear()}`
  }

  const metaRow = `
  <div class="meta-row meta-row-2">
    <div class="meta-block">
      <div class="label">Projekt</div>
      <div class="value">
        ${escapeHtml(topCustomer?.name || 'Diverse')}
        ${entries[0]?.project_id ? `<div style="font-size:12px;color:#94A3B8;">${escapeHtml(entries[0].project_id)}</div>` : ''}
      </div>
    </div>
    <div class="meta-block">
      <div class="label">Period</div>
      <div class="value">${formatPeriodDate(startDate)} – ${formatPeriodDate(endDate)}</div>
    </div>
  </div>`

  // ── Group entries by person ──
  const byPerson: Record<string, { name: string; entries: any[] }> = {}

  for (const e of entries) {
    const personId = e.business_user_id || 'unknown'
    const personName = e.business_user?.name || config?.contact_name || business?.contact_name || 'Anställd'
    if (!byPerson[personId]) byPerson[personId] = { name: personName, entries: [] }
    byPerson[personId].entries.push(e)
  }

  // Standard work hours per day (in minutes)
  const stdDayMinutes = 8 * 60

  let personBlocksHtml = ''

  for (const person of Object.values(byPerson)) {
    const totalMinutes = person.entries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0)
    const totalHours = Math.round(totalMinutes / 60 * 10) / 10

    // Group entries by date
    const byDate = new Map<string, any[]>()
    for (const e of person.entries) {
      const existing = byDate.get(e.work_date) || []
      existing.push(e)
      byDate.set(e.work_date, existing)
    }

    const dayRows = Array.from(byDate.entries()).map(([date, dayEntries]) => {
      const dayTotal = dayEntries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0)
      const dayHours = Math.round(dayTotal / 60 * 10) / 10
      const overtime = Math.max(0, dayTotal - stdDayMinutes)
      const overtimeHours = overtime > 0 ? Math.round(overtime / 60 * 10) / 10 : 0
      const regularHours = overtime > 0 ? Math.round((dayTotal - overtime) / 60 * 10) / 10 : dayHours
      const descriptions = dayEntries.map((e: any) => e.description || '').filter(Boolean).join(', ')

      return `<tr>
        <td class="date">${formatDateShort(date)}</td>
        <td>${escapeHtml(descriptions) || '—'}</td>
        <td class="r">${regularHours}</td>
        <td class="${overtimeHours > 0 ? 'r' : 'ot'}">${overtimeHours > 0 ? overtimeHours : '—'}</td>
      </tr>`
    }).join('\n')

    personBlocksHtml += `
    <div class="person-block">
      <div class="person-header">
        <span class="person-name">${escapeHtml(person.name)}</span>
        <span class="person-total">${totalHours} tim totalt</span>
      </div>
      <table class="time">
        <thead><tr>
          <th style="width:22%">Datum</th>
          <th style="width:50%">Beskrivning</th>
          <th class="r" style="width:14%">Tim</th>
          <th class="r" style="width:14%">Övertid</th>
        </tr></thead>
        <tbody>${dayRows}</tbody>
      </table>
    </div>`
  }

  // ── Summary row ──
  const totalHours = Math.round(summary.total_minutes / 60 * 10) / 10
  const overtimeHours = Math.round(summary.overtime.total_minutes / 60 * 10) / 10
  const regularHours = Math.round((summary.total_minutes - summary.overtime.total_minutes) / 60 * 10) / 10

  const summaryRowHtml = `
  <div class="summary-row">
    <div class="summary-cell">
      <div class="label">Ordinarie tid</div>
      <div class="val">${regularHours} tim</div>
    </div>
    <div class="summary-cell">
      <div class="label">Övertid</div>
      <div class="val">${overtimeHours} tim</div>
    </div>
    <div class="summary-cell">
      <div class="label">Totalt</div>
      <div class="val teal">${totalHours} tim</div>
    </div>
    <div class="summary-cell">
      <div class="label">Fakturerbart</div>
      <div class="val">${formatCurrency(summary.total_revenue)}</div>
    </div>
  </div>`

  // ── Footer ──
  const today = new Date().toLocaleDateString('sv-SE', { day: 'numeric', month: 'long', year: 'numeric' })
  const signerName = config?.contact_name || business?.contact_name || ''

  const footerHtml = renderFooterGrid([
    {
      label: 'Signerat av',
      value: [escapeHtml(signerName), today].filter(Boolean).join('<br>'),
    },
    {
      label: 'Org.nr',
      value: [
        escapeHtml(config?.org_number || ''),
        config?.f_skatt_registered ? 'Godkänd för F-skatt' : '',
      ].filter(Boolean).join('<br>'),
    },
    {
      label: 'Export',
      value: 'PDF &nbsp;&middot;&nbsp; Fortnox-sync',
    },
  ])

  // ── Assemble ──
  const bodyHtml = [
    header,
    renderTealLine(),
    metaRow,
    '<div class="section-title">Tidredovisning</div>',
    personBlocksHtml,
    summaryRowHtml,
    footerHtml,
  ].join('\n')

  return wrapInPage(
    `Tidrapport ${docNumber} — ${escapeHtml(config?.business_name || business?.business_name || '')}`,
    '',
    bodyHtml,
  )
}
