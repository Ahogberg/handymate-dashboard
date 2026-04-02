import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/sms/conversations — Lista alla SMS-konversationer grupperade per telefonnummer.
 *
 * Returnerar senaste meddelandet per nummer + antal olästa (inkommande utan svar).
 * Query: ?search=term&limit=50
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const search = request.nextUrl.searchParams.get('search') || ''
  const limit = parseInt(request.nextUrl.searchParams.get('limit') || '50')

  // Hämta alla konversationsmeddelanden
  let query = supabase
    .from('sms_conversation')
    .select('id, phone_number, role, content, created_at')
    .eq('business_id', business.business_id)
    .order('created_at', { ascending: false })

  if (search) {
    query = query.or(`phone_number.ilike.%${search}%,content.ilike.%${search}%`)
  }

  const { data: messages, error } = await query.limit(500)

  if (error) {
    console.error('[SMS conversations] Error:', error)
    return NextResponse.json({ conversations: [] })
  }

  // Gruppera per telefonnummer
  const byPhone = new Map<string, {
    phone_number: string
    last_message: string
    last_role: string
    last_at: string
    message_count: number
    unread_count: number
  }>()

  for (const msg of messages || []) {
    const existing = byPhone.get(msg.phone_number)
    if (!existing) {
      byPhone.set(msg.phone_number, {
        phone_number: msg.phone_number,
        last_message: msg.content,
        last_role: msg.role,
        last_at: msg.created_at,
        message_count: 1,
        unread_count: 0,
      })
    } else {
      existing.message_count++
    }
  }

  // Räkna olästa: inkommande (user) meddelanden som saknar efterföljande assistant-svar
  for (const msg of messages || []) {
    if (msg.role === 'user') {
      const conv = byPhone.get(msg.phone_number)
      if (conv) {
        // Kolla om det finns ett assistant-svar efter detta meddelande
        const hasReply = (messages || []).some(
          (m) =>
            m.phone_number === msg.phone_number &&
            m.role === 'assistant' &&
            m.created_at > msg.created_at
        )
        if (!hasReply) conv.unread_count++
      }
    }
  }

  // Slå ihop med kundnamn
  const phoneNumbers = Array.from(byPhone.keys())
  let customerMap = new Map<string, { name: string; customer_id: string }>()

  if (phoneNumbers.length > 0) {
    const { data: customers } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', business.business_id)
      .in('phone_number', phoneNumbers)

    for (const c of customers || []) {
      customerMap.set(c.phone_number, { name: c.name, customer_id: c.customer_id })
    }
  }

  const conversations = Array.from(byPhone.values())
    .map((conv) => ({
      ...conv,
      customer_name: customerMap.get(conv.phone_number)?.name || null,
      customer_id: customerMap.get(conv.phone_number)?.customer_id || null,
    }))
    .sort((a, b) => new Date(b.last_at).getTime() - new Date(a.last_at).getTime())
    .slice(0, limit)

  // Filtrera på kundnamn om sökning
  const filtered = search
    ? conversations.filter(
        (c) =>
          c.phone_number.includes(search) ||
          c.last_message.toLowerCase().includes(search.toLowerCase()) ||
          c.customer_name?.toLowerCase().includes(search.toLowerCase())
      )
    : conversations

  return NextResponse.json({ conversations: filtered })
}

/**
 * POST /api/sms/conversations — Skicka SMS-svar i en konversation.
 *
 * Body: { phone_number, message }
 */
export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone_number, message } = await request.json()
  if (!phone_number || !message) {
    return NextResponse.json({ error: 'phone_number och message krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()

  // Hämta företagsinfo för svarsnummer
  const { data: bizConfig } = await supabase
    .from('business_config')
    .select('business_name, assigned_phone_number')
    .eq('business_id', business.business_id)
    .single()

  const businessName = bizConfig?.business_name || 'Handymate'

  // Lägg till suffix
  const { buildSmsSuffix } = await import('@/lib/sms-reply-number')
  const suffix = buildSmsSuffix(businessName, bizConfig?.assigned_phone_number)
  const fullMessage = `${message}\n${suffix}`

  // Skicka via /api/sms/send (re-use befintlig logik med kvot, rate limit etc.)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const sendRes = await fetch(`${appUrl}/api/sms/send`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: request.headers.get('cookie') || '',
    },
    body: JSON.stringify({ to: phone_number, message: fullMessage }),
  })

  const sendResult = await sendRes.json()

  if (!sendRes.ok) {
    return NextResponse.json({ error: sendResult.error || 'SMS kunde inte skickas' }, { status: 500 })
  }

  // Logga i sms_conversation så svaret dyker upp i tråden
  await supabase.from('sms_conversation').insert({
    business_id: business.business_id,
    phone_number,
    role: 'assistant',
    content: message, // Utan suffix i konversationshistoriken
    created_at: new Date().toISOString(),
  })

  return NextResponse.json({ success: true })
}
