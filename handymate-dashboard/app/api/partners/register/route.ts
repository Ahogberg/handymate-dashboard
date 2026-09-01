import { NextRequest, NextResponse } from 'next/server'
import { registerPartner } from '@/lib/partners/auth'
import { signApproveToken } from '@/lib/partners/approve-token'
import { AGREEMENT_VERSION, readAgreementHash, captureRequestIp } from '@/lib/partners/agreement'
import { checkPublicRateLimitDb, hashClientIp } from '@/lib/rate-limit-db'

const PARTNER_REGISTER_MAX_PER_HOUR = 5

/**
 * POST /api/partners/register
 * Registrera ny partner — status: pending_approval.
 *
 * Avtalsacceptans loggas obligatoriskt (agreementAccepted måste vara true) —
 * partneravtalets innehåll hashas server-side vid varje registrering så
 * agreement_hash bevisar exakt VILKEN version som godkändes, oavsett om
 * dokumentet ändras senare. Samma bevismönster som offert-/ÄTA-signering.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Ogiltig request' }, { status: 400 })
    }

    const { email, name, company, password, agreementAccepted } = body

    // Tenant-svepet 2026-09-01: ingen begränsning alls — obegränsat bcrypt-
    // arbete, Resend-kvot och admin-mejl per registrering. Fail-closed IP-tak.
    const rate = await checkPublicRateLimitDb(`partners-register:ip:${hashClientIp(request)}`, {
      maxRequests: PARTNER_REGISTER_MAX_PER_HOUR,
      windowMs: 60 * 60 * 1000,
    })
    if (!rate.allowed) {
      return NextResponse.json({ error: 'För många registreringsförsök — försök igen om en stund' }, { status: 429 })
    }

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Namn, e-post och lösenord krävs' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken' }, { status: 400 })
    }

    if (agreementAccepted !== true) {
      return NextResponse.json({ error: 'Du måste godkänna partneravtalet för att registrera dig' }, { status: 400 })
    }

    const { partner, error } = await registerPartner(email, name, company || null, password, {
      version: AGREEMENT_VERSION,
      hash: readAgreementHash(),
      ip: captureRequestIp(request),
    })

    if (error || !partner) {
      return NextResponse.json({ error: error || 'Registrering misslyckades' }, { status: 400 })
    }

    // Send admin notification
    try {
      const { Resend } = await import('resend')
      const resendKey = process.env.RESEND_API_KEY
      if (resendKey) {
        const resend = new Resend(resendKey)
        const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
        await resend.emails.send({
          from: 'Handymate <noreply@handymate.se>',
          to: ['andreas@handymate.se'],
          subject: `Ny partneransökan: ${partner.name}`,
          html: `
            <h2>Ny partneransökan</h2>
            <p><strong>Namn:</strong> ${partner.name}</p>
            <p><strong>Företag:</strong> ${partner.company || '—'}</p>
            <p><strong>E-post:</strong> ${partner.email}</p>
            <p><strong>Kod:</strong> ${partner.referral_code}</p>
            <br>
            <p><a href="${appUrl}/api/admin/partners/${partner.id}/approve?token=${signApproveToken(partner.id)}">Godkänn partner →</a></p>
          `,
        })
      }
    } catch (emailErr) {
      console.error('[partner-register] Admin notification failed:', emailErr)
    }

    return NextResponse.json({
      success: true,
      message: 'Din ansökan har skickats! Vi granskar den inom 24 timmar.',
      referral_code: partner.referral_code,
    })
  } catch (error: any) {
    console.error('[partner-register] Error:', error)
    return NextResponse.json({ error: 'Registrering misslyckades' }, { status: 500 })
  }
}
