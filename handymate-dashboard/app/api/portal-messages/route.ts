import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const supabase = getServerSupabase()

    const { data: messages } = await supabase
      .from('customer_message')
      .select('id, customer_id, direction, message, read_at, created_at')
      .eq('business_id', business.business_id)
      .order('created_at', { ascending: false })
      .limit(100)

    // Get unique customer IDs and fetch names
    const customerIds = Array.from(new Set((messages || []).map((m: any) => m.customer_id)))
    const { data: customers } = customerIds.length > 0
      ? await supabase.from('customer').select('customer_id, name, phone_number').in('customer_id', customerIds)
      : { data: [] }

    const customerMap = new Map((customers || []).map((c: any) => [c.customer_id, c]))

    const enriched = (messages || []).map((m: any) => ({
      ...m,
      customer: customerMap.get(m.customer_id) || null
    }))

    return NextResponse.json({ messages: enriched })
  } catch (error: any) {
    console.error('Portal messages list error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { customerId, message } = await request.json()
    if (!customerId || !message?.trim()) {
      return NextResponse.json({ error: 'customerId och message krävs' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('customer_message')
      .insert({
        business_id: business.business_id,
        customer_id: customerId,
        direction: 'outbound',
        message: message.trim()
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: data })
  } catch (error: any) {
    console.error('Reply to portal message error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
