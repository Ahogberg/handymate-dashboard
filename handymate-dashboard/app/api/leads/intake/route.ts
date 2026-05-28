import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createLeadAndDeal } from '@/lib/leads/golden-path'

/**
 * /api/leads/intake — Golden Path-route för lead-skapande.
 *
 * 2026-05-28: lead/deal/SMS/event-logiken extraherad till
 * lib/leads/golden-path.ts så email-webhook-approve kan reusa
 * exakt samma flöde. Routen är nu tunn — autentisering + payload-
 * parsing + delegation.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const apiKey = searchParams.get('api_key') || request.headers.get('x-api-key')
    const portalCode = searchParams.get('portal_code')

    if (!apiKey && !portalCode) {
      return Response.json({ error: 'API key or portal code required' }, { status: 401, headers: corsHeaders })
    }

    const supabase = getServerSupabase()

    let business: { business_id: string; business_name: string; phone_number: string | null } | null = null
    let leadSourceId: string | null = null
    let sourceName: string | null = null

    if (portalCode) {
      // Portal-kod autentisering via lead_sources
      const { data: source } = await supabase
        .from('lead_sources')
        .select('id, name, business_id')
        .eq('portal_code', portalCode)
        .eq('is_active', true)
        .single()

      if (source) {
        leadSourceId = source.id
        sourceName = source.name
        const { data: biz } = await supabase
          .from('business_config')
          .select('business_id, business_name, phone_number')
          .eq('business_id', source.business_id)
          .single()
        business = biz
      }
    }

    if (!business && apiKey) {
      // Lead source API-nyckel
      const { data: source } = await supabase
        .from('lead_sources')
        .select('id, name, business_id')
        .eq('api_key', apiKey)
        .eq('is_active', true)
        .single()

      if (source) {
        leadSourceId = source.id
        sourceName = source.name
        const { data: biz } = await supabase
          .from('business_config')
          .select('business_id, business_name, phone_number')
          .eq('business_id', source.business_id)
          .single()
        business = biz
      }
    }

    if (!business && apiKey) {
      // Fallback: befintlig website_api_key-autentisering
      const { data: biz } = await supabase
        .from('business_config')
        .select('business_id, business_name, phone_number')
        .eq('website_api_key', apiKey)
        .single()
      business = biz
    }

    if (!business) {
      return Response.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
    }

    const { name, phone, email, message, source_ref } = await request.json()

    if (!name || !phone) {
      return Response.json({ error: 'name and phone required' }, { status: 400, headers: corsHeaders })
    }

    await createLeadAndDeal(
      {
        businessId: business.business_id,
        businessPhoneNumber: business.phone_number,
        name,
        phone,
        email: email || null,
        message: message || null,
        source: sourceName || 'website_form',
        leadSourceId,
        sourceRef: source_ref || null,
      },
      supabase,
    )

    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Leads intake error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders })
  }
}
