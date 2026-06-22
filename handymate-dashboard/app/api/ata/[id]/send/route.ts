import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { normalizeSwedishPhone } from '@/lib/phone-normalize'
import { sendSmsViaElks } from '@/lib/sms-send'

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

    // Send via SMS or email
    if (method === 'sms') {
      const rawPhone = to || customer?.phone_number
      if (!rawPhone) {
        return NextResponse.json({ error: 'Inget telefonnummer att skicka till' }, { status: 400 })
      }

      // E.164-validering här i routen ger snabb 400 vid garbage-input.
      // sendSmsViaElks normaliserar igen för säkerhet (idempotent).
      const phone = normalizeSwedishPhone(rawPhone)
      if (!phone || !phone.startsWith('+')) {
        return NextResponse.json(
          { error: `Ogiltigt telefonnummer: "${rawPhone}"` },
          { status: 400 },
        )
      }

      // Företagsnamn KRÄVS — kunden får aldrig ett SMS som refererar till
      // ett annat företagsnamn än hantverkarens egna. Om business_name
      // saknas i business_config: blockera tills inställning är ifylld.
      const companyName = (business.business_name || '').trim()
      if (!companyName) {
        return NextResponse.json(
          {
            error: 'Företagsnamn saknas i inställningar — fyll i under Inställningar → Företag innan du skickar ÄTA',
            field: 'business_name',
          },
          { status: 400 },
        )
      }

      // Kort kund-text — under 160 tecken så det inte blir 2 SMS av misstag.
      // Förnamn dynamiskt; tom fallback om customer.name saknas.
      const firstName = customer?.name ? customer.name.split(' ')[0] : ''
      const greeting = firstName ? `Hej ${firstName}!` : 'Hej!'
      const message = `${greeting} ${companyName} har ett förslag på tilläggsarbete: ${signUrl}`

      // Direkt 46elks-anrop via shared helper. Tidigare intern fetch mot
      // /api/sms/send failade med 'Failed to parse URL' (relativ URL
      // fungerar inte server-side i Next-routes).
      const smsResult = await sendSmsViaElks({
        supabase,
        businessId: business.business_id,
        businessName: business.business_name,
        to: phone,
        message,
        customerId,
        relatedId: ata.change_id,
        messageType: 'ata_send',
      })

      if (!smsResult.success) {
        return NextResponse.json(
          {
            error: smsResult.error || 'SMS kunde inte skickas',
            sms_status: smsResult.status,
          },
          { status: 500 },
        )
      }

      // SMS bekräftat skickat (sms_log INSERT redan gjord av helpern) →
      // uppdatera ÄTA-status. Om UPDATE failar har kunden ändå fått SMS:et;
      // logga warning men returnera 200 för att inte ljuga om leveransen.
      const { error: updateErr } = await supabase
        .from('project_change')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to_phone: phone,
        })
        .eq('change_id', params.id)

      if (updateErr) {
        console.error('[ata/send] update after sms-success failed:', updateErr)
      }

    } else if (method === 'email') {
      const email = to || customer?.email
      if (!email) {
        return NextResponse.json({ error: 'Ingen e-postadress att skicka till' }, { status: 400 })
      }

      // E-postutskick av ÄTA är inte implementerat än. Markera ALDRIG som
      // skickad utan att kunden faktiskt fått länken — det dolde tidigare ett
      // tyst leveransfel. Be användaren skicka via SMS tills e-post finns.
      return NextResponse.json(
        { error: 'E-postutskick av ÄTA är inte tillgängligt än — skicka via SMS istället.' },
        { status: 501 },
      )
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
