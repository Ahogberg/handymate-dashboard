import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'

/**
 * GET - Löneunderlag per medarbetare och period
 * Query: period (YYYY-MM), businessUserId?, format (json|csv|html)
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Permission check: kräver see_financials
    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'see_financials')) {
      return NextResponse.json({ error: 'Otillräckliga behörigheter' }, { status: 403 })
    }

    const supabase = getServerSupabase()
    const businessId = business.business_id
    const period = request.nextUrl.searchParams.get('period') || new Date().toISOString().slice(0, 7)
    const userFilter = request.nextUrl.searchParams.get('businessUserId')
    const fmt = request.nextUrl.searchParams.get('format') || 'json'

    const [year, month] = period.split('-').map(Number)
    const startDate = `${period}-01`
    const endDate = new Date(year, month, 0).toISOString().split('T')[0]

    // Hämta business_config
    const { data: config } = await supabase
      .from('business_config')
      .select('business_name, standard_work_hours, overtime_after, ob1_rate, ob2_rate, overtime_50_rate, overtime_100_rate, mileage_rate')
      .eq('business_id', businessId)
      .single()

    const dailyLimit = (config?.overtime_after || config?.standard_work_hours || 8) * 60
    const ob1Multi = config?.ob1_rate || 1.3
    const ob2Multi = config?.ob2_rate || 1.7
    const ot50Multi = config?.overtime_50_rate || 1.5
    const ot100Multi = config?.overtime_100_rate || 2.0

    // Hämta medarbetare
    let userQuery = supabase
      .from('business_users')
      .select('id, name, email, hourly_wage, hourly_rate, employment_type, ob1_rate, ob2_rate, overtime_50_rate, overtime_100_rate')
      .eq('business_id', businessId)
      .eq('is_active', true)

    if (userFilter) userQuery = userQuery.eq('id', userFilter)

    const { data: users } = await userQuery
    if (!users || users.length === 0) {
      return NextResponse.json({ payroll: [], period })
    }

    const userIds = users.map((u: any) => u.id)

    // Hämta tidsrapporter
    const { data: entries } = await supabase
      .from('time_entry')
      .select('business_user_id, work_date, duration_minutes, overtime_minutes, overtime_type, hourly_rate, cost_rate, is_billable, approval_status')
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .gte('work_date', startDate)
      .lte('work_date', endDate)

    // Hämta resor
    const { data: travels } = await supabase
      .from('travel_entry')
      .select('business_user_id, distance_km, total_amount, allowance_amount, has_overnight')
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .gte('date', startDate)
      .lte('date', endDate)

    // Hämta ersättningar (allowance_reports)
    const { data: allowanceReports } = await supabase
      .from('allowance_reports')
      .select('business_user_id, amount, allowance_type:allowance_type_id(name, type, is_taxable)')
      .eq('business_id', businessId)
      .in('business_user_id', userIds)
      .gte('report_date', startDate)
      .lte('report_date', endDate)

    // Beräkna per medarbetare
    const payroll = users.map((user: any) => {
      const userEntries = (entries || []).filter((e: any) => e.business_user_id === user.id)
      const userTravels = (travels || []).filter((t: any) => t.business_user_id === user.id)
      const wage = user.hourly_wage || user.hourly_rate || 0

      // Daglig övertid
      const byDate: Record<string, number> = {}
      for (const e of userEntries) {
        byDate[e.work_date] = (byDate[e.work_date] || 0) + (e.duration_minutes || 0)
      }

      let regularMinutes = 0
      let dailyOvertimeMinutes = 0
      for (const total of Object.values(byDate)) {
        const ot = Math.max(0, total - dailyLimit)
        dailyOvertimeMinutes += ot
        regularMinutes += total - ot
      }

      // Vecko-övertid (förenklad: >40h/v)
      const totalMinutes = userEntries.reduce((s: number, e: any) => s + (e.duration_minutes || 0), 0)
      const regularAfterDaily = totalMinutes - dailyOvertimeMinutes
      const weeklyLimit = (config?.standard_work_hours || 8) * 5 * 60 * Math.ceil(Object.keys(byDate).length / 7 || 1)
      const weeklyOvertimeMinutes = Math.max(0, regularAfterDaily - weeklyLimit)
      regularMinutes = Math.max(0, regularMinutes - weeklyOvertimeMinutes)

      // OB-klassificering (från overtime_type)
      let ob1Minutes = 0
      let ob2Minutes = 0
      let ot50Minutes = dailyOvertimeMinutes + weeklyOvertimeMinutes
      let ot100Minutes = 0

      for (const e of userEntries) {
        if (e.overtime_type === 'ob1') ob1Minutes += e.overtime_minutes || 0
        if (e.overtime_type === 'ob2') ob2Minutes += e.overtime_minutes || 0
        if (e.overtime_type === 'overtime_100') {
          ot100Minutes += e.overtime_minutes || 0
          ot50Minutes = Math.max(0, ot50Minutes - (e.overtime_minutes || 0))
        }
      }

      // Belopp
      const userOb1 = user.ob1_rate || ob1Multi
      const userOb2 = user.ob2_rate || ob2Multi
      const userOt50 = user.overtime_50_rate || ot50Multi
      const userOt100 = user.overtime_100_rate || ot100Multi

      const regularAmount = (regularMinutes / 60) * wage
      const ob1Amount = (ob1Minutes / 60) * wage * userOb1
      const ob2Amount = (ob2Minutes / 60) * wage * userOb2
      const ot50Amount = (ot50Minutes / 60) * wage * userOt50
      const ot100Amount = (ot100Minutes / 60) * wage * userOt100

      const travelKm = userTravels.reduce((s: number, t: any) => s + (t.distance_km || 0), 0)
      const travelReimbursement = userTravels.reduce((s: number, t: any) => s + (t.total_amount || 0), 0)
      const allowanceDays = userTravels.filter((t: any) => t.has_overnight).length
      const allowanceAmount = userTravels.reduce((s: number, t: any) => s + (t.allowance_amount || 0), 0)

      // Ersättningar från allowance_reports
      const userAllowances = (allowanceReports || []).filter((a: any) => a.business_user_id === user.id)
      const extraAllowanceAmount = userAllowances.reduce((s: number, a: any) => s + (a.amount || 0), 0)

      const grossTotal = regularAmount + ob1Amount + ob2Amount + ot50Amount + ot100Amount + travelReimbursement + allowanceAmount + extraAllowanceAmount

      return {
        employee: user.name,
        email: user.email,
        employment_type: user.employment_type || 'employee',
        period,
        hourly_wage: wage,
        regular_hours: Math.round(regularMinutes / 60 * 10) / 10,
        overtime_50_hours: Math.round(ot50Minutes / 60 * 10) / 10,
        overtime_100_hours: Math.round(ot100Minutes / 60 * 10) / 10,
        ob1_hours: Math.round(ob1Minutes / 60 * 10) / 10,
        ob2_hours: Math.round(ob2Minutes / 60 * 10) / 10,
        total_hours: Math.round(totalMinutes / 60 * 10) / 10,
        travel_km: Math.round(travelKm * 10) / 10,
        travel_reimbursement: Math.round(travelReimbursement),
        allowance_days: allowanceDays,
        allowance_amount: Math.round(allowanceAmount),
        extra_allowance_amount: Math.round(extraAllowanceAmount),
        extra_allowances: userAllowances.map((a: any) => ({
          name: a.allowance_type?.name || 'Ersättning',
          amount: Math.round(a.amount || 0),
        })),
        gross_amount: {
          regular: Math.round(regularAmount),
          overtime_50: Math.round(ot50Amount),
          overtime_100: Math.round(ot100Amount),
          ob1: Math.round(ob1Amount),
          ob2: Math.round(ob2Amount),
          travel: Math.round(travelReimbursement),
          allowance: Math.round(allowanceAmount + extraAllowanceAmount),
          total: Math.round(grossTotal),
        },
      }
    })

    // CSV export
    if (fmt === 'csv') {
      const headers = [
        'Medarbetare', 'Period', 'Timlön', 'Normal (h)', 'ÖT 50% (h)', 'ÖT 100% (h)',
        'OB1 (h)', 'OB2 (h)', 'Total (h)', 'Resa (km)', 'Milersättning (kr)',
        'Traktamente (dagar)', 'Traktamente (kr)', 'Brutto normal', 'Brutto ÖT',
        'Brutto OB', 'Brutto resa', 'Brutto totalt'
      ]

      const rows = payroll.map((p: any) => [
        p.employee, p.period, p.hourly_wage,
        p.regular_hours, p.overtime_50_hours, p.overtime_100_hours,
        p.ob1_hours, p.ob2_hours, p.total_hours,
        p.travel_km, p.travel_reimbursement,
        p.allowance_days, p.allowance_amount,
        p.gross_amount.regular,
        p.gross_amount.overtime_50 + p.gross_amount.overtime_100,
        p.gross_amount.ob1 + p.gross_amount.ob2,
        p.gross_amount.travel + p.gross_amount.allowance,
        p.gross_amount.total,
      ])

      const csvContent = '\ufeff' + [
        headers.join(';'),
        ...rows.map((r: any) => r.join(';'))
      ].join('\n')

      return new NextResponse(csvContent, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename=loneunderlag_${period}.csv`,
        },
      })
    }

    // HTML/PDF export
    if (fmt === 'html') {
      const businessName = config?.business_name || 'Företag'
      const html = generatePayrollHTML(businessName, period, payroll)
      return new NextResponse(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      })
    }

    return NextResponse.json({ payroll, period })
  } catch (error: any) {
    console.error('Payroll export error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

function generatePayrollHTML(businessName: string, period: string, payroll: any[]) {
  const fmtKr = (n: number) => n.toLocaleString('sv-SE') + ' kr'
  const rows = payroll.map(p => `
    <tr>
      <td class="name">${p.employee}</td>
      <td>${p.regular_hours}h</td>
      <td>${p.overtime_50_hours > 0 ? p.overtime_50_hours + 'h' : '–'}</td>
      <td>${p.overtime_100_hours > 0 ? p.overtime_100_hours + 'h' : '–'}</td>
      <td>${p.ob1_hours > 0 ? p.ob1_hours + 'h' : '–'}</td>
      <td>${p.total_hours}h</td>
      <td>${p.travel_km > 0 ? p.travel_km + ' km' : '–'}</td>
      <td>${p.allowance_days > 0 ? p.allowance_days + ' d' : '–'}</td>
      <td class="amount">${fmtKr(p.gross_amount.regular)}</td>
      <td class="amount">${fmtKr(p.gross_amount.overtime_50 + p.gross_amount.overtime_100 + p.gross_amount.ob1 + p.gross_amount.ob2)}</td>
      <td class="amount">${fmtKr(p.gross_amount.travel + p.gross_amount.allowance)}</td>
      <td class="amount total">${fmtKr(p.gross_amount.total)}</td>
    </tr>
  `).join('')

  const grandTotal = payroll.reduce((s, p) => s + p.gross_amount.total, 0)

  return `<!DOCTYPE html>
<html lang="sv">
<head>
  <meta charset="UTF-8">
  <title>Löneunderlag ${period} – ${businessName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; color: #1a1a1a; padding: 40px; }
    h1 { font-size: 24px; margin-bottom: 4px; }
    .subtitle { color: #666; font-size: 14px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #999; padding: 8px; border-bottom: 2px solid #eee; }
    td { padding: 10px 8px; border-bottom: 1px solid #f0f0f0; }
    .name { font-weight: 600; }
    .amount { text-align: right; font-variant-numeric: tabular-nums; }
    .total { font-weight: 700; color: #1a1a1a; }
    tfoot td { border-top: 2px solid #333; font-weight: 700; padding-top: 12px; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Löneunderlag</h1>
  <p class="subtitle">${businessName} &middot; Period: ${period}</p>
  <table>
    <thead>
      <tr>
        <th>Medarbetare</th>
        <th>Normal</th>
        <th>ÖT 50%</th>
        <th>ÖT 100%</th>
        <th>OB</th>
        <th>Totalt</th>
        <th>Resa</th>
        <th>Trakt.</th>
        <th style="text-align:right">Brutto lön</th>
        <th style="text-align:right">Tillägg</th>
        <th style="text-align:right">Resa/trakt.</th>
        <th style="text-align:right">Totalt</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
    <tfoot>
      <tr>
        <td colspan="11">Totalt</td>
        <td class="amount">${fmtKr(grandTotal)}</td>
      </tr>
    </tfoot>
  </table>
  <p style="margin-top:24px;font-size:11px;color:#999;">Genererat ${new Date().toLocaleDateString('sv-SE')} &middot; Handymate</p>
</body>
</html>`
}
