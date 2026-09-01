import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness, checkPhoneApiRateLimit } from '@/lib/auth'
import { getCurrentUser } from '@/lib/permissions'
import { checkFuelGate } from '@/lib/costs/fuel'
import { recordingNoticeUrl } from '@/lib/voice/retention'
import {
  OUTBOUND_RECORDING_PREFIX,
  elksCredentials,
  loadOutboundBusinessConfig,
  maskPhone,
  resolveCraftsmanPhone,
  toE164OrNull,
  type OutboundBusinessConfig,
} from '../_shared'

export const dynamic = 'force-dynamic'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'

/**
 * "Ring via Handymate" — utgående samtal från företagets 46elks-nummer som
 * spelas in och går in i samma efterarbetskedja som inkommande samtal.
 *
 * ═══ VARFÖR KUNDEN RINGS FÖRST ═══
 *
 * 46elks kan bara spela upp ljud (`play`/`ivr`) på A-benet — numret i `to`
 * på POST /a1/calls. Inspelningsmeddelandet måste nå kunden, alltså är kunden
 * A-benet: kunden rings, hör meddelandet, och kopplas därefter via `connect`
 * till hantverkarens mobil (B-benet). Hantverkaren har precis tryckt på
 * knappen och står med telefonen i handen.
 *
 * GET  → kapabilitet (får knappen visas som "Ring via Handymate" eller som
 *        vanlig tel:-länk?).
 * POST → skapar call_recording-raden FÖRE 46elks-anropet (så webhookarna
 *        alltid har en rad att landa i) och startar samtalet.
 */

interface Capability {
  available: boolean
  reason?: string
  craftsman_phone_masked?: string
}

async function capability(
  supabase: ReturnType<typeof getServerSupabase>,
  config: OutboundBusinessConfig | null,
  businessUserId: string | null,
): Promise<Capability & { craftsmanPhone?: string }> {
  if (!config) return { available: false, reason: 'Företagets telefoni-inställningar kunde inte läsas' }
  if (!config.assigned_phone_number) return { available: false, reason: 'Inget Handymate-nummer' }
  if (!config.call_recording_enabled) return { available: false, reason: 'Inspelning är inte aktiverad' }
  if (!recordingNoticeUrl()) return { available: false, reason: 'Inspelningsmeddelandet är inte godkänt för användning' }
  if (!elksCredentials()) return { available: false, reason: 'Telefonileverantören är inte konfigurerad' }
  const craftsmanPhone = await resolveCraftsmanPhone(supabase, config, businessUserId)
  if (!craftsmanPhone) return { available: false, reason: 'Ingen mobil att koppla till' }
  return { available: true, craftsman_phone_masked: maskPhone(craftsmanPhone), craftsmanPhone }
}

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (business._impersonation) {
    return NextResponse.json({ available: false, reason: 'Samtal kan inte startas i visningsläge' } satisfies Capability)
  }
  const supabase = getServerSupabase()
  const currentUser = await getCurrentUser(request, business.business_id)
  const config = await loadOutboundBusinessConfig(supabase, business.business_id)
  const cap = await capability(supabase, config, currentUser?.id ?? null)
  const { craftsmanPhone: _hidden, ...publicCap } = cap
  return NextResponse.json(publicCap satisfies Capability)
}

export async function POST(request: NextRequest) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (business._impersonation) {
      return NextResponse.json({ error: 'Samtal kan inte startas i visningsläge.' }, { status: 403 })
    }

    const phoneLimit = checkPhoneApiRateLimit(business.business_id)
    if (!phoneLimit.allowed) return NextResponse.json({ error: phoneLimit.error }, { status: 429 })

    const supabase = getServerSupabase()
    const fuel = await checkFuelGate(supabase, business.business_id)
    if (!fuel.allowed) {
      return NextResponse.json({ error: 'Bränslet är slut eller kunde inte verifieras', code: fuel.reason }, { status: 402 })
    }

    let body: { customer_id?: unknown; deal_id?: unknown; project_id?: unknown }
    try { body = await request.json() } catch { body = {} }
    const customerId = typeof body.customer_id === 'string' ? body.customer_id : ''
    const dealId = typeof body.deal_id === 'string' && body.deal_id ? body.deal_id : null
    const projectId = typeof body.project_id === 'string' && body.project_id ? body.project_id : null
    if (!customerId) return NextResponse.json({ error: 'Kund saknas.' }, { status: 400 })

    const currentUser = await getCurrentUser(request, business.business_id)
    const config = await loadOutboundBusinessConfig(supabase, business.business_id)
    const cap = await capability(supabase, config, currentUser?.id ?? null)
    if (!cap.available || !cap.craftsmanPhone || !config?.assigned_phone_number) {
      return NextResponse.json({ error: cap.reason || 'Ring via Handymate är inte tillgängligt.' }, { status: 409 })
    }

    // ── Tenantverifiering av kund, deal och projekt ──
    const { data: customer, error: customerError } = await supabase
      .from('customer')
      .select('customer_id, name, phone_number')
      .eq('business_id', business.business_id)
      .eq('customer_id', customerId)
      .maybeSingle()
    if (customerError) throw customerError
    if (!customer) return NextResponse.json({ error: 'Kunden hittades inte.' }, { status: 404 })

    if (dealId) {
      const { data: deal, error: dealError } = await supabase
        .from('deal')
        .select('id')
        .eq('business_id', business.business_id)
        .eq('id', dealId)
        .maybeSingle()
      if (dealError) throw dealError
      if (!deal) return NextResponse.json({ error: 'Affären hittades inte.' }, { status: 404 })
    }

    if (projectId) {
      const { data: project, error: projectError } = await supabase
        .from('project')
        .select('project_id')
        .eq('business_id', business.business_id)
        .eq('project_id', projectId)
        .maybeSingle()
      if (projectError) throw projectError
      if (!project) return NextResponse.json({ error: 'Projektet hittades inte.' }, { status: 404 })
    }

    const customerPhone = toE164OrNull(customer.phone_number)
    if (!customerPhone) {
      return NextResponse.json({ error: 'Kunden saknar ett giltigt telefonnummer.' }, { status: 400 })
    }
    const craftsmanPhone = cap.craftsmanPhone
    if (craftsmanPhone === customerPhone) {
      return NextResponse.json(
        { error: 'Kundens nummer är samma som din egen mobil — samtalet kan inte kopplas ihop med sig självt.' },
        { status: 400 },
      )
    }
    const fromNumber = config.assigned_phone_number

    // ── Raden FÖRE 46elks-anropet: webhookarna måste ha något att landa i ──
    const recordingId = OUTBOUND_RECORDING_PREFIX + randomBytes(12).toString('hex')
    const { error: insertError } = await supabase
      .from('call_recording')
      .insert({
        recording_id: recordingId,
        business_id: business.business_id,
        customer_id: customer.customer_id,
        deal_id: dealId,
        project_id: projectId,
        initiated_by_user_id: currentUser?.id ?? null,
        source: 'phone',
        direction: 'outbound',
        phone_number: customerPhone,
        from_number: fromNumber,
        to_number: customerPhone,
        call_status: 'initiated',
        created_at: new Date().toISOString(),
      })
    if (insertError) {
      console.error('[voice/outbound/start] call_recording insert misslyckades:', insertError.message)
      return NextResponse.json({ error: 'Samtalet kunde inte registreras. Försök igen.' }, { status: 500 })
    }

    // ── 46elks: kunden är A-benet ──
    const creds = elksCredentials()!
    const webhookBase = `${APP_URL}/api/voice/outbound`
    const q = `recording_id=${encodeURIComponent(recordingId)}`
    let elksCallId: string | null = null
    try {
      const response = await fetch('https://api.46elks.com/a1/calls', {
        method: 'POST',
        headers: {
          Authorization: 'Basic ' + Buffer.from(`${creds.user}:${creds.password}`).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          from: fromNumber,
          to: customerPhone,
          voice_start: `${webhookBase}?${q}`,
          whenhangup: `${webhookBase}/hangup?${q}`,
          timeout: '30',
        }),
      })
      const result: any = await response.json().catch(() => ({}))
      if (!response.ok || !result?.id) {
        throw new Error(result?.message || `46elks svarade ${response.status}`)
      }
      elksCallId = String(result.id)
    } catch (elksErr: any) {
      console.error('[voice/outbound/start] 46elks-anropet misslyckades:', elksErr?.message || elksErr)
      await supabase
        .from('call_recording')
        .update({ call_status: 'failed' })
        .eq('recording_id', recordingId)
        .eq('business_id', business.business_id)
      return NextResponse.json(
        { error: 'Samtalet kunde inte startas hos telefonileverantören. Ring direkt från mobilen istället.' },
        { status: 502 },
      )
    }

    await supabase
      .from('call_recording')
      .update({ elks_recording_id: elksCallId })
      .eq('recording_id', recordingId)
      .eq('business_id', business.business_id)

    // Kundtidslinjen — samma form som quotes/send och send-invoice. Best effort.
    try {
      await supabase.from('customer_activity').insert({
        activity_id: 'act_' + Math.random().toString(36).slice(2, 11),
        business_id: business.business_id,
        customer_id: customer.customer_id,
        activity_type: 'call_outbound',
        title: 'Ringde via Handymate',
        description: `Utgående samtal till ${customer.name || customerPhone} från ${fromNumber}. Spelas in och sammanfattas av Lisa.`,
        metadata: { recording_id: recordingId, deal_id: dealId, project_id: projectId },
        created_by: 'user',
      })
    } catch (activityErr) {
      console.error('[voice/outbound/start] customer_activity misslyckades (non-blocking):', activityErr)
    }

    return NextResponse.json({ ok: true, recording_id: recordingId })
  } catch (error: any) {
    console.error('[voice/outbound/start] fel:', error)
    return NextResponse.json({ error: 'Samtalet kunde inte startas.' }, { status: 500 })
  }
}
