import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'
import { deriveFunnel } from '@/lib/launch-desk/funnel'
import { normalizeAccountBatch } from '@/lib/launch-desk/normalize'
import { recommendChannel } from '@/lib/launch-desk/policy'
import { GTM_STATUSES, type GtmStatus } from '@/lib/launch-desk/types'
import { arSchemaSaknas } from '@/lib/observability/driftlarm'

export const dynamic = 'force-dynamic'

function unavailable(error: unknown) {
  if (arSchemaSaknas(error)) {
    return NextResponse.json({ error: 'Launch Desk är inte aktiverat ännu. Kör sql/v166_launch_desk.sql.' }, { status: 503 })
  }
  return null
}

function identifier(value: string | null | undefined): string | null {
  return value?.trim().toLowerCase() || null
}

export async function GET(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  const supabase = getAdminSupabase()
  const params = request.nextUrl.searchParams
  const status = params.get('status')
  const search = params.get('q')?.trim().slice(0, 120) || ''
  const owner = params.get('owner')?.trim() || ''
  const limit = Math.min(Math.max(Number(params.get('limit')) || 200, 1), 500)

  let query = supabase
    .from('gtm_account')
    .select('*')
    .order('fit_score', { ascending: false })
    .limit(limit)

  if (status && GTM_STATUSES.includes(status as GtmStatus)) query = query.eq('status', status)
  if (owner) query = query.eq('owner_user_id', owner)
  if (search) query = query.ilike('company_name', `%${search.replace(/[%_]/g, '')}%`)

  const [accountsResult, funnelResult] = await Promise.all([
    query,
    supabase.from('gtm_account').select('status, next_action_at'),
  ])

  if (accountsResult.error) {
    const response = unavailable(accountsResult.error)
    return response || NextResponse.json({ error: accountsResult.error.message }, { status: 500 })
  }
  if (funnelResult.error) {
    const response = unavailable(funnelResult.error)
    return response || NextResponse.json({ error: funnelResult.error.message }, { status: 500 })
  }

  return NextResponse.json({
    accounts: accountsResult.data || [],
    funnel: deriveFunnel((funnelResult.data || []) as Array<{ status: GtmStatus; next_action_at: string | null }>),
  })
}

export async function POST(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin || !admin.userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })

  let normalized
  try {
    const body = await request.json()
    normalized = normalizeAccountBatch(body?.accounts)
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Ogiltig import' }, { status: 400 })
  }

  const supabase = getAdminSupabase()
  const orgNumbers = normalized.flatMap(account => account.org_number ? [account.org_number] : [])

  const [existingResult, suppressionsResult] = await Promise.all([
    orgNumbers.length > 0
      ? supabase.from('gtm_account').select('org_number').in('org_number', orgNumbers)
      : Promise.resolve({ data: [], error: null }),
    supabase.from('gtm_suppression').select('org_number, email, phone'),
  ])

  for (const result of [existingResult, suppressionsResult]) {
    if (result.error) {
      const response = unavailable(result.error)
      return response || NextResponse.json({ error: result.error.message }, { status: 500 })
    }
  }

  const existingOrgNumbers = new Set((existingResult.data || []).map(row => identifier(row.org_number)))
  const suppressionKeys = new Set<string>()
  for (const row of suppressionsResult.data || []) {
    if (identifier(row.org_number)) suppressionKeys.add(`org:${identifier(row.org_number)}`)
    if (identifier(row.email)) suppressionKeys.add(`email:${identifier(row.email)}`)
    if (identifier(row.phone)) suppressionKeys.add(`phone:${identifier(row.phone)}`)
  }

  const duplicates: string[] = []
  const blocked: string[] = []
  const seenOrgNumbers = new Set<string>()
  const rows = normalized.flatMap(account => {
    const org = identifier(account.org_number)
    if (org && (existingOrgNumbers.has(org) || seenOrgNumbers.has(org))) {
      duplicates.push(account.company_name)
      return []
    }
    if (org) seenOrgNumbers.add(org)

    const emails = [account.primary_contact_email, account.company_email].map(identifier).filter(Boolean)
    const phones = [account.primary_contact_phone, account.company_phone].map(identifier).filter(Boolean)
    const isBlocked = (org && suppressionKeys.has(`org:${org}`))
      || emails.some(email => suppressionKeys.has(`email:${email}`))
      || phones.some(phone => suppressionKeys.has(`phone:${phone}`))
    if (isBlocked) {
      blocked.push(account.company_name)
      return []
    }

    const suggested = account.suggested_channel === 'none'
      ? recommendChannel({
          legalForm: account.legal_form,
          contactBasis: account.contact_basis,
          hasPhone: Boolean(account.primary_contact_phone || account.company_phone),
          hasEmail: Boolean(account.primary_contact_email || account.company_email),
          hasLinkedin: Boolean(account.primary_contact_linkedin),
        })
      : account.suggested_channel

    return [{
      ...account,
      status: account.fit_score >= 60 ? 'qualified' : 'imported',
      suggested_channel: suggested,
      processing_purpose: 'handymate_b2b_launch',
      lawful_basis: account.contact_basis === 'inbound'
        ? 'inbound_request'
        : account.contact_basis === 'warm_intro' || account.contact_basis === 'customer_referral'
          ? 'warm_relationship'
          : 'legitimate_interest',
      retention_review_at: new Date(new Date(account.source_checked_at).getTime() + 180 * 24 * 60 * 60 * 1000).toISOString(),
      owner_user_id: account.owner_user_id || admin.userId,
      created_by: admin.userId,
      updated_by: admin.userId,
    }]
  })

  if (rows.length === 0) {
    return NextResponse.json({ inserted: [], count: 0, duplicates, blocked })
  }

  const { data, error } = await supabase.from('gtm_account').insert(rows).select('*')
  if (error) {
    const response = unavailable(error)
    return response || NextResponse.json({ error: error.message }, { status: 500 })
  }

  await logAdminAction('launch_desk_import', admin.userId, null, {
    inserted_count: data?.length || 0,
    duplicate_count: duplicates.length,
    blocked_count: blocked.length,
    source_names: Array.from(new Set(normalized.map(account => account.source_name))),
  })

  return NextResponse.json({ inserted: data || [], count: data?.length || 0, duplicates, blocked }, { status: 201 })
}
