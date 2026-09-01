import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, getAdminSupabase } from '@/lib/admin-auth'
import {
  AGREEMENT_MISSING_MESSAGE,
  hasAcceptedCurrentAgreement,
  sendAgreementRequestEmail,
} from '@/lib/partners/agreement'

/**
 * GET /api/admin/partners — Lista alla partners
 */
export async function GET(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()

  const { data: partners, error } = await supabase
    .from('partners')
    .select('*')
    .order('created_at', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ partners: partners || [] })
}

/**
 * PATCH /api/admin/partners — Uppdatera partnerstatus
 * Body: { id, action: 'approve' | 'suspend' | 'reactivate' | 'send_agreement' }
 *
 * approve är spärrat (409) tills partnern har loggad acceptans av gällande
 * Partneravtal (P0-9, 2026-09-01). send_agreement mejlar den signerade
 * engångslänken — fungerar för både väntande och aktiva partners.
 */
export async function PATCH(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = getAdminSupabase()
  const { id, action } = await request.json()

  if (!id || !action) {
    return NextResponse.json({ error: 'Saknar id eller action' }, { status: 400 })
  }

  const { data: partner } = await supabase
    .from('partners')
    .select('id, email, name, referral_code, referral_url, status, agreement_version')
    .eq('id', id)
    .single()

  if (!partner) {
    return NextResponse.json({ error: 'Partner hittades inte' }, { status: 404 })
  }

  let update: Record<string, unknown> = {}

  switch (action) {
    case 'send_agreement': {
      if (hasAcceptedCurrentAgreement(partner)) {
        return NextResponse.json({ error: 'Partnern har redan accepterat gällande avtal' }, { status: 400 })
      }
      const result = await sendAgreementRequestEmail(partner)
      if (!result.sent) {
        return NextResponse.json({ error: result.error || 'Mejlet kunde inte skickas' }, { status: 500 })
      }
      return NextResponse.json({ success: true, action, partner_id: id })
    }

    case 'approve':
      if (!hasAcceptedCurrentAgreement(partner)) {
        return NextResponse.json({ error: AGREEMENT_MISSING_MESSAGE, code: 'agreement_missing' }, { status: 409 })
      }
      update = {
        status: 'active',
        approved_at: new Date().toISOString(),
        approved_by: 'admin',
      }
      // Send welcome email
      try {
        const { Resend } = await import('resend')
        const resendKey = process.env.RESEND_API_KEY
        if (resendKey) {
          const resend = new Resend(resendKey)
          await resend.emails.send({
            from: 'Handymate <noreply@handymate.se>',
            to: [partner.email],
            subject: 'Välkommen som Handymate-partner!',
            html: `
              <h2>Ditt partnerkonto är godkänt!</h2>
              <p>Hej ${partner.name}!</p>
              <p>Ditt konto har godkänts och du kan nu börja hänvisa hantverkare till Handymate.</p>
              <p><strong>Din referralkod:</strong> ${partner.referral_code}</p>
              <p><strong>Din referrallänk:</strong> <a href="${partner.referral_url}">${partner.referral_url}</a></p>
              <p>Dina exakta provisionsvillkor ser du i partnerportalen — provisionen räknas på dina kunders faktiska betalningar.</p>
              <br>
              <p><a href="https://app.handymate.se/partners/login">Logga in i partnerportalen →</a></p>
            `,
          })
        }
      } catch { /* non-blocking */ }
      break

    case 'suspend':
      update = { status: 'suspended' }
      break

    case 'reactivate':
      update = { status: 'active' }
      break

    default:
      return NextResponse.json({ error: `Okänd action: ${action}` }, { status: 400 })
  }

  const { error } = await supabase
    .from('partners')
    .update(update)
    .eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, action, partner_id: id })
}
