import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/dashboard/economy-summary
 *
 * Liten sammanfattning för Fakturor-kortet i Idag-vyn (desktop + mobil).
 * Samma queries som dashboard-startsidan gör inline mot invoice-tabellen —
 * mobilappen kan inte köra dem själv, därav endpoint.
 *
 * Svar: { invoiced_month, unpaid_count, unpaid_amount }
 */
export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

    const [invRes, unpaidRes] = await Promise.all([
      supabase
        .from('invoice')
        .select('total')
        .eq('business_id', business.business_id)
        .neq('status', 'draft')
        .gte('created_at', startOfMonth),
      supabase
        .from('invoice')
        .select('invoice_id, total')
        .eq('business_id', business.business_id)
        .eq('status', 'sent'),
    ])

    if (invRes.error) throw invRes.error
    if (unpaidRes.error) throw unpaidRes.error

    const invoicedMonth = (invRes.data || []).reduce(
      (sum: number, i: { total: unknown }) => sum + (Number(i.total) || 0), 0)
    const unpaidAmount = (unpaidRes.data || []).reduce(
      (sum: number, i: { total: unknown }) => sum + (Number(i.total) || 0), 0)

    return NextResponse.json({
      invoiced_month: invoicedMonth,
      unpaid_count: unpaidRes.data?.length || 0,
      unpaid_amount: unpaidAmount,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
