import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * POST /api/dashboard/cash-radar/nudge — { quote_id }
 *
 * Radarns "jaga offerten"-knapp. Skapar ett GATAT quote_nudge-förslag i
 * pending_approvals (samma payload-kontrakt som approvals-routens
 * case 'quote_nudge': to + message → SMS vid godkännande). Aldrig
 * auto-utskick — hantverkaren trycker Godkänn i Att godkänna.
 *
 * Dedup: finns redan ett öppet quote_nudge-förslag för offerten svarar vi
 * { ok: true, already_pending: true } istället för att skapa en dubblett.
 */

function genId(prefix: string): string {
  const c = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let s = prefix + '_'
  for (let i = 0; i < 14; i++) s += c[Math.floor(Math.random() * c.length)]
  return s
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const quoteId = typeof body?.quote_id === 'string' ? body.quote_id : null
  if (!quoteId) {
    return NextResponse.json({ ok: false, error: 'quote_id krävs' }, { status: 400 })
  }

  const supabase = getServerSupabase()
  const businessId = business.business_id

  // Offerten — alltid business-scopad.
  const { data: quote } = await supabase
    .from('quotes')
    .select('quote_id, title, total, customer_id')
    .eq('business_id', businessId)
    .eq('quote_id', quoteId)
    .maybeSingle()
  if (!quote) {
    return NextResponse.json({ ok: false, error: 'Offerten hittades inte' }, { status: 404 })
  }

  // Kundens telefonnummer — utan det finns inget SMS att föreslå.
  let customer: { name: string | null; phone_number: string | null } | null = null
  if (quote.customer_id) {
    const { data } = await supabase
      .from('customer')
      .select('name, phone_number')
      .eq('business_id', businessId)
      .eq('customer_id', quote.customer_id)
      .maybeSingle()
    customer = data
  }
  const phone = customer?.phone_number || null
  if (!phone) {
    return NextResponse.json({ ok: false, error: 'Kunden saknar telefonnummer' })
  }

  // Dedup: öppet quote_nudge-förslag för samma offert → skapa ingen dubblett.
  const { count } = await supabase
    .from('pending_approvals')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', businessId)
    .eq('approval_type', 'quote_nudge')
    .eq('status', 'pending')
    .contains('payload', { quote_id: quoteId })
  if ((count || 0) > 0) {
    return NextResponse.json({ ok: true, already_pending: true })
  }

  // Företagsnamn för SMS-signaturen.
  const { data: biz } = await supabase
    .from('business_config')
    .select('business_name')
    .eq('business_id', businessId)
    .maybeSingle()
  const businessName: string = biz?.business_name || 'Handymate'

  const customerName = customer?.name || 'kund'
  const firstName = String(customer?.name || '').split(' ')[0] || 'där'
  const title = (quote.title as string | null) || null
  const message = `Hej ${firstName}! Ville bara höra om du hunnit titta på offerten${title ? ` "${title}"` : ''}. Hör gärna av dig vid frågor! /${businessName}`

  const totalKr = Math.round(Number(quote.total) || 0)
  const { error } = await supabase.from('pending_approvals').insert({
    id: genId('appr'),
    business_id: businessId,
    approval_type: 'quote_nudge',
    title: `Påminn ${customerName} om offerten`,
    description: `Karin föreslår en vänlig påminnelse om offerten${title ? ` "${title}"` : ''}${totalKr > 0 ? ` (${totalKr.toLocaleString('sv-SE')} kr)` : ''}.`,
    status: 'pending',
    risk_level: 'low',
    expires_at: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    payload: {
      quote_id: quoteId,
      to: phone,
      customer_phone: phone,
      customer_id: quote.customer_id || null,
      message,
    },
  })
  if (error) {
    return NextResponse.json({ ok: false, error: 'Kunde inte skapa förslaget' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, already_pending: false })
}
