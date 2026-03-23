import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const business = await getAuthenticatedBusiness(req)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const businessId = business.business_id

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString()

  try {
    const [invRes, unpaidRes, overheadRes, hourlyRes, marginRes, monthlyRes, timeRes] = await Promise.all([
      // Fakturerat denna månad
      supabase.from('invoices').select('total_amount').eq('business_id', businessId).neq('status', 'draft').gte('created_at', startOfMonth),
      // Obetalda
      supabase.from('invoices').select('id, total_amount').eq('business_id', businessId).eq('status', 'sent'),
      // Settings
      supabase.from('business_preferences').select('value').eq('business_id', businessId).eq('key', 'overhead_monthly_sek').single(),
      supabase.from('business_preferences').select('value').eq('business_id', businessId).eq('key', 'hourly_cost_sek').single(),
      supabase.from('business_preferences').select('value').eq('business_id', businessId).eq('key', 'margin_target_percent').single(),
      // Senaste 6 månader
      supabase.from('invoices').select('total_amount, created_at').eq('business_id', businessId).neq('status', 'draft').gte('created_at', sixMonthsAgo).order('created_at', { ascending: true }),
      // Tid denna månad
      supabase.from('time_entry').select('duration_minutes').eq('business_id', businessId).gte('created_at', startOfMonth),
    ])

    const invoiced = (invRes.data || []).reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
    const unpaidCount = unpaidRes.data?.length || 0
    const unpaidAmount = (unpaidRes.data || []).reduce((s, i) => s + (Number(i.total_amount) || 0), 0)
    const overhead = Number(overheadRes.data?.value) || 0
    const hourlyRate = Number(hourlyRes.data?.value) || 450
    const totalMinutes = (timeRes.data || []).reduce((s, t) => s + (Number(t.duration_minutes) || 0), 0)
    const laborCost = (totalMinutes / 60) * hourlyRate
    const materialCost = Math.round(invoiced * 0.2) // estimat: 20% material (förbättra later med faktiska data)

    const totalCost = materialCost + laborCost + overhead
    const estimatedMargin = invoiced > 0 ? Math.round(((invoiced - totalCost) / invoiced) * 100) : null

    // Gruppera per månad
    const monthlyMap: Record<string, number> = {}
    for (const inv of (monthlyRes.data || [])) {
      const d = new Date(inv.created_at)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      monthlyMap[key] = (monthlyMap[key] || 0) + (Number(inv.total_amount) || 0)
    }
    const monthNames = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec']
    const monthlyTrend = Object.entries(monthlyMap)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, amount]) => ({
        month: monthNames[parseInt(key.split('-')[1]) - 1],
        amount: Math.round(amount),
      }))

    return NextResponse.json({
      invoiced: Math.round(invoiced),
      unpaidCount,
      unpaidAmount: Math.round(unpaidAmount),
      estimatedMargin,
      overheadSet: overhead > 0,
      materialCost: Math.round(materialCost),
      laborCost: Math.round(laborCost),
      overhead: Math.round(overhead),
      monthlyTrend,
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
