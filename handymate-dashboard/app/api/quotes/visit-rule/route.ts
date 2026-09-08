import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { readVisitRule, visitRuleText } from '@/lib/quotes/visit-rule'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user) || business._impersonation) return NextResponse.json({ error: 'Endast ägare och administratörer kan hantera jobbregler.' }, { status: 403 })
  const jobType = request.nextUrl.searchParams.get('jobType')
  if (!jobType || jobType.length > 100) return NextResponse.json({ error: 'Välj en jobbtyp.' }, { status: 400 })
  const { data, error } = await getServerSupabase().from('business_knowledge')
    .select('id, data_basis').eq('business_id', business.business_id).eq('knowledge_type', 'business_rule')
    .eq('job_type', jobType).is('dismissed_at', null).contains('data_basis', { kind: 'planned_visits' })
    .order('created_at', { ascending: false }).limit(1)
  if (error) return NextResponse.json({ error: 'Kunde inte läsa jobbregeln.' }, { status: 503 })
  return NextResponse.json({ rule: readVisitRule(data?.[0]?.data_basis), id: data?.[0]?.id ?? null }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Logga in.' }, { status: 401 })
  const user = await getCurrentUser(request, business.business_id)
  if (!user || !isOwnerOrAdmin(user) || business._impersonation) return NextResponse.json({ error: 'Endast ägare och administratörer kan spara jobbregler.' }, { status: 403 })
  const rule = readVisitRule(await request.json().catch(() => null))
  if (!rule) return NextResponse.json({ error: 'Välj jobbtyp och 1–20 besök.' }, { status: 400 })
  const db = getServerSupabase()
  const job = await db.from('job_types').select('slug, name').eq('business_id', business.business_id).eq('slug', rule.jobType).eq('is_active', true).maybeSingle()
  if (job.error) return NextResponse.json({ error: 'Kunde inte kontrollera jobbtypen.' }, { status: 503 })
  if (!job.data) return NextResponse.json({ error: 'Jobbtypen finns inte i din firma.' }, { status: 400 })
  // Stable per company + job type: concurrent retries update one rule, never create duplicates.
  const hash = createHash('sha256').update(JSON.stringify([business.business_id, 'planned_visits', rule.jobType])).digest('hex')
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  const result = await db.from('business_knowledge').upsert({ id, business_id: business.business_id,
    agent_id: 'daniel', knowledge_type: 'business_rule', job_type: rule.jobType,
    title: `${job.data.name}: planerade besök`, observation: `${job.data.name}: ${visitRuleText(rule.visits)} Priser och arbetstid granskas separat.`,
    data_basis: rule, confidence: 1, status: 'active', dismissed_at: null, dismissed_by: null,
  }, { onConflict: 'id' }).select('id, data_basis').single()
  if (result.error) return NextResponse.json({ error: 'Kunde inte spara regeln. Offerten har inte ändrats.' }, { status: 503 })
  return NextResponse.json({ id: result.data.id, rule: readVisitRule(result.data.data_basis) })
}
