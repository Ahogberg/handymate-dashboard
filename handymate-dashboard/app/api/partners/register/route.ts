import { NextRequest, NextResponse } from 'next/server'
import { registerPartner } from '@/lib/partners/auth'

/**
 * POST /api/partners/register
 * Registrera ny partner — status: pending_approval.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body) {
      return NextResponse.json({ error: 'Ogiltig request' }, { status: 400 })
    }

    const { email, name, company, password } = body

    if (!email || !name || !password) {
      return NextResponse.json({ error: 'Namn, e-post och lösenord krävs' }, { status: 400 })
    }

    if (password.length < 8) {
      return NextResponse.json({ error: 'Lösenordet måste vara minst 8 tecken' }, { status: 400 })
    }

    const { partner, error } = await registerPartner(email, name, company || null, password)

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
            <p><a href="${appUrl}/api/admin/partners/${partner.id}/approve">Godkänn partner →</a></p>
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
