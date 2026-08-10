import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { createLeadAndDeal } from '@/lib/leads/golden-path'

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
 *
 * Increment A2 (2026-08-10): rutten hade tidigare egen kund/lead-skaplogik
 * och nådde ALDRIG pipelinen — ingen deal, ingen ägar-SMS, svagare kund-
 * dedup (exakt telefon-match, ingen normalisering). Konvergerad till
 * Golden Path-helpern (lib/leads/golden-path.ts) så kund-dedup (normaliserad
 * telefon → e-post), lead, deal i new_inquiry, ägar-SMS och automation-
 * eventet sker via samma väg som /api/leads/intake och email-webhooken.
 *
 * category/estimated_value/lead_number saknar motsvarighet i Golden Path-
 * kontraktet (helpern hålls medvetet tunn, se dess header-kommentar) och
 * hanteras därför separat nedan.
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

    // Hantverkarens telefon för ägar-SMS — Golden Path skickar notis om satt.
    const { data: biz } = await supabase
      .from('business_config')
      .select('phone_number')
      .eq('business_id', source.business_id)
      .single()

    const noteParts: string[] = []
    if (service) noteParts.push(`Tjänst: ${service}`)
    if (description) noteParts.push(description)
    if (desired_date) noteParts.push(`Önskat datum: ${desired_date}`)
    if (address) noteParts.push(`Adress: ${address}`)

    // leads.source har en valid_source-CHECK (sql/v56_lead_pending_review.sql)
    // med ett fast, litet värde-set — källans fria namn (source.name, t.ex.
    // "Bygghemma") är INTE giltigt där. Samma mönster som email/inbound-
    // webhooken: CHECK-värdet 'website_form' i kolumnen, källans riktiga namn
    // bevaras via lead_source_id-FK:n (source.id) istället.
    const gp = await createLeadAndDeal(
      {
        businessId: source.business_id,
        businessPhoneNumber: biz?.phone_number || null,
        name,
        phone,
        email: email || null,
        message: noteParts.join('\n') || null,
        source: 'website_form',
        leadSourceId: source.id,
        sourceRef: source_ref || null,
      },
      supabase,
    )

    // Ett tyst deal-fel får aldrig se ut som success — logga (svälj inte).
    if (gp.dealError) {
      console.error('[lead-portal] Lead skapad men deal misslyckades:', gp.dealError)
    }

    // category/estimated_value ingår inte i Golden Path-kontraktet — sätts
    // här i samma svep som vi läser lead_number till klientsvaret.
    const leadExtra: Record<string, unknown> = {}
    const resolvedCategory = category || (source as any).default_category || null
    if (resolvedCategory) leadExtra.category = resolvedCategory
    if (estimated_value) leadExtra.estimated_value = parseInt(estimated_value)

    let leadNumber: string | null = null
    if (Object.keys(leadExtra).length > 0) {
      const { data: updated, error: extraErr } = await supabase
        .from('leads')
        .update(leadExtra)
        .eq('lead_id', gp.leadId)
        .select('lead_number')
        .maybeSingle()
      if (extraErr) console.error('[lead-portal] Kunde inte sätta category/estimated_value:', extraErr.message)
      leadNumber = updated?.lead_number ?? null
    } else {
      const { data: leadRow } = await supabase
        .from('leads')
        .select('lead_number')
        .eq('lead_id', gp.leadId)
        .maybeSingle()
      leadNumber = leadRow?.lead_number ?? null
    }

    // Adress på kunden — sätts bara om den saknas, så en dedupad kunds
    // befintliga adress aldrig skrivs över.
    if (address) {
      const { data: custRow } = await supabase
        .from('customer')
        .select('address_line')
        .eq('customer_id', gp.customerId)
        .maybeSingle()
      if (custRow && !custRow.address_line) {
        await supabase.from('customer').update({ address_line: address }).eq('customer_id', gp.customerId)
      }
    }

    return NextResponse.json({
      success: true,
      lead_id: gp.leadId,
      lead_number: leadNumber,
    }, { headers: corsHeaders })
  } catch (error: any) {
    console.error('Portal POST error:', error)
    return NextResponse.json({ error: 'Internt fel' }, { status: 500, headers: corsHeaders })
  }
}
