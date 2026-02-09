import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, hasPermission } from '@/lib/permissions'
import { Resend } from 'resend'

function getResend() {
  return new Resend(process.env.RESEND_API_KEY)
}

/**
 * POST /api/team/invite - Bjud in teammedlem
 */
export async function POST(request: NextRequest) {
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
    const body = await request.json()

    if (!body.email || !body.name) {
      return NextResponse.json({ error: 'Namn och email krävs' }, { status: 400 })
    }

    // Kolla om email redan finns
    const { data: existing } = await supabase
      .from('business_users')
      .select('id, is_active')
      .eq('business_id', business.business_id)
      .eq('email', body.email)
      .single()

    if (existing) {
      if (existing.is_active) {
        return NextResponse.json({ error: 'Denna email finns redan i teamet' }, { status: 400 })
      }
      // Återaktivera inaktiv användare
      const token = crypto.randomUUID()
      const { data: member, error } = await supabase
        .from('business_users')
        .update({
          is_active: true,
          name: body.name,
          role: body.role || 'employee',
          title: body.title || null,
          hourly_rate: body.hourly_rate || null,
          invite_token: token,
          invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
          invited_at: new Date().toISOString(),
          accepted_at: null,
          user_id: null,
          ...(body.permissions || {})
        })
        .eq('id', existing.id)
        .select()
        .single()

      if (error) throw error

      await sendInviteEmail(business, currentUser.name, body.email, body.name, token)
      return NextResponse.json({ member })
    }

    // Kan inte ge högre roll än sin egen
    const roleHierarchy: Record<string, number> = { owner: 3, admin: 2, employee: 1 }
    const myLevel = roleHierarchy[currentUser.role] || 0
    const targetLevel = roleHierarchy[body.role || 'employee'] || 0
    if (targetLevel >= myLevel && currentUser.role !== 'owner') {
      return NextResponse.json({ error: 'Kan inte ge lika hög eller högre roll än din egen' }, { status: 400 })
    }

    const token = crypto.randomUUID()

    const { data: member, error } = await supabase
      .from('business_users')
      .insert({
        business_id: business.business_id,
        role: body.role || 'employee',
        name: body.name,
        email: body.email,
        phone: body.phone || null,
        title: body.title || null,
        hourly_cost: body.hourly_cost || null,
        hourly_rate: body.hourly_rate || null,
        color: body.color || '#3B82F6',
        can_see_all_projects: body.can_see_all_projects || false,
        can_see_financials: body.can_see_financials || false,
        can_manage_users: body.can_manage_users || false,
        can_approve_time: body.can_approve_time || false,
        can_create_invoices: body.can_create_invoices || false,
        invite_token: token,
        invite_expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        invited_at: new Date().toISOString()
      })
      .select()
      .single()

    if (error) throw error

    // Skicka email
    await sendInviteEmail(business, currentUser.name, body.email, body.name, token)

    return NextResponse.json({ member })

  } catch (error: any) {
    console.error('Invite team member error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

async function sendInviteEmail(
  business: any,
  inviterName: string,
  toEmail: string,
  toName: string,
  token: string
) {
  const resend = getResend()
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://app.handymate.se'
  const inviteUrl = `${appUrl}/invite/${token}`
  const domain = process.env.RESEND_DOMAIN || 'handymate.se'

  await resend.emails.send({
    from: `${business.business_name} via Handymate <noreply@${domain}>`,
    to: toEmail,
    subject: `${inviterName} bjuder in dig till ${business.business_name}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 500px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #18181b; margin: 0; font-size: 24px;">Välkommen till teamet!</h1>
        </div>
        <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
          Hej ${toName},
        </p>
        <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
          <strong>${inviterName}</strong> har bjudit in dig till <strong>${business.business_name}</strong> på Handymate.
        </p>
        <div style="text-align: center; margin: 30px 0;">
          <a href="${inviteUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #8b5cf6, #d946ef); color: white; text-decoration: none; border-radius: 12px; font-weight: 600; font-size: 16px;">
            Acceptera inbjudan
          </a>
        </div>
        <p style="color: #71717a; font-size: 14px; text-align: center;">
          Länken gäller i 7 dagar.
        </p>
        <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 30px 0;" />
        <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
          Skickad via Handymate • ${business.business_name}
        </p>
      </div>
    `
  })
}
