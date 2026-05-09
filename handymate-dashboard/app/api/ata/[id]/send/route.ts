import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'

/**
 * POST /api/ata/[id]/send — Skicka ÄTA till kund för signering
 * Body: { method: 'sms' | 'email', to?: string }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const business = await getAuthenticatedBusiness(request)
    if (!business) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServerSupabase()
    const body = await request.json()
    const { method = 'sms', to } = body

    // Two-query lookup — project_change.project_id och project.customer_id
    // är båda oconstrained TEXT (TD-7-pattern). Nested select föll tyst på
    // PGRST200 och kastade generisk "ÄTA hittades inte" oavsett rotorsak.
    const { data: ata, error: ataError } = await supabase
      .from('project_change')
      .select('*')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .maybeSingle()

    if (ataError) {
      console.error('[ata/send] fetch ata error:', ataError)
      return NextResponse.json(
        {
          error: ataError.message,
          code: ataError.code,
          details: ataError.details,
          hint: ataError.hint,
        },
        { status: 500 },
      )
    }
    if (!ata) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    if (!ata.sign_token) {
      return NextResponse.json({ error: 'ÄTA saknar signeringstoken' }, { status: 400 })
    }

    // Resolva project + customer separat
    let project: { name: string | null; customer_id: string | null } | null = null
    if (ata.project_id) {
      const { data: p, error: pErr } = await supabase
        .from('project')
        .select('name, customer_id')
        .eq('project_id', ata.project_id)
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (pErr) {
        console.error('[ata/send] fetch project error:', pErr)
      } else {
        project = p
      }
    }

    let customer: { name: string | null; phone_number: string | null; email: string | null } | null = null
    const customerId = ata.customer_id || project?.customer_id || null
    if (customerId) {
      const { data: c, error: cErr } = await supabase
        .from('customer')
        .select('name, phone_number, email')
        .eq('customer_id', customerId)
        .eq('business_id', business.business_id)
        .maybeSingle()
      if (cErr) {
        console.error('[ata/send] fetch customer error:', cErr)
      } else {
        customer = c
      }
    }

    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.handymate.se'

    // Föredra portal-URL med djuplänk till ÄTA-tab, fall back till direkt sign-URL
    let signUrl = `${baseUrl}/api/ata/sign/${ata.sign_token}`
    if (customerId) {
      const { getOrCreatePortalLink } = await import('@/lib/portal-link')
      const portalUrl = await getOrCreatePortalLink(supabase, customerId, 'projects')
      if (portalUrl) signUrl = portalUrl
    }

    // Hämta assigned_phone_number för svarsnummer
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('assigned_phone_number')
      .eq('business_id', business.business_id)
      .single()

    const suffix = buildSmsSuffix(business.business_name || 'Handymate', bizConfig?.assigned_phone_number)

    // Send via SMS or email
    if (method === 'sms') {
      const rawPhone = to || customer?.phone_number
      if (!rawPhone) {
        return NextResponse.json({ error: 'Inget telefonnummer att skicka till' }, { status: 400 })
      }

      // Normalisera till E.164 — 46elks kräver det formatet. Lokal form
      // (0708...) failar tyst i deras validering och kraschen sväljs i
      // try/catch nedan. Samma TD-14-pattern som on-my-way-fixen.
      const phone = normalizeSwedishPhone(rawPhone)
      if (!phone || !phone.startsWith('+')) {
        return NextResponse.json(
          { error: `Ogiltigt telefonnummer: "${rawPhone}"` },
          { status: 400 },
        )
      }

      // Kund-vänlig text — använd förnamn + business-namn när tillgängliga,
      // graceful fallback annars.
      const firstName = customer?.name ? customer.name.split(' ')[0] : ''
      const companyName = business.business_name || 'Handymate'
      const greeting = firstName ? `Hej ${firstName}` : 'Hej'
      const message = `${greeting}, ${companyName} har skickat ett förslag på tilläggsarbete på ditt projekt. Granska och svara: ${signUrl}\n${suffix}`

      // SMS-anrop FÖRE UPDATE — om det failar rör vi inte DB. Tidigare
      // ordning (UPDATE först, SMS i try/catch) ljög för frontend och
      // gjorde det omöjligt att retry:a utan att resetta status.
      let smsOk = false
      let smsErrorDetail: string | null = null
      let smsStatus: number | null = null
      try {
        const smsRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL || ''}/api/sms/send`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            cookie: request.headers.get('cookie') || '',
          },
          body: JSON.stringify({
            to: phone,
            message,
            customer_id: customerId,
          }),
        })

        smsStatus = smsRes.status
        smsOk = smsRes.ok
        if (!smsRes.ok) {
          smsErrorDetail = await smsRes.text().catch(() => 'unknown')
          console.error('[ata/send] sms-call HTTP error:', {
            status: smsRes.status,
            body: smsErrorDetail.substring(0, 300),
            to: phone,
          })
        }
      } catch (smsErr: any) {
        smsErrorDetail = smsErr?.message || 'fetch exception'
        console.error('[ata/send] sms-call exception:', smsErr)
      }

      if (!smsOk) {
        return NextResponse.json(
          {
            error: 'SMS kunde inte skickas',
            sms_status: smsStatus,
            sms_detail: smsErrorDetail,
          },
          { status: 500 },
        )
      }

      // SMS bekräftat skickat → uppdatera ÄTA
      const { error: updateErr } = await supabase
        .from('project_change')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to_phone: phone,
        })
        .eq('change_id', params.id)

      if (updateErr) {
        // SMS gick iväg men UPDATE failade — logga, men returnera 200
        // eftersom kunden faktiskt fått SMS:et. Hantverkaren kan retry
        // efter manuell DB-fix om det blir problem.
        console.error('[ata/send] update after sms-success failed:', updateErr)
      }

    } else if (method === 'email') {
      const email = to || customer?.email
      if (!email) {
        return NextResponse.json({ error: 'Ingen e-postadress att skicka till' }, { status: 400 })
      }

      // TODO: Implement email sending when email service is ready
      // For now, just update status
      await supabase
        .from('project_change')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to_email: email,
        })
        .eq('change_id', params.id)
    }

    // Fire event (non-blocking)
    try {
      const { fireEvent } = await import('@/lib/automation-engine')
      await fireEvent(supabase, 'ata_sent', business.business_id, {
        change_id: params.id,
        project_id: ata.project_id,
        ata_number: ata.ata_number,
        total: ata.total,
        customer_name: customer?.name,
      })
    } catch { /* non-blocking */ }

    return NextResponse.json({ success: true, signUrl })
  } catch (error: any) {
    console.error('POST /api/ata/[id]/send error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
