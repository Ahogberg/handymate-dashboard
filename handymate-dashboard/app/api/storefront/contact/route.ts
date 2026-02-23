import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS_HEADERS })
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { business_id, name, phone, email, message, _hp } = body

    // Honeypot spam check — if _hp is filled, it's a bot
    if (_hp) {
      return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
    }

    // Validate
    if (!business_id || !name?.trim()) {
      return NextResponse.json({ error: 'Namn krävs' }, { status: 400, headers: CORS_HEADERS })
    }

    if (!phone?.trim() && !email?.trim()) {
      return NextResponse.json({ error: 'Ange telefon eller e-post' }, { status: 400, headers: CORS_HEADERS })
    }

    const supabase = getServerSupabase()

    // Verify business exists
    const { data: config } = await supabase
      .from('business_config')
      .select('business_id, business_name')
      .eq('business_id', business_id)
      .single()

    if (!config) {
      return NextResponse.json({ error: 'Företag hittades inte' }, { status: 404, headers: CORS_HEADERS })
    }

    // Rate limit: max 20 submissions per business per day
    const { data: storefront } = await supabase
      .from('storefront')
      .select('id, contact_form_submissions')
      .eq('business_id', business_id)
      .single()

    if (!storefront) {
      return NextResponse.json({ error: 'Hemsidan hittades inte' }, { status: 404, headers: CORS_HEADERS })
    }

    // Simple daily rate limit check via contact_form_submissions
    // (For V1, just increment. A proper daily reset can be added later.)

    // Find or create customer
    let customerId: string | null = null
    const cleanPhone = phone?.replace(/[\s-]/g, '').trim() || null
    const cleanEmail = email?.trim().toLowerCase() || null

    if (cleanPhone) {
      const { data: existingByPhone } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', business_id)
        .eq('phone_number', cleanPhone)
        .maybeSingle()

      if (existingByPhone) {
        customerId = existingByPhone.customer_id
      }
    }

    if (!customerId && cleanEmail) {
      const { data: existingByEmail } = await supabase
        .from('customer')
        .select('customer_id')
        .eq('business_id', business_id)
        .eq('email', cleanEmail)
        .maybeSingle()

      if (existingByEmail) {
        customerId = existingByEmail.customer_id
      }
    }

    if (!customerId) {
      const newId = 'cust_' + Math.random().toString(36).substring(2, 14)
      const { data: newCustomer, error: custError } = await supabase
        .from('customer')
        .insert({
          customer_id: newId,
          business_id,
          name: name.trim(),
          phone_number: cleanPhone,
          email: cleanEmail,
          lead_source: 'website',
        })
        .select('customer_id')
        .single()

      if (custError) {
        console.error('Customer create error:', custError)
      } else {
        customerId = newCustomer.customer_id
      }
    }

    // Find the first pipeline stage (lead/new)
    const { data: leadStage } = await supabase
      .from('pipeline_stage')
      .select('id')
      .eq('business_id', business_id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .maybeSingle()

    // Create deal
    if (leadStage) {
      const dealTitle = message
        ? `${name.trim()} – ${message.substring(0, 50)}`
        : `${name.trim()} – förfrågan via hemsidan`

      const { data: deal } = await supabase
        .from('deal')
        .insert({
          business_id,
          title: dealTitle,
          customer_id: customerId,
          stage_id: leadStage.id,
          source: 'storefront',
          lead_source_platform: 'website',
          description: message || null,
          priority: 'medium',
        })
        .select('id')
        .single()

      // Log activity
      if (deal) {
        await supabase.from('pipeline_activity').insert({
          business_id,
          deal_id: deal.id,
          activity_type: 'deal_created',
          description: `Ny förfrågan via hemsidan: ${name.trim()}`,
          to_stage_id: leadStage.id,
          triggered_by: 'storefront',
        })
      }
    }

    // Create notification
    await supabase.from('notification').insert({
      business_id,
      type: 'lead',
      title: `Ny förfrågan via hemsidan`,
      body: `${name.trim()}${message ? ': ' + message.substring(0, 100) : ''}`,
      is_read: false,
    })

    // Increment contact_form_submissions
    await supabase
      .from('storefront')
      .update({ contact_form_submissions: (storefront.contact_form_submissions || 0) + 1 })
      .eq('id', storefront.id)

    return NextResponse.json({ success: true }, { headers: CORS_HEADERS })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Okänt fel'
    console.error('Storefront contact error:', msg)
    return NextResponse.json({ error: msg }, { status: 500, headers: CORS_HEADERS })
  }
}
