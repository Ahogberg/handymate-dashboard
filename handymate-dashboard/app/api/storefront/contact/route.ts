import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createLeadAndDeal } from '@/lib/leads/golden-path'
import { checkPublicRateLimitDb } from '@/lib/rate-limit-db'
import { getServerSupabase } from '@/lib/supabase'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

function clientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') || 'unknown'
}

function hashIp(ip: string): string {
  return createHash('sha256').update(`${ip}:hm-storefront-contact`).digest('hex').slice(0, 16)
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

/**
 * POST /api/storefront/contact — strukturerat kontaktformulär på publicerad
 * Handymate-hemsida. Kund, lead och affär går alltid genom Golden Path.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { business_id, name, phone, email, message, _hp } = body

    // Honeypot: svara framgång så boten inte får feedback, men skriv inget.
    if (_hp) {
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    if (!business_id || !name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400, headers: CORS_HEADERS })
    }
    if (!phone?.trim() && !email?.trim()) {
      return NextResponse.json({ error: 'Ange telefon eller e-post' }, { status: 400, headers: CORS_HEADERS })
    }

    const rateCheck = await checkPublicRateLimitDb(`storefront-contact:ip:${hashIp(clientIp(request))}`, {
      maxRequests: 10,
      windowMs: 60 * 60 * 1000,
    })
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'För många förfrågningar. Försök igen om en stund.' },
        {
          status: 429,
          headers: {
            ...CORS_HEADERS,
            'Retry-After': String(Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000))),
          },
        },
      )
    }

    const supabase = getServerSupabase()
    const [{ data: config, error: configError }, { data: storefront, error: storefrontError }] = await Promise.all([
      supabase
        .from('business_config')
        .select('business_id, business_name, phone_number')
        .eq('business_id', business_id)
        .maybeSingle(),
      supabase
        .from('storefront')
        .select('id, is_published, contact_form_submissions')
        .eq('business_id', business_id)
        .maybeSingle(),
    ])

    if (configError || !config) {
      console.error('[storefront/contact] Företagsuppslag misslyckades:', configError)
      return NextResponse.json({ error: 'Företaget hittades inte' }, { status: 404, headers: CORS_HEADERS })
    }
    if (storefrontError || !storefront || !storefront.is_published) {
      console.error('[storefront/contact] Publicerad hemsida saknas:', storefrontError)
      return NextResponse.json({ error: 'Hemsidan hittades inte' }, { status: 404, headers: CORS_HEADERS })
    }

    // Schemat tillåter website_form (inte storefront_contact) som källa.
    // Samma värde används av widgeten och den publika bokningssidan.
    const result = await createLeadAndDeal(
      {
        businessId: config.business_id,
        businessPhoneNumber: config.phone_number || null,
        name: name.trim(),
        phone: phone?.trim() || '',
        email: email?.trim().toLowerCase() || null,
        message: message?.trim() || null,
        source: 'website_form',
      },
      supabase,
    )

    // Lead utan affär är ett verkligt delfel. Svara aldrig success trots att
    // en rad hann skapas — ägaren behöver kunna se och åtgärda det.
    if (result.dealError || !result.dealId) {
      console.error('[storefront/contact] Lead skapad men affär misslyckades:', result.dealError)
      return NextResponse.json(
        {
          error: 'Förfrågan sparades, men kunde inte läggas i företagets affärsflöde.',
          lead_created: true,
          deal_created: false,
        },
        { status: 500, headers: CORS_HEADERS },
      )
    }

    // Golden Path sköter ägar-SMS och automation-event men inte appnotisen.
    const { error: notificationError } = await supabase.from('notification').insert({
      business_id,
      type: 'new_lead',
      title: 'Ny förfrågan via hemsidan',
      message: `${name.trim()}${message?.trim() ? `: ${message.trim().substring(0, 100)}` : ''}`,
      icon: '🌐',
      link: '/dashboard/pipeline',
      is_read: false,
    })
    if (notificationError) {
      console.error('[storefront/contact] Notis kunde inte skapas:', notificationError)
    }

    // Analysräknaren får aldrig avgöra om kundens förfrågan lyckades.
    const { error: analyticsError } = await supabase
      .from('storefront')
      .update({ contact_form_submissions: (storefront.contact_form_submissions || 0) + 1 })
      .eq('id', storefront.id)
    if (analyticsError) {
      console.error('[storefront/contact] Kunde inte uppdatera formulärstatistik:', analyticsError)
    }

    return NextResponse.json(
      { success: true, lead_id: result.leadId, deal_id: result.dealId },
      { headers: CORS_HEADERS },
    )
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[storefront/contact] Oväntat fel:', message)
    return NextResponse.json(
      { error: 'Kunde inte skicka förfrågan. Försök igen.' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
