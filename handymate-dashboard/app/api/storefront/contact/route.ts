import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { IntakeError, storefrontIntakeInput, receiveIntake, completeIntake, intakeReply } from '@/lib/leads/durable-intake'

export const dynamic = 'force-dynamic'
import { checkPublicRateLimitDb } from '@/lib/rate-limit-db'
import { getServerSupabase } from '@/lib/supabase'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
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
  return NextResponse.json({ contract: 'storefront-intake-v1' }, { headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' } })
}

/**
 * POST /api/storefront/contact — strukturerat kontaktformulär på publicerad
 * Handymate-hemsida. Kund, lead och affär går alltid genom Golden Path.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const { business_id, _hp } = body || {}

    // Honeypot: svara framgång så boten inte får feedback, men skriv inget.
    if (_hp) {
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    if (typeof business_id !== 'string' || !business_id) throw new IntakeError('Företaget saknas.', 400)
    const input = storefrontIntakeInput(body)
    const requestKey = request.headers.get('Idempotency-Key')
    if (!requestKey) throw new IntakeError('Ladda om formuläret innan du skickar.', 428)

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

    const receipt = await receiveIntake(supabase, config.business_id,
      'storefront:' + storefront.id, requestKey, input, 'receive_storefront_lead_intake')
    const result = await completeIntake(supabase, config.business_id, receipt.id)
    return NextResponse.json(
      { ...intakeReply(result), deal_id: result.state === 'completed' ? result.deal_id : null },
      { status: result.state === 'completed' ? 200 : 202, headers: CORS_HEADERS },
    )
  } catch (error: unknown) {
    if (error instanceof IntakeError) return NextResponse.json({ error: error.message }, { status: error.status, headers: CORS_HEADERS })
    const message = error instanceof Error ? error.message : 'Okänt fel'
    console.error('[storefront/contact] Oväntat fel:', message)
    return NextResponse.json(
      { error: 'Kunde inte skicka förfrågan. Försök igen.' },
      { status: 500, headers: CORS_HEADERS },
    )
  }
}
