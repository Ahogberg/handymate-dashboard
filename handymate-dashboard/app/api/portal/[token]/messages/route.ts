import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

async function getCustomerFromToken(token: string) {
  const supabase = getServerSupabase()
  const { data } = await supabase
    .from('customer')
    .select('customer_id, business_id, portal_enabled, name, phone_number')
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

    // Tidigare skrevs meddelandet bara till tabellen och stannade där: ingen
    // vy i dashboarden, ingen notis, ingen kö. Kundens meddelanden var ett
    // svart hål — skrev en pilotkund något såg hantverkaren det aldrig.
    // Nu går allt genom den delade vägen: tråd + kort i godkännande-kön + push.
    const { receiveCustomerMessage } = await import('@/lib/portal/customer-thread')
    const result = await receiveCustomerMessage(supabase, {
      businessId: customer.business_id,
      customerId: customer.customer_id,
      customerName: (customer as any).name,
      customerPhone: (customer as any).phone_number,
      message,
    })

    if (!result.threadWritten) {
      return NextResponse.json({ error: 'Kunde inte skicka meddelande' }, { status: 500 })
    }

    // Raden följer med så tråden kan visa meddelandet DIREKT — tidigare
    // returnerades bara success och kundens meddelande försvann ur vyn
    // tills nästa sidladdning.
    return NextResponse.json({ success: true, message: result.message ?? null })
  } catch (error: any) {
    console.error('Portal message send error:', error)
    return NextResponse.json({ error: 'Kunde inte skicka meddelande' }, { status: 500 })
  }
}
