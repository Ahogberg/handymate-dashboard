import { NextRequest } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getNextLeadNumber } from '@/lib/numbering'

const ELKS_API_USER = process.env.ELKS_API_USER
const ELKS_API_PASSWORD = process.env.ELKS_API_PASSWORD

async function sendSMS(to: string, message: string, from: string): Promise<boolean> {
  if (!ELKS_API_USER || !ELKS_API_PASSWORD) return false
  try {
    const res = await fetch('https://api.46elks.com/a1/sms', {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${ELKS_API_USER}:${ELKS_API_PASSWORD}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        from: from.substring(0, 11),
        to,
        message,
      }),
    })
    return res.ok
  } catch {
    return false
  }
}

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

    if (!apiKey) {
      return Response.json({ error: 'API key required' }, { status: 401, headers: corsHeaders })
    }

    const supabase = getServerSupabase()

    // Validera nyckel → hämta business
    const { data: business } = await supabase
      .from('business_config')
      .select('business_id, business_name, phone_number')
      .eq('website_api_key', apiKey)
      .single()

    if (!business) {
      return Response.json({ error: 'Invalid API key' }, { status: 401, headers: corsHeaders })
    }

    const { name, phone, email, message } = await request.json()

    if (!name || !phone) {
      return Response.json({ error: 'name and phone required' }, { status: 400, headers: corsHeaders })
    }

    const cleanPhone = phone.replace(/\s/g, '')

    // Skapa eller hitta kund
    let customerId: string | null = null
    const { data: existing } = await supabase
      .from('customer')
      .select('customer_id')
      .eq('business_id', business.business_id)
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
          business_id: business.business_id,
          name,
          phone_number: cleanPhone,
          email: email || null,
        })
        .select('customer_id')
        .single()
      customerId = newCustomer?.customer_id || newId
    }

    // Hämta första pipeline-steget
    const { data: firstStage } = await supabase
      .from('pipeline_stages')
      .select('key')
      .eq('business_id', business.business_id)
      .order('sort_order', { ascending: true })
      .limit(1)
      .single()

    // Skapa lead
    const leadId = 'lead_' + Math.random().toString(36).substr(2, 9)
    let leadNumber: string | undefined
    try { leadNumber = await getNextLeadNumber(supabase, business.business_id) } catch { /* non-blocking */ }
    await supabase.from('leads').insert({
      lead_id: leadId,
      business_id: business.business_id,
      customer_id: customerId,
      name,
      phone: cleanPhone,
      email: email || null,
      notes: message || null,
      source: 'website_form',
      status: 'new',
      pipeline_stage_key: firstStage?.key || 'new_lead',
      score: 0,
      ...(leadNumber ? { lead_number: leadNumber } : {}),
    })

    // SMS till hantverkaren (non-blocking)
    if (business.phone_number) {
      const smsText = `🌐 Ny lead från hemsidan!\nNamn: ${name}\nTel: ${cleanPhone}${message ? `\n"${message.slice(0, 80)}"` : ''}\n→ app.handymate.se/dashboard/pipeline`
      sendSMS(business.phone_number, smsText, 'Handymate').catch(() => {})
    }

    // Fire automation event (non-blocking)
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'lead_received', business.business_id, {
        source: 'website_form',
        lead_id: leadId,
        customer_id: customerId,
        customer_name: name,
      })
    } catch { /* non-blocking */ }

    return Response.json({ success: true }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Leads intake error:', error)
    return Response.json({ error: 'Internal error' }, { status: 500, headers: corsHeaders })
  }
}
