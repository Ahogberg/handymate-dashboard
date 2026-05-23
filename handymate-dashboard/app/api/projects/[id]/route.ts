import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { maybeStripAtaList } from '@/lib/ata/strip-prices'

/**
 * GET /api/projects/[id] - Hämta projektöversikt med all data
 *
 * Rollskydd (TD-77, 2026-05-23): data.changes (ÄTA) strippas för
 * icke-see_financials. Konsekvent med /api/projects/[id]/changes
 * och /api/ata. Bevarar publik sign-flöde (/api/ata/sign/[token]
 * är separat och opåverkad).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const projectId = params.id

    // Fetch project
    const { data: project, error } = await supabase
      .from('project')
      .select('*')
      .eq('project_id', projectId)
      .eq('business_id', business.business_id)
      .single()

    if (error || !project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 })
    }

    // Fetch customer separately (no FK on project table)
    let customer = null
    if (project.customer_id) {
      const { data } = await supabase
        .from('customer')
        .select('customer_id, name, phone_number, email, address_line')
        .eq('customer_id', project.customer_id)
        .single()
      customer = data
    }
    project.customer = customer

    // Fetch milestones
    const { data: milestones } = await supabase
      .from('project_milestone')
      .select('*')
      .eq('project_id', projectId)
      .order('sort_order')

    // Fetch changes (ÄTA)
    const { data: changes } = await supabase
      .from('project_change')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    // Fetch time entries
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('*')
      .eq('project_id', projectId)
      .order('work_date', { ascending: false })

    // Fetch project materials
    const { data: materials } = await supabase
      .from('project_material')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })

    // Fetch linked quote if exists
    let quote = null
    if (project.quote_id) {
      const { data } = await supabase
        .from('quotes')
        .select('quote_id, title, total, status')
        .eq('quote_id', project.quote_id)
        .single()
      quote = data
    }

    // Compute time summary
    const entries = timeEntries || []
    const totalMinutes = entries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const billableMinutes = entries
      .filter((e: any) => e.is_billable)
      .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const totalRevenue = entries.reduce((sum: number, e: any) => {
      const hours = (e.duration_minutes || 0) / 60
      return sum + (hours * (e.hourly_rate || 0))
    }, 0)
    const uninvoicedMinutes = entries
      .filter((e: any) => !e.invoiced && e.is_billable)
      .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const uninvoicedRevenue = entries
      .filter((e: any) => !e.invoiced && e.is_billable)
      .reduce((sum: number, e: any) => {
        const hours = (e.duration_minutes || 0) / 60
        return sum + (hours * (e.hourly_rate || 0))
      }, 0)

    // Compute ÄTA summary
    const approvedChanges = (changes || []).filter((c: any) => c.status === 'approved')
    const ataAdditions = approvedChanges
      .filter((c: any) => c.change_type === 'addition' || c.change_type === 'change')
      .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
    const ataRemovals = approvedChanges
      .filter((c: any) => c.change_type === 'removal')
      .reduce((sum: number, c: any) => sum + Math.abs(c.amount || 0), 0)
    const ataHours = approvedChanges.reduce((sum: number, c: any) => sum + (c.hours || 0), 0)

    // Compute material summary
    const mats = materials || []
    const materialPurchaseTotal = mats.reduce((sum: number, m: any) => sum + (m.total_purchase || 0), 0)
    const materialSellTotal = mats.reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)
    const uninvoicedMaterialSell = mats
      .filter((m: any) => !m.invoiced)
      .reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)

    // Compute time per milestone
    const milestoneTimeMap: Record<string, { actual_minutes: number; actual_revenue: number }> = {}
    for (const e of entries) {
      if (e.milestone_id) {
        if (!milestoneTimeMap[e.milestone_id]) {
          milestoneTimeMap[e.milestone_id] = { actual_minutes: 0, actual_revenue: 0 }
        }
        milestoneTimeMap[e.milestone_id].actual_minutes += (e.duration_minutes || 0)
        milestoneTimeMap[e.milestone_id].actual_revenue += ((e.duration_minutes || 0) / 60) * (e.hourly_rate || 0)
      }
    }

    const milestonesWithTime = (milestones || []).map((ms: any) => ({
      ...ms,
      actual_hours: Math.round((milestoneTimeMap[ms.milestone_id]?.actual_minutes || 0) / 60 * 100) / 100,
      actual_revenue: Math.round(milestoneTimeMap[ms.milestone_id]?.actual_revenue || 0),
    }))

    // TD-77 (2026-05-23): strippa ÄTA-belopp + summary-ekonomi för icke-
    // see_financials. ataResult.flag avgör om priser ska redact:as
    // även i summary-aggregaten (ata_*, total_revenue, material_*).
    // Tim-fält (total_hours, billable_hours) behålls — inte priser per se.
    const ataResult = await maybeStripAtaList(request, changes || [])
    const redacted = ataResult.flag.prices_redacted === true

    return NextResponse.json({
      project,
      quote,
      milestones: milestonesWithTime,
      changes: ataResult.atas,
      ...ataResult.flag,
      time_entries: entries,
      materials: mats,
      summary: {
        // Tim-fält — behålls för alla (arbetsinstruktion, inte pris)
        total_hours: Math.round(totalMinutes / 60 * 100) / 100,
        billable_hours: Math.round(billableMinutes / 60 * 100) / 100,
        uninvoiced_hours: Math.round(uninvoicedMinutes / 60 * 100) / 100,
        ata_hours: Math.round(ataHours * 100) / 100,
        // Belopps-fält — strippas för icke-behörig
        total_revenue: redacted ? 0 : Math.round(totalRevenue),
        uninvoiced_revenue: redacted ? 0 : Math.round(uninvoicedRevenue),
        ata_additions: redacted ? 0 : Math.round(ataAdditions),
        ata_removals: redacted ? 0 : Math.round(ataRemovals),
        ata_net: redacted ? 0 : Math.round(ataAdditions - ataRemovals),
        material_purchase_total: redacted ? 0 : Math.round(materialPurchaseTotal),
        material_sell_total: redacted ? 0 : Math.round(materialSellTotal),
        uninvoiced_material_sell: redacted ? 0 : Math.round(uninvoicedMaterialSell)
      }
    })

  } catch (error: any) {
    console.error('Get project detail error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
