import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/ata/sign/[token] — Hämta ÄTA via publik signeringslänk (ingen auth)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token

    if (!token) {
      return NextResponse.json({ error: 'Token saknas' }, { status: 400 })
    }

    // Fetch ÄTA by sign_token
    const { data: ata, error } = await supabase
      .from('project_change')
      .select('*')
      .eq('sign_token', token)
      .single()

    if (error || !ata) {
      return NextResponse.json({ error: 'ÄTA hittades inte eller länken är ogiltig' }, { status: 404 })
    }

    // Fetch project + customer
    const { data: project } = await supabase
      .from('project')
      .select('name, customer_id, customer:customer_id(name, phone_number, email, address_line)')
      .eq('project_id', ata.project_id)
      .single()

    // Fetch business info
    const { data: business } = await supabase
      .from('business_config')
      .select('business_name, contact_name, contact_email, phone_number, org_number')
      .eq('business_id', ata.business_id)
      .single()

    const alreadySigned = ata.status === 'signed' && ata.signed_at

    return NextResponse.json({
      ata: {
        change_id: ata.change_id,
        ata_number: ata.ata_number,
        change_type: ata.change_type,
        description: ata.description,
        items: ata.items || [],
        total: ata.total,
        status: ata.status,
        signed_at: ata.signed_at,
        signed_by_name: ata.signed_by_name,
        notes: ata.notes,
        created_at: ata.created_at,
      },
      project: {
        name: (project as any)?.name || '',
        customer: (project as any)?.customer || null,
      },
      business: {
        name: business?.business_name || '',
        contact_name: business?.contact_name || '',
        email: business?.contact_email || '',
        phone: business?.phone_number || '',
        org_number: business?.org_number || '',
      },
      alreadySigned,
    })
  } catch (error: any) {
    console.error('GET /api/ata/sign/[token] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

/**
 * POST /api/ata/sign/[token] — Signera eller avböj ÄTA (ingen auth)
 * Body: { action: 'sign' | 'decline', name, signature_data, reason }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const supabase = getServerSupabase()
    const token = params.token
    const body = await request.json()
    const { action = 'sign', name, signature_data, reason } = body

    // Fetch ÄTA
    const { data: ata, error: fetchError } = await supabase
      .from('project_change')
      .select('change_id, business_id, project_id, customer_id, status, signed_at, total, ata_number')
      .eq('sign_token', token)
      .single()

    if (fetchError || !ata) {
      return NextResponse.json({ error: 'ÄTA hittades inte eller länken är ogiltig' }, { status: 404 })
    }

    if (ata.status === 'signed' && ata.signed_at) {
      return NextResponse.json({ error: 'ÄTA är redan signerad' }, { status: 400 })
    }

    if (ata.status === 'declined') {
      return NextResponse.json({ error: 'ÄTA är redan avböjd' }, { status: 400 })
    }

    // Decline
    if (action === 'decline') {
      const { error: updateError } = await supabase
        .from('project_change')
        .update({
          status: 'declined',
          declined_at: new Date().toISOString(),
          declined_reason: reason || null,
        })
        .eq('sign_token', token)

      if (updateError) throw updateError

      return NextResponse.json({ success: true })
    }

    // Sign
    if (!name || !signature_data) {
      return NextResponse.json({ error: 'Namn och signatur krävs' }, { status: 400 })
    }

    const ip =
      request.headers.get('x-forwarded-for') ||
      request.headers.get('x-real-ip') ||
      'unknown'

    const { error: updateError } = await supabase
      .from('project_change')
      .update({
        status: 'signed',
        signed_at: new Date().toISOString(),
        signed_by_name: name,
        signed_by_ip: ip,
        signature_data,
      })
      .eq('sign_token', token)

    if (updateError) throw updateError

    // Fire event (non-blocking)
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'ata_signed', ata.business_id, {
        change_id: ata.change_id,
        project_id: ata.project_id,
        ata_number: ata.ata_number,
        total: ata.total,
        signed_by: name,
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('POST /api/ata/sign/[token] error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
