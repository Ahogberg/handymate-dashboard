import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { buildSmsSuffix } from '@/lib/sms-reply-number'

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

    // Fetch the ÄTA with project + customer info
    const { data: ata, error: ataError } = await supabase
      .from('project_change')
      .select('*, project:project_id(name, customer_id, customer:customer_id(name, phone_number, email))')
      .eq('change_id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (ataError || !ata) {
      return NextResponse.json({ error: 'ÄTA hittades inte' }, { status: 404 })
    }

    if (!ata.sign_token) {
      return NextResponse.json({ error: 'ÄTA saknar signeringstoken' }, { status: 400 })
    }

    const project = ata.project as any
    const customer = project?.customer as any
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://app.handymate.se'

    // Föredra portal-URL med djuplänk till ÄTA-tab, fall back till direkt sign-URL
    let signUrl = `${baseUrl}/api/ata/sign/${ata.sign_token}`
    const customerId = ata.customer_id || project?.customer_id
    if (customerId) {
      const { getOrCreatePortalLink } = await import('@/lib/portal-link')
      const portalUrl = await getOrCreatePortalLink(supabase, customerId, 'changes')
      if (portalUrl) signUrl = portalUrl
    }

    const ataLabel = `ÄTA-${ata.ata_number || '?'}`
    const projectName = project?.name || 'Projekt'

    // Hämta assigned_phone_number för svarsnummer
    const { data: bizConfig } = await supabase
      .from('business_config')
      .select('assigned_phone_number')
      .eq('business_id', business.business_id)
      .single()

    const suffix = buildSmsSuffix(business.business_name || 'Handymate', bizConfig?.assigned_phone_number)

    // Send via SMS or email
    if (method === 'sms') {
      const phone = to || customer?.phone_number
      if (!phone) {
        return NextResponse.json({ error: 'Inget telefonnummer att skicka till' }, { status: 400 })
      }

      const message = `Hej! Du har fått ${ataLabel} för ${projectName} att granska och signera. Klicka här: ${signUrl}\n${suffix}`

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
            customer_id: ata.customer_id || project?.customer_id,
          }),
        })

        if (!smsRes.ok) {
          console.error('SMS send failed:', await smsRes.text())
        }
      } catch (smsErr) {
        console.error('SMS send error:', smsErr)
      }

      // Update ÄTA
      await supabase
        .from('project_change')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          sent_to_phone: phone,
        })
        .eq('change_id', params.id)

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
