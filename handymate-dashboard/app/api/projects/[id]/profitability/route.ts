import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'

/**
 * GET /api/projects/[id]/profitability - Beräkna lönsamhet
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

    // Fetch quote total if linked
    let quoteAmount = 0
    if (project.quote_id) {
      const { data: quote } = await supabase
        .from('quotes')
        .select('total')
        .eq('quote_id', project.quote_id)
        .single()
      quoteAmount = quote?.total || 0
    }

    // Fetch approved ÄTA
    const { data: changes } = await supabase
      .from('project_change')
      .select('change_type, amount, hours')
      .eq('project_id', projectId)
      .eq('status', 'approved')

    const ataAdditions = (changes || [])
      .filter((c: any) => c.change_type === 'addition' || c.change_type === 'change')
      .reduce((sum: number, c: any) => sum + (c.amount || 0), 0)
    const ataRemovals = (changes || [])
      .filter((c: any) => c.change_type === 'removal')
      .reduce((sum: number, c: any) => sum + Math.abs(c.amount || 0), 0)
    const ataHours = (changes || []).reduce((sum: number, c: any) => sum + (c.hours || 0), 0)

    // Fetch time entries
    const { data: timeEntries } = await supabase
      .from('time_entry')
      .select('duration_minutes, hourly_rate, is_billable, invoiced, invoice_id')
      .eq('project_id', projectId)

    const entries = timeEntries || []
    const actualMinutes = entries.reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const actualCost = entries.reduce((sum: number, e: any) => {
      const hours = (e.duration_minutes || 0) / 60
      return sum + (hours * (e.hourly_rate || 0))
    }, 0)
    const invoicedMinutes = entries
      .filter((e: any) => e.invoiced)
      .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const uninvoicedMinutes = entries
      .filter((e: any) => !e.invoiced && e.is_billable)
      .reduce((sum: number, e: any) => sum + (e.duration_minutes || 0), 0)
    const uninvoicedRevenue = entries
      .filter((e: any) => !e.invoiced && e.is_billable)
      .reduce((sum: number, e: any) => {
        const hours = (e.duration_minutes || 0) / 60
        return sum + (hours * (e.hourly_rate || 0))
      }, 0)

    // Fetch invoiced amount for this project's time entries
    const invoiceIds = Array.from(new Set(entries.filter((e: any) => e.invoice_id).map((e: any) => e.invoice_id)))
    let invoicedAmount = 0
    if (invoiceIds.length > 0) {
      const { data: invoices } = await supabase
        .from('invoice')
        .select('total')
        .in('invoice_id', invoiceIds)

      invoicedAmount = (invoices || []).reduce((sum: number, i: any) => sum + (i.total || 0), 0)
    }

    // Fetch project materials
    const { data: materials } = await supabase
      .from('project_material')
      .select('total_purchase, total_sell, invoiced')
      .eq('project_id', projectId)

    const mats = materials || []
    const materialPurchaseTotal = mats.reduce((sum: number, m: any) => sum + (m.total_purchase || 0), 0)
    const materialSellTotal = mats.reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)
    const invoicedMaterialSell = mats
      .filter((m: any) => m.invoiced)
      .reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)
    const uninvoicedMaterialSell = mats
      .filter((m: any) => !m.invoiced)
      .reduce((sum: number, m: any) => sum + (m.total_sell || 0), 0)

    // Calculate profitability (including materials)
    const totalRevenue = quoteAmount + ataAdditions - ataRemovals + materialSellTotal
    const totalCosts = actualCost + materialPurchaseTotal
    const totalBudgetHours = (project.budget_hours || 0) + ataHours
    const marginAmount = totalRevenue - totalCosts
    const marginPercent = totalRevenue > 0 ? (marginAmount / totalRevenue) * 100 : 0

    return NextResponse.json({
      revenue: {
        quote_amount: Math.round(quoteAmount),
        ata_additions: Math.round(ataAdditions),
        ata_removals: Math.round(ataRemovals),
        material_sell: Math.round(materialSellTotal),
        total: Math.round(totalRevenue)
      },
      costs: {
        actual_hours: Math.round(actualMinutes / 60 * 100) / 100,
        actual_amount: Math.round(actualCost),
        material_purchase: Math.round(materialPurchaseTotal),
        total: Math.round(totalCosts)
      },
      budget: {
        hours: project.budget_hours || 0,
        hours_with_ata: Math.round(totalBudgetHours * 100) / 100,
        amount: project.budget_amount || 0,
        amount_with_ata: Math.round(totalRevenue),
        hours_usage_percent: totalBudgetHours > 0
          ? Math.round((actualMinutes / 60) / totalBudgetHours * 100)
          : 0,
        amount_usage_percent: totalRevenue > 0
          ? Math.round(totalCosts / totalRevenue * 100)
          : 0
      },
      invoicing: {
        invoiced_amount: Math.round(invoicedAmount),
        invoiced_hours: Math.round(invoicedMinutes / 60 * 100) / 100,
        uninvoiced_hours: Math.round(uninvoicedMinutes / 60 * 100) / 100,
        uninvoiced_amount: Math.round(uninvoicedRevenue),
        invoiced_material: Math.round(invoicedMaterialSell),
        uninvoiced_material: Math.round(uninvoicedMaterialSell)
      },
      margin: {
        amount: Math.round(marginAmount),
        percent: Math.round(marginPercent * 10) / 10
      }
    })

  } catch (error: any) {
    console.error('Get profitability error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
