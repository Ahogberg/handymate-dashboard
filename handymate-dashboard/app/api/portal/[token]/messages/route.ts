import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getCustomerFromPortalToken } from '@/lib/portal-link'

export const dynamic = 'force-dynamic'

const MESSAGES_CUSTOMER_SELECT = 'customer_id, business_id, portal_enabled, name, phone_number'

export async function GET(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token, MESSAGES_CUSTOMER_SELECT)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { data: messages, error: messagesError } = await supabase
      .from('customer_message')
      .select('id, direction, message, read_at, created_at')
      .eq('customer_id', customer.customer_id)
      .eq('business_id', customer.business_id)
      .order('created_at', { ascending: true })
      .limit(100)

    // TD-22: tidigare bara `{ data: messages }` — en kolumnmissmatch eller
    // RLS-miss gav en tyst tom tråd med HTTP 200, ingen spår i loggen.
    if (messagesError) {
      console.error('[portal/messages] query error:', messagesError)
      return NextResponse.json({ error: 'Kunde inte hämta meddelandena just nu' }, { status: 500 })
    }

    // Mark outbound messages as read — best-effort, loggas men blockerar
    // aldrig läsningen av tråden.
    const { error: markReadError } = await supabase
      .from('customer_message')
      .update({ read_at: new Date().toISOString() })
      .eq('customer_id', customer.customer_id)
      .eq('direction', 'outbound')
      .is('read_at', null)
    if (markReadError) console.error('[portal/messages] mark-read misslyckades:', markReadError.message)

    return NextResponse.json({ messages: messages || [] })
  } catch (error: any) {
    console.error('Portal messages error:', error)
    return NextResponse.json({ error: 'Serverfel' }, { status: 500 })
  }
}

export async function POST(request: NextRequest, { params }: { params: { token: string } }) {
  try {
    const supabase = getServerSupabase()
    const customer = await getCustomerFromPortalToken(supabase, params.token, MESSAGES_CUSTOMER_SELECT)
    if (!customer) return NextResponse.json({ error: 'Ogiltig länk' }, { status: 404 })

    const { message } = await request.json()
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Meddelande krävs' }, { status: 400 })
    }

    if (message.length > 2000) {
      return NextResponse.json({ error: 'Meddelandet är för långt' }, { status: 400 })
    }

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
