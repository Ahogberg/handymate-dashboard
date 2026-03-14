import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/admin/partners/[id]/approve
 * Godkänn en partner — ändrar status till 'active' + skickar välkomstmail.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = getServerSupabase()

  // Verify partner exists and is pending
  const { data: partner, error } = await supabase
    .from('partners')
    .select('id, email, name, company, referral_code, referral_url, status')
    .eq('id', id)
    .maybeSingle()

  if (!partner) {
    return new NextResponse(
      '<html><body><h1>Partner hittades inte</h1></body></html>',
      { status: 404, headers: { 'Content-Type': 'text/html' } }
    )
  }

  if (partner.status === 'active') {
    return new NextResponse(
      '<html><body><h1>Redan godkänd</h1><p>Partnern är redan aktiv.</p></body></html>',
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Approve
  const { error: updateError } = await supabase
    .from('partners')
    .update({
      status: 'active',
      approved_at: new Date().toISOString(),
      approved_by: 'admin',
    })
    .eq('id', id)

  if (updateError) {
    return new NextResponse(
      `<html><body><h1>Fel</h1><p>${updateError.message}</p></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html' } }
    )
  }

  // Send welcome email to partner
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
          <p>Du tjänar 20% av varje kunds månadsbetalning i 12 månader.</p>
          <br>
          <p><a href="https://app.handymate.se/partners/login">Logga in i partnerportalen →</a></p>
        `,
      })
    }
  } catch (emailErr) {
    console.error('[partner-approve] Welcome email failed:', emailErr)
  }

  return new NextResponse(
    `<html><body style="font-family: sans-serif; padding: 40px; text-align: center;">
      <h1 style="color: #0F766E;">✓ Partner godkänd</h1>
      <p><strong>${partner.name}</strong> (${partner.email}) är nu aktiv.</p>
      <p>Referralkod: <code>${partner.referral_code}</code></p>
      <p>Välkomstmail har skickats.</p>
    </body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html' } }
  )
}
