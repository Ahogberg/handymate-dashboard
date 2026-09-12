import { NextRequest, NextResponse } from 'next/server'
import { getAdminSupabase, isAdmin, logAdminAction } from '@/lib/admin-auth'

const ACCOUNT_SELECT = `
  id, company_name, org_number, website, industry, employee_count, city,
  owner_email, source, source_url,
  icp_score, pain_score, timing_score, growth_score, warmth_score, ability_to_pay_score, total_score,
  why_now, pain_hypothesis, personalization_hook, recommended_channel, recommended_cta,
  status, lost_reason, next_action, next_action_at, last_contact_at, notes,
  created_at, updated_at
`

const ALLOWED_STAGES = new Set([
  'identified', 'contacted', 'conversation', 'audit_booked', 'demo', 'proposal',
  'verbal_commit', 'won', 'lost', 'nurture',
])

const ALLOWED_LOST_REASONS = new Set([
  'no_pain', 'not_now', 'price', 'implementation_risk', 'wrong_person', 'already_solved',
  'fortnox_dependency', 'ai_trust', 'competitor', 'no_response', 'other',
])

function boundedInt(value: unknown, min: number, max: number) {
  const n = Number(value ?? 0)
  if (!Number.isFinite(n)) return min
  return Math.max(min, Math.min(max, Math.round(n)))
}

async function requireAdmin(request: NextRequest) {
  const admin = await isAdmin(request)
  if (!admin.isAdmin) return { admin, response: NextResponse.json({ error: 'Admin access required' }, { status: 403 }) }
  return { admin, response: null }
}

/** GET /api/admin/revenue — seller queue + lightweight GTM metrics */
export async function GET(request: NextRequest) {
  const { response } = await requireAdmin(request)
  if (response) return response

  const supabase = getAdminSupabase()
  const { searchParams } = new URL(request.url)
  const owner = searchParams.get('owner')

  let query = supabase
    .from('revenue_accounts')
    .select(ACCOUNT_SELECT)
    .order('total_score', { ascending: false })
    .limit(250)

  if (owner && owner !== 'all') query = query.eq('owner_email', owner)

  const [{ data: accounts, error }, { data: signals }, { data: opportunities }] = await Promise.all([
    query,
    supabase
      .from('revenue_signals')
      .select('id, account_id, signal_type, title, detail, strength, source, source_url, observed_at')
      .order('observed_at', { ascending: false })
      .limit(100),
    supabase
      .from('revenue_opportunities')
      .select('id, account_id, plan, billing_preference, expected_arr_sek, stage, probability, owner_email, next_step, next_step_at')
      .limit(250),
  ])

  if (error) {
    // Most useful failure before the SQL migration has been applied.
    return NextResponse.json({
      error: error.message,
      setup_required: error.code === '42P01' || error.message?.includes('revenue_accounts'),
    }, { status: 500 })
  }

  const rows = accounts || []
  const now = Date.now()
  const queue = [...rows]
    .filter((a: any) => !['won', 'lost'].includes(a.status))
    .sort((a: any, b: any) => {
      const aDue = a.next_action_at ? new Date(a.next_action_at).getTime() <= now : false
      const bDue = b.next_action_at ? new Date(b.next_action_at).getTime() <= now : false
      if (aDue !== bDue) return aDue ? -1 : 1
      return (b.total_score || 0) - (a.total_score || 0)
    })
    .slice(0, 30)

  const stageCounts = rows.reduce((acc: Record<string, number>, row: any) => {
    acc[row.status] = (acc[row.status] || 0) + 1
    return acc
  }, {})

  const owners = Array.from(new Set(rows.map((a: any) => a.owner_email).filter(Boolean))).sort()
  const won = rows.filter((a: any) => a.status === 'won').length
  const active = rows.filter((a: any) => !['won', 'lost', 'nurture'].includes(a.status)).length
  const highPriority = rows.filter((a: any) => a.total_score >= 75 && !['won', 'lost'].includes(a.status)).length
  const stale = rows.filter((a: any) => {
    if (['won', 'lost', 'nurture'].includes(a.status)) return false
    if (!a.last_contact_at) return false
    return now - new Date(a.last_contact_at).getTime() > 7 * 24 * 60 * 60 * 1000
  }).length

  return NextResponse.json({
    accounts: rows,
    queue,
    signals: signals || [],
    opportunities: opportunities || [],
    owners,
    metrics: { total: rows.length, active, high_priority: highPriority, stale, won, stage_counts: stageCounts },
  })
}

/** POST /api/admin/revenue — create account, signal or activity */
export async function POST(request: NextRequest) {
  const { admin, response } = await requireAdmin(request)
  if (response) return response

  const body = await request.json()
  const type = body.type || 'account'
  const supabase = getAdminSupabase()

  if (type === 'account') {
    if (!String(body.company_name || '').trim()) {
      return NextResponse.json({ error: 'company_name is required' }, { status: 400 })
    }

    const payload = {
      company_name: String(body.company_name).trim(),
      org_number: body.org_number || null,
      website: body.website || null,
      industry: body.industry || null,
      employee_count: body.employee_count ? Number(body.employee_count) : null,
      city: body.city || null,
      owner_email: body.owner_email || admin.email || null,
      source: body.source || 'manual',
      source_url: body.source_url || null,
      icp_score: boundedInt(body.icp_score, 0, 25),
      pain_score: boundedInt(body.pain_score, 0, 20),
      timing_score: boundedInt(body.timing_score, 0, 20),
      growth_score: boundedInt(body.growth_score, 0, 15),
      warmth_score: boundedInt(body.warmth_score, 0, 10),
      ability_to_pay_score: boundedInt(body.ability_to_pay_score, 0, 10),
      why_now: body.why_now || null,
      pain_hypothesis: body.pain_hypothesis || null,
      personalization_hook: body.personalization_hook || null,
      recommended_channel: body.recommended_channel || null,
      recommended_cta: body.recommended_cta || 'Admin Leak Audit',
      next_action: body.next_action || null,
      next_action_at: body.next_action_at || null,
      notes: body.notes || null,
      created_by: admin.userId || null,
    }

    const { data, error } = await supabase.from('revenue_accounts').insert(payload).select(ACCOUNT_SELECT).single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    if (admin.userId) await logAdminAction('revenue_account_created', admin.userId, null, { account_id: data.id, company_name: data.company_name })
    return NextResponse.json({ account: data }, { status: 201 })
  }

  if (type === 'signal') {
    if (!body.account_id || !body.signal_type || !body.title) {
      return NextResponse.json({ error: 'account_id, signal_type and title are required' }, { status: 400 })
    }
    const { data, error } = await supabase.from('revenue_signals').insert({
      account_id: body.account_id,
      signal_type: body.signal_type,
      title: body.title,
      detail: body.detail || null,
      strength: boundedInt(body.strength || 1, 1, 5),
      source: body.source || 'manual',
      source_url: body.source_url || null,
      observed_at: body.observed_at || new Date().toISOString(),
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })
    return NextResponse.json({ signal: data }, { status: 201 })
  }

  if (type === 'activity') {
    if (!body.account_id || !body.activity_type) {
      return NextResponse.json({ error: 'account_id and activity_type are required' }, { status: 400 })
    }
    const occurredAt = body.occurred_at || new Date().toISOString()
    const { data, error } = await supabase.from('revenue_activities').insert({
      account_id: body.account_id,
      activity_type: body.activity_type,
      outcome: body.outcome || null,
      summary: body.summary || null,
      seller_email: admin.email || null,
      occurred_at: occurredAt,
    }).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    await supabase.from('revenue_accounts').update({ last_contact_at: occurredAt, updated_at: new Date().toISOString() }).eq('id', body.account_id)
    return NextResponse.json({ activity: data }, { status: 201 })
  }

  return NextResponse.json({ error: 'Unknown type' }, { status: 400 })
}

/** PATCH /api/admin/revenue — update account/pipeline/next action */
export async function PATCH(request: NextRequest) {
  const { admin, response } = await requireAdmin(request)
  if (response) return response

  const body = await request.json()
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  const textFields = [
    'company_name', 'org_number', 'website', 'industry', 'city', 'owner_email', 'source', 'source_url',
    'why_now', 'pain_hypothesis', 'personalization_hook', 'recommended_channel', 'recommended_cta',
    'next_action', 'next_action_at', 'last_contact_at', 'notes',
  ]
  for (const key of textFields) if (key in body) patch[key] = body[key] || null

  if ('employee_count' in body) patch.employee_count = body.employee_count ? Number(body.employee_count) : null
  if ('icp_score' in body) patch.icp_score = boundedInt(body.icp_score, 0, 25)
  if ('pain_score' in body) patch.pain_score = boundedInt(body.pain_score, 0, 20)
  if ('timing_score' in body) patch.timing_score = boundedInt(body.timing_score, 0, 20)
  if ('growth_score' in body) patch.growth_score = boundedInt(body.growth_score, 0, 15)
  if ('warmth_score' in body) patch.warmth_score = boundedInt(body.warmth_score, 0, 10)
  if ('ability_to_pay_score' in body) patch.ability_to_pay_score = boundedInt(body.ability_to_pay_score, 0, 10)

  if ('status' in body) {
    if (!ALLOWED_STAGES.has(body.status)) return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    patch.status = body.status
  }
  if ('lost_reason' in body) {
    if (body.lost_reason && !ALLOWED_LOST_REASONS.has(body.lost_reason)) return NextResponse.json({ error: 'Invalid lost_reason' }, { status: 400 })
    patch.lost_reason = body.lost_reason || null
  }

  const supabase = getAdminSupabase()
  const { data, error } = await supabase.from('revenue_accounts').update(patch).eq('id', body.id).select(ACCOUNT_SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  if (admin.userId) await logAdminAction('revenue_account_updated', admin.userId, null, { account_id: body.id, keys: Object.keys(patch) })
  return NextResponse.json({ account: data })
}
