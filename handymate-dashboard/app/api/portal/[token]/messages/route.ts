import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled')
    .eq('portal_token', token)
    .single()
  if (!data || !data.portal_enabled) return null
  return data
}

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const supabase = getServerSupabase()

    const { data: messages } = await supabase
      .from('customer_message')
      .select('id, direction, message, read_at, created_at')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('created_at', { ascending: true })
      .limit(100)

    // Mark outbound messages as read
    await supabase
      .from('customer_message')
      .update({ read_at: new Date().toISOString() })
      .eq('customer_id', customer.customer_id)
      .eq('direction', 'outbound')
      .is('read_at', null)

    return NextResponse.json({ messages: messages || [] })
  } catch (error: any) {
    console.error('Portal messages error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const customer = await getCustomerFromToken(params.token)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { message } = await request.json()
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Meddelande krävs' }, { status: 400 })
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'Meddelandet är för långt' }, { status: 400 })
    }

    const supabase = getServerSupabase()

    const { data, error } = await supabase
      .from('customer_message')
      .insert({
        business_id: customer.business_id,
        customer_id: customer.customer_id,
        direction: 'inbound',
        message: message.trim()
      })
      .select()
      .single()

    if (error) throw error

    return NextResponse.json({ success: true, message: data })
  } catch (error: any) {
    console.error('Portal message send error:', error)
    return NextResponse.json({ error: 'Kunde inte skicka meddelande' }, { status: 500 })
  }
}
