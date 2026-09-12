import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { IntakeError, receiveIntake, completeIntake, intakeReply } from '@/lib/leads/durable-intake'
import { portalIntakeInput } from '@/lib/leads/portal-intake'
import { checkPublicRateLimitDb } from '@/lib/rate-limit-db'
import { loadAttribution } from '@/lib/branding/attribution'

export const dynamic = 'force-dynamic'

const LEAD_PORTAL_HISTORY_DAYS = 180
const LEAD_PORTAL_MAX_ROWS = 200
const LEAD_PORTAL_MAX_POSTS_PER_HOUR = 30

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Idempotency-Key',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

/**
 * GET /api/lead-portal/[code] — Hämta portal-info + leads för leverantören
 */
export async function GET(request: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    const supabase = getServerSupabase()
    const { code } = params

    // Hämta källa med business-info
    const { data: source, error: srcErr } = await supabase
      .from('lead_sources')
      .select('id, name, business_id, portal_code, is_active, created_at, default_category')
      .eq('portal_code', code)
      .eq('is_active', true)
      .single()

    if (srcErr || !source) {
      return NextResponse.json({ error: 'Portal hittades inte' }, { status: 404, headers: corsHeaders })
    }

    // Hämta business-info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, logo_url, contact_name')
      .eq('business_id', source.business_id)
      .single()

    // Hämta leads för denna källa. Tenant-svepet 2026-09-01: tidigare HELA
    // historiken med full PII till varje bärare av koden — nu ett fönster
    // (senaste 180 dagarna, högst 200 rader) och alltid företagsfiltrerat.
    const sedan = new Date(Date.now() - LEAD_PORTAL_HISTORY_DAYS * 86_400_000).toISOString()
    const { data: leads } = await supabase
      .from('leads')
      .select('lead_id, name, phone, email, status, notes, source, source_ref, created_at, estimated_value, pipeline_stage_key, category')
      .eq('business_id', source.business_id)
      .eq('lead_source_id', source.id)
      .gte('created_at', sedan)
      .order('created_at', { ascending: false })
      .limit(LEAD_PORTAL_MAX_ROWS)

    // Statistik
    const allLeads = leads || []
    const stats = {
      total: allLeads.length,
      contacted: allLeads.filter((l: { status: string }) => l.status !== 'new').length,
      won: allLeads.filter((l: { status: string }) => l.status === 'won').length,
    }

    // "Skickat via Handymate"-stämpeln i sidfoten. Business-selecten ovan
    // är en kolumnlista (får inte utökas med attribution_link_enabled före
    // sql/v202) — helperns fallback-säkra query, en gång per visning.
    const attribution = await loadAttribution(supabase, source.business_id)

    return NextResponse.json({
      source: {
        id: source.id,
        name: source.name,
        portal_code: source.portal_code,
        default_category: (source as any).default_category || null,
      },
      business: {
        business_name: business?.business_name || 'Okänt företag',
        logo_url: business?.logo_url || null,
        contact_name: business?.contact_name || null,
      },
      leads: allLeads,
      stats,
      attribution,
    }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Portal GET error:', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500, headers: corsHeaders })
  }
}

/** Public source-code authorization; durable receipt precedes all entity writes. */
export async function POST(request: NextRequest, props: { params: Promise<{ code: string }> }) {
  const params = await props.params;
  try {
    const supabase = getServerSupabase()
    const { code } = params

    // Hämta källa
    const { data: source } = await supabase
      .from('lead_sources')
      .select('id, name, business_id, is_active, default_category')
      .eq('portal_code', code)
      .eq('is_active', true)
      .single()

    if (!source) {
      return NextResponse.json({ error: 'Portal hittades inte eller är inaktiv' }, { status: 404, headers: corsHeaders })
    }

    // Tenant-svepet 2026-09-01: varje POST skapar kund + lead + affär och
    // skickar ägar-SMS. Utan tak kunde en läckt kod fylla pipelinen och
    // tömma SMS-kvoten. Fail-closed per källa (koden), inte per IP.
    const rate = await checkPublicRateLimitDb(`lead-portal:source:${source.id}`, {
      maxRequests: LEAD_PORTAL_MAX_POSTS_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    })
    if (!rate.allowed) {
      return NextResponse.json({ error: 'För många leads på kort tid — försök igen om en stund' }, { status: 429, headers: corsHeaders })
    }

    const key = request.headers.get('Idempotency-Key')
    if (!key) return NextResponse.json({ error: 'Uppdatera sidan innan du skickar förfrågan.' }, { status: 428, headers: corsHeaders })
    let body: unknown
    try { body = await request.json() } catch { throw new IntakeError('Förfrågan har ogiltigt format.', 400) }
    const input = portalIntakeInput(body, source.id)
    const received = await receiveIntake(supabase, source.business_id, `portal:${source.id}`, key, input, 'receive_portal_lead_intake')
    let receipt
    try { receipt = await completeIntake(supabase, source.business_id, received.id) }
    catch {
      return NextResponse.json({ success: false, received: true, receipt_id: received.id,
        state: 'received', message: 'Förfrågan är mottagen. Kontrollera resultatet genom att försöka igen.' },
        { status: 202, headers: corsHeaders })
    }
    // A failed number read does not undo a completed transaction or create a new lead.
    let leadNumber: string | null = null
    if (receipt.state === 'completed') {
      const { data: lead } = await supabase.from('leads').select('lead_number')
        .eq('business_id', source.business_id).eq('lead_id', receipt.lead_id).maybeSingle()
      leadNumber = lead?.lead_number ?? null
    }
    return NextResponse.json({ ...intakeReply(receipt), lead_number: leadNumber },
      { status: receipt.state === 'completed' ? 200 : 202, headers: corsHeaders })
  } catch (error: any) {
    if (error instanceof IntakeError) return NextResponse.json({ error: error.message }, { status: error.status, headers: corsHeaders })
    console.error('Portal POST error:', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500, headers: corsHeaders })
  }
}
