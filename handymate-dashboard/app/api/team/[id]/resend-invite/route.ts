import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * POST /api/team/[id]/resend-invite - Skicka ny inbjudan
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

    const currentUser = await getCurrentUser(request)
    if (!currentUser || !hasPermission(currentUser, 'manage_users')) {
      return NextResponse.json({ error: 'Otillräcklig behörighet' }, { status: 403 })
    }

    const supabase = getServerSupabase()

    // Hämta användaren
    const { data: member } = await supabase
      .from('business_users')
      .select('*')
      .eq('id', params.id)
      .eq('business_id', business.business_id)
      .single()

    if (!member) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    if (member.accepted_at) {
      return NextResponse.json({ error: 'Användaren har redan accepterat' }, { status: 400 })
    }

    // Generera ny token
    const token = crypto.randomUUID()

    const { error } = await supabase
      .from('business_users')
      .update({
        invite_token: token,
        invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invited_at: new Date().toISOString()
      })
      .eq('id', params.id)

    if (error) throw error

    // Skicka email
    const resend = getResend()
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
    const inviteUrl = `${appUrl}/invite/${token}`
    const domain = process.env.RESEND_DOMAIN || 'handymate.se'

    await resend.emails.send({
      from: `${business.business_name} via Handymate <noreply@${domain}>`,
      to: member.email,
      subject: `Påminnelse: ${currentUser.name} bjuder in dig till ${business.business_name}`,
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #18181b; margin: 0; font-size: 24px;">Du har en väntande inbjudan</h1>
          </div>
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            Hej ${member.name},
          </p>
          <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
            <strong>${currentUser.name}</strong> väntar på att du accepterar inbjudan till <strong>${business.business_name}</strong> på Handymate.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
              Acceptera inbjudan
            </a>
          </div>
          <p style="color: #71717a; font-size: 14px; text-align: center;">
            Länken gäller i 7 dagar.
          </p>
        </div>
      `
    })

    return NextResponse.json({ success: true })

  } catch (error: any) {
    console.error('Resend invite error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
