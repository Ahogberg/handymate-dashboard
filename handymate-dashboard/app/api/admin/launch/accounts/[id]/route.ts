import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import {
  cleanText,
  normalizeDateTime,
  normalizeEmail,
  normalizePhone,
  normalizeUrl,
  normalizeUuid,
} from '@/lib/launch-desk/normalize'
import { calculateFit } from '@/lib/launch-desk/scoring'
import { suggestedChannelIsEligible } from '@/lib/launch-desk/policy'
import {
  GTM_CHANNELS,
  GTM_CONTACT_BASES,
  GTM_LEGAL_FORMS,
  type GtmAccount,
  type GtmChannel,
  type GtmContactBasis,
  type GtmLegalForm,
} from '@/lib/launch-desk/types'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'

function migrationResponse(error: unknown) {
  return arSchemaSaknas(error)
    ? NextResponse.json({ error: 'Launch Desk är inte aktiverat ännu. Kör sql/v166_launch_desk.sql.' }, { status: 503 })
    : null
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const supabase = getAdminSupabase()
  const [accountResult, activityResult] = await Promise.all([
    supabase.from('gtm_account').select('*').eq('id', id).maybeSingle(),
    supabase.from('gtm_activity').select('*').eq('account_id', id).order('happened_at', { ascending: false }).limit(100),
  ])

  if (accountResult.error) return migrationResponse(accountResult.error) || NextResponse.json({ error: accountResult.error.message }, { status: 500 })
  if (activityResult.error) return migrationResponse(activityResult.error) || NextResponse.json({ error: activityResult.error.message }, { status: 500 })
  if (!accountResult.data) return NextResponse.json({ error: 'Prospektet hittades inte' }, { status: 404 })
  return NextResponse.json({ account: accountResult.data, activities: activityResult.data || [] })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const { id } = await params
  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Ogiltig uppdatering' }, { status: 400 })

  const supabase = getAdminSupabase()
  const { data: current, error: readError } = await supabase.from('gtm_account').select('*').eq('id', id).maybeSingle()
  if (readError) return migrationResponse(readError) || NextResponse.json({ error: readError.message }, { status: 500 })
  if (!current) return NextResponse.json({ error: 'Prospektet hittades inte' }, { status: 404 })
  if (current.status === 'suppressed') return NextResponse.json({ error: 'Spärrade prospekt kan inte ändras här' }, { status: 409 })

  const legalForm = GTM_LEGAL_FORMS.includes(body.legal_form as GtmLegalForm)
    ? body.legal_form as GtmLegalForm
    : current.legal_form as GtmLegalForm
  const contactBasis = GTM_CONTACT_BASES.includes(body.contact_basis as GtmContactBasis)
    ? body.contact_basis as GtmContactBasis
    : current.contact_basis as GtmContactBasis
  const channel = GTM_CHANNELS.includes(body.suggested_channel as GtmChannel)
    ? body.suggested_channel as GtmChannel
    : current.suggested_channel as GtmChannel
  if (!suggestedChannelIsEligible(legalForm, contactBasis, channel)) {
    return NextResponse.json({ error: 'Den föreslagna kanalen är inte tillåten för bolagsformen och kontaktkällan' }, { status: 400 })
  }

  const status = body.status === undefined ? current.status : body.status
  if (body.status !== undefined && !['imported', 'qualified', 'ready'].includes(status)) {
    return NextResponse.json({ error: 'Kontaktstatus ändras genom att logga ett verkligt utfall' }, { status: 400 })
  }

  const updates: Record<string, unknown> = {
    legal_form: legalForm,
    contact_basis: contactBasis,
    lawful_basis: contactBasis === 'inbound'
      ? 'inbound_request'
      : contactBasis === 'warm_intro' || contactBasis === 'customer_referral'
        ? 'warm_relationship'
        : 'legitimate_interest',
    suggested_channel: channel,
    status,
    website: body.website === undefined ? current.website : normalizeUrl(body.website),
    company_phone: body.company_phone === undefined ? current.company_phone : normalizePhone(body.company_phone),
    company_email: body.company_email === undefined ? current.company_email : normalizeEmail(body.company_email),
    primary_contact_name: body.primary_contact_name === undefined ? current.primary_contact_name : cleanText(body.primary_contact_name, 160),
    primary_contact_role: body.primary_contact_role === undefined ? current.primary_contact_role : cleanText(body.primary_contact_role, 160),
    primary_contact_email: body.primary_contact_email === undefined ? current.primary_contact_email : normalizeEmail(body.primary_contact_email),
    primary_contact_phone: body.primary_contact_phone === undefined ? current.primary_contact_phone : normalizePhone(body.primary_contact_phone),
    primary_contact_linkedin: body.primary_contact_linkedin === undefined ? current.primary_contact_linkedin : normalizeUrl(body.primary_contact_linkedin),
    owner_user_id: body.owner_user_id === undefined ? current.owner_user_id : normalizeUuid(body.owner_user_id),
    next_action_at: body.next_action_at === undefined ? current.next_action_at : normalizeDateTime(body.next_action_at),
    factual_notes: body.factual_notes === undefined ? current.factual_notes : cleanText(body.factual_notes, 3000),
    updated_by: admin.userId,
    updated_at: new Date().toISOString(),
  }

  const fit = calculateFit({ ...(current as GtmAccount), ...updates } as any)
  updates.fit_score = fit.score
  updates.fit_reasons = fit.reasons

  const { data, error } = await supabase.from('gtm_account').update(updates).eq('id', id).select('*').single()
  if (error) return migrationResponse(error) || NextResponse.json({ error: error.message }, { status: 500 })

  await logAdminAction('launch_desk_account_update', admin.userId, null, { account_id: id, fields: Object.keys(updates) })
  return NextResponse.json({ account: data })
}
