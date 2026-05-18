import { NextRequest, NextResponse } from 'next/server'
import { isAdmin, logAdminAction, getAdminSupabase } from '@/lib/admin-auth'
import { IMPERSONATION_COOKIE, IMPERSONATION_MAX_AGE_SECONDS } from '@/lib/auth/superadmin'

/**
 * POST /api/admin/impersonate
 *
 * READ-only impersonation v1: sätter hm_impersonate-cookie så att
 * getAuthenticatedBusiness() returnerar target business istället för
 * admin's egen. Admin är fortfarande sig själv i Supabase-sessionen —
 * skriv-actions går mot admin's user_id (men många routes skickar inte
 * user-context, så detta är effektivt READ-only på praktiken).
 *
 * För FULL impersonation (Supabase tror du är target user) — använd
 * /api/admin/impersonate/[businessId] som genererar magic-link.
 *
 * Body: { target_business_id, reason? }
 */
export async function POST(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized — admin required' }, { status: 403 })
  }

  let body: { target_business_id?: string; business_id?: string; reason?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  // Acceptera båda fält-namn för bakåtkompatibilitet
  const targetBusinessId = (body.target_business_id || body.business_id || '').trim()
  if (!targetBusinessId || !/^[a-zA-Z0-9_-]+$/.test(targetBusinessId)) {
    return NextResponse.json({ error: 'Invalid target_business_id' }, { status: 400 })
  }

  // Verifiera target finns
  const supabase = getAdminSupabase()
  const { data: target, error: targetError } = await supabase
    .from('business_config')
    .select('business_id, business_name, contact_email')
    .eq('business_id', targetBusinessId)
    .single()

  if (targetError || !target) {
    return NextResponse.json({ error: 'Target business not found' }, { status: 404 })
  }

  // Audit-logg via befintlig admin_audit_log
  await logAdminAction('impersonate_read_start', adminCheck.userId!, target.business_id, {
    business_name: target.business_name,
    contact_email: target.contact_email,
    reason: body.reason || null,
    mode: 'read_only',
    admin_email: adminCheck.email,
    admin_ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
    admin_user_agent: request.headers.get('user-agent') || null,
  })

  console.log(
    `[admin/impersonate/read] ${adminCheck.email} → ${target.business_name} (${target.business_id})`
  )

  const response = NextResponse.json({
    success: true,
    mode: 'read_only',
    target: {
      business_id: target.business_id,
      business_name: target.business_name,
      contact_email: target.contact_email,
    },
  })

  // hm_impersonate: server-läses av getAuthenticatedBusiness (httpOnly för säkerhet)
  response.cookies.set(IMPERSONATION_COOKIE, target.business_id, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    path: '/',
  })

  // impersonate_business_name: client-läses av ImpersonationBanner (httpOnly: false)
  // Detta är inte säkerhetskänslig data — bara display-namn för bannern.
  response.cookies.set('impersonate_business_name', encodeURIComponent(target.business_name || ''), {
    httpOnly: false,
    secure: true,
    sameSite: 'lax',
    maxAge: IMPERSONATION_MAX_AGE_SECONDS,
    path: '/',
  })

  return response
}

/**
 * DELETE /api/admin/impersonate — avsluta READ-only impersonation.
 * Clearar hm_impersonate-cookie + loggar slutpunkt.
 */
export async function DELETE(request: NextRequest) {
  const adminCheck = await isAdmin(request)
  if (!adminCheck.isAdmin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  // Vi vet inte vilken target som var aktiv från denna route (cookien har bara
  // business_id i värdet). Läs det innan vi clearar.
  const currentTarget = request.cookies.get(IMPERSONATION_COOKIE)?.value || null

  await logAdminAction('impersonate_read_end', adminCheck.userId!, currentTarget, {
    admin_email: adminCheck.email,
    mode: 'read_only',
  })

  const response = NextResponse.json({ success: true })
  response.cookies.delete(IMPERSONATION_COOKIE)
  response.cookies.delete('impersonate_business_name')
  // Legacy: tidigare Strategi 1 satte denna; rensa om den hänger kvar
  response.cookies.delete('impersonate_business_id')

  return response
}
