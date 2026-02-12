import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const customerId = searchParams.get('customer_id')
    const dateFrom = searchParams.get('date_from')
    const dateTo = searchParams.get('date_to')
    const limit = parseInt(searchParams.get('limit') || '50')
    const offset = parseInt(searchParams.get('offset') || '0')

    const supabase = getServerSupabase()

    let query = supabase
      .from('communication_log')
      .select('*, communication_rule(name, trigger_type)', { count: 'exact' })
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (customerId) {
      query = query.eq('customer_id', customerId)
    }
    if (dateFrom) {
      query = query.gte('created_at', dateFrom)
    }
    if (dateTo) {
      query = query.lte('created_at', dateTo)
    }

    const { data, error, count } = await query

    if (error) throw error

    // Enrich with customer names
    const customerIds = Array.from(new Set((data || []).map((d: any) => d.customer_id).filter(Boolean))) as string[]
    let customerMap: Record<string, string> = {}

    if (customerIds.length > 0) {
      const { data: customers } = await supabase
        .from('customer')
        .select('customer_id, name')
        .in('customer_id', customerIds)

      customerMap = (customers || []).reduce((acc: Record<string, string>, c: any) => {
        acc[c.customer_id] = c.name
        return acc
      }, {})
    }

    const enriched = (data || []).map((log: any) => ({
      ...log,
      customer_name: customerMap[log.customer_id] || 'Okänd kund',
    }))

    return NextResponse.json({ data: enriched, total: count })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
