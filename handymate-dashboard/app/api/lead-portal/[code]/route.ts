import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getNextLeadNumber } from '@/lib/numbering'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders })
}

/**
 * GET /api/lead-portal/[code] — Hämta portal-info + leads för leverantören
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
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

    // Hämta leads för denna källa
    const { data: leads } = await supabase
      .from('leads')
      .select('lead_id, name, phone, email, status, notes, source, source_ref, created_at, estimated_value, pipeline_stage_key, category')
      .eq('lead_source_id', source.id)
      .order('created_at', { ascending: false })

    // Statistik
    const allLeads = leads || []
    const stats = {
      total: allLeads.length,
      contacted: allLeads.filter((l: { status: string }) => l.status !== 'new').length,
      won: allLeads.filter((l: { status: string }) => l.status === 'won').length,
    }

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
    }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Portal GET error:', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500, headers: corsHeaders })
  }
}

/**
 * POST /api/lead-portal/[code] — Skicka nytt lead via portalen
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { code: string } }
) {
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

    const body = await request.json()
    const { name, phone, email, service, category, description, address, estimated_value, desired_date, source_ref } = body

    if (!name || !phone) {
      return NextResponse.json({ error: 'Namn och telefon krävs' }, { status: 400, headers: corsHeaders })
    }

    const cleanPhone = phone.replace(/\s/g, '')

    // Skapa eller hitta kund
    let customerId: string | null = null
    const { data: existing } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', source.business_id)
      .eq('phone_number', cleanPhone)
      .maybeSingle()

    if (existing) {
      customerId = existing.customer_id
    } else {
      const newId = 'cust_' + Math.random().toString(36).substr(2, 9)
      const { data: newCustomer } = await supabase
        .from('customer')
        .insert({
          customer_id: newId,
          business_id: source.business_id,
          name,
          phone_number: cleanPhone,
          email: email || null,
          address_line: address || null,
        })
        .select('customer_id')
        .single()
      customerId = newCustomer?.customer_id || newId
    }

    // Hämta första pipeline-steget
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('key')
      .eq('business_id', source.business_id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single()

    // Skapa lead
    const leadId = 'lead_' + Math.random().toString(36).substr(2, 9)
    let leadNumber: string | undefined
    try { leadNumber = await getNextLeadNumber(supabase, source.business_id) } catch { /* non-blocking */ }

    const noteParts: string[] = []
    if (service) noteParts.push(`Tjänst: ${service}`)
    if (description) noteParts.push(description)
    if (desired_date) noteParts.push(`Önskat datum: ${desired_date}`)
    if (address) noteParts.push(`Adress: ${address}`)

    const { error: insertErr } = await supabase.from('leads').insert({
      lead_id: leadId,
      business_id: source.business_id,
      customer_id: customerId,
      name,
      phone: cleanPhone,
      email: email || null,
      notes: noteParts.join('\n') || null,
      source: source.name.toLowerCase(),
      status: 'new',
      pipeline_stage_key: firstStage?.key || 'new_lead',
      score: 0,
      estimated_value: estimated_value ? parseInt(estimated_value) : null,
      lead_source_id: source.id,
      source_ref: source_ref || null,
      category: category || (source as any).default_category || null,
      ...(leadNumber ? { lead_number: leadNumber } : {}),
    })

    if (insertErr) {
      console.error('Portal lead insert error:', insertErr)
      return NextResponse.json({ error: 'Kunde inte skapa lead' }, { status: 500, headers: corsHeaders })
    }

    // Fire automation event (non-blocking)
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'lead_received', source.business_id, {
        source: source.name,
        lead_id: leadId,
        customer_id: customerId,
        customer_name: name,
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      lead_number: leadNumber || null,
    }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Portal POST error:', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500, headers: corsHeaders })
  }
}
