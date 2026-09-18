import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { AGREEMENT_VERSION } from '@/lib/partners/agreement'
import { requireRevenue } from '@/lib/revenue/auth'
import {
  casePayload,
  followupBody,
  makeBrief,
  normalizeOrg,
  safeUrl,
  text,
  STAGES,
} from '@/lib/revenue/domain'
import { fetchCandidates } from '@/lib/revenue/source'
import { qualification } from '@/lib/revenue/qualification'
import { crmExport } from '@/lib/revenue/export'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
function id(value: unknown) {
  if (typeof value !== 'string' || !UUID.test(value))
    throw new Error('Ogiltig identifierare.')
  return value
}
/**
 * Flera företag i ett svep. Taket sitter i RPC:n också (200 respektive 50) —
 * här stoppas orimliga listor innan de blir en databasrunda.
 */
function ids(value: unknown, tak: number) {
  if (!Array.isArray(value) || value.length === 0)
    throw new Error('Välj minst ett företag.')
  if (value.length > tak)
    throw new Error(`Högst ${tak} företag i taget.`)
  const unika = Array.from(new Set(value.map(v => id(v))))
  return unika
}
function date(value: unknown) {
  if (value == null || value === '') return null
  const d = new Date(String(value))
  if (!Number.isFinite(d.getTime())) throw new Error('Ogiltigt datum.')
  return d.toISOString()
}
function failure(error: unknown, status = 500) {
  console.error('[revenue]', error instanceof Error ? error.message : error)
  return NextResponse.json(
    {
      error:
        status === 500
          ? 'Kunde inte slutföra åtgärden. Försök igen.'
          : error instanceof Error
            ? error.message
            : 'Kunde inte slutföra åtgärden.',
    },
    { status },
  )
}
type Context = NonNullable<Awaited<ReturnType<typeof requireRevenue>>>
async function account(ctx: Context, accountId: string) {
  let q = ctx.db.from('revenue_accounts').select('*').eq('id', accountId)
  if (!ctx.manager) q = q.eq('owner_email', ctx.email)
  const { data, error } = await q.maybeSingle()
  if (error) throw error
  return data
}
async function command(
  ctx: Context,
  requestId: string,
  type: string,
  input: Record<string, unknown>,
) {
  const { data, error } = await ctx.db.rpc(type === 'qualify' || type.startsWith('sequence_') ? 'revenue_sales_command' : 'revenue_v2_command', {
    p_actor: ctx.userId,
    p_email: ctx.email,
    p_manager: ctx.manager,
    p_request: requestId,
    p_command: type,
    p_input: input,
  })
  if (error) throw error
  return data
}
async function refreshBrief(ctx: Context, accountId: string) {
  const a = await account(ctx, accountId)
  if (!a) throw new Error('Företaget är inte tillgängligt.')
  const { data, error } = await ctx.db
    .from('revenue_signals')
    .select('id,title,detail,source_url,observed_at,signal_type')
    .eq('account_id', accountId)
    .order('observed_at', { ascending: false })
    .limit(50)
  if (error) throw error
  await command(ctx, crypto.randomUUID(), 'research', {
    account_id: accountId,
    ...makeBrief(a.company_name, data || []),
  })
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await requireRevenue(request)
    if (!ctx)
      return NextResponse.json(
        { error: 'Du saknar åtkomst till säljarbetet.' },
        { status: 403 },
      )
    const params = request.nextUrl.searchParams
    if (params.get('export') === 'crm') {
      const { data, error } = await ctx.db.rpc('revenue_crm_export', { p_email: ctx.email, p_manager: ctx.manager })
      if (error) throw error
      if (!Array.isArray(data) || data.length > 5000) return failure(new Error('Exporten omfattar fler än 5 000 företag. Be en säljledare avgränsa portföljen.'), 400)
      return new NextResponse(crmExport(data), { headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="handymate-revenue-crm.csv"',
        'Cache-Control': 'private, no-store',
      } })
    }
    if (params.has('account_id')) {
      const accountId = id(params.get('account_id'))
      const a = await account(ctx, accountId)
      if (!a)
        return NextResponse.json(
          { error: 'Företaget är inte tillgängligt.' },
          { status: 404 },
        )
      const results = await Promise.all([
        ctx.db
          .from('revenue_contacts')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(100),
        ctx.db
          .from('revenue_activities')
          .select('*')
          .eq('account_id', accountId)
          .order('occurred_at', { ascending: false })
          .limit(100),
        ctx.db
          .from('revenue_signals')
          .select('*')
          .eq('account_id', accountId)
          .order('observed_at', { ascending: false })
          .limit(50),
        ctx.db
          .from('revenue_sessions')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(50),
        ctx.db
          .from('revenue_followup_drafts')
          .select('*')
          .eq('account_id', accountId)
          .order('created_at', { ascending: false })
          .limit(50),
        ctx.db.from('revenue_sequences').select('*').eq('account_id', accountId)
          .order('created_at', { ascending: false }).limit(20),
      ])
      for (const result of results) if (result.error) throw result.error
      return NextResponse.json(
        {
          account: a,
          contacts: results[0].data,
          activities: results[1].data,
          signals: results[2].data,
          sessions: results[3].data,
          drafts: results[4].data,
          sequences: results[5].data,
          manager: ctx.manager,
        },
        { headers: { 'Cache-Control': 'private, no-store' } },
      )
    }
    const offset = Number(params.get('offset') || 0)
    if (!Number.isInteger(offset) || offset < 0)
      return failure(new Error('Ogiltig sida.'), 400)
    const { data, error } = await ctx.db.rpc('revenue_v2_overview', {
      p_email: ctx.email,
      p_manager: ctx.manager,
      p_search: text(params.get('q') || '', 200),
      p_offset: offset,
    })
    if (error) throw error
    let runQuery = ctx.db
      .from('revenue_source_runs')
      .select('id,source,status,imported,error,started_at,finished_at')
      .order('started_at', { ascending: false })
      .limit(5)
    if (!ctx.manager) runQuery = runQuery.eq('actor_id', ctx.userId)
    const runs = await runQuery
    if (runs.error) throw runs.error
    const metrics = await ctx.db.rpc('revenue_sales_metrics', { p_email: ctx.email, p_manager: ctx.manager })
    if (metrics.error) throw metrics.error
    // Partnerlistan för bulktilldelningen. Bara säljledare fördelar leads, och
    // bara aktiva partners med GÄLLANDE avtal kan tilldelas — samma urval som
    // partner-leads-rutten, så listan inte erbjuder en partner som RPC:n
    // sedan nekar.
    let partners: Array<{ id: string; name: string; company: string | null }> = []
    if (ctx.manager) {
      const rad = await ctx.db
        .from('partners')
        .select('id,name,company')
        .eq('status', 'active')
        .eq('agreement_version', AGREEMENT_VERSION)
        .order('name')
      if (rad.error) throw rad.error
      partners = rad.data || []
    }
    return NextResponse.json(
      {
        ...data,
        manager: ctx.manager,
        email: ctx.email,
        source_runs: runs.data,
        metrics: metrics.data,
        partners,
      },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return failure(error)
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await requireRevenue(request)
    if (!ctx)
      return NextResponse.json(
        { error: 'Du saknar åtkomst till säljarbetet.' },
        { status: 403 },
      )
    if (
      request.headers.get('origin') &&
      request.headers.get('origin') !== request.nextUrl.origin
    )
      return NextResponse.json({ error: 'Ogiltigt ursprung.' }, { status: 403 })
    const raw = await request.text()
    if (raw.length > 100000)
      return failure(new Error('För mycket innehåll.'), 413)
    let body: Record<string, unknown>
    try {
      body = JSON.parse(raw)
      if (!body || Array.isArray(body) || typeof body !== 'object')
        throw new Error()
    } catch {
      return failure(new Error('Ogiltigt innehåll.'), 400)
    }
    const type = text(body.type, 40)
    const requestId = id(body.request_id)
    if (type === 'import_source') {
      const term = text(body.term, 100)
      if (!term) return failure(new Error('Ange ett hantverksyrke.'), 400)
      // A run ID claims this import. A running/failed retry never silently reports success.
      const run = await ctx.db.from('revenue_source_runs').insert({
        id: requestId,
        actor_id: ctx.userId,
        source: `Platsbanken: ${term}`,
        status: 'running',
      })
      if (run.error) {
        if (run.error.code === '23505') {
          const prior = await ctx.db
            .from('revenue_source_runs')
            .select('status,imported,error')
            .eq('id', requestId)
            .eq('actor_id', ctx.userId)
            .maybeSingle()
          if (prior.error) throw prior.error
          if (prior.data?.status === 'succeeded')
            return NextResponse.json({
              ok: true,
              imported: prior.data.imported,
            })
          return failure(
            new Error(
              'Importen har redan startats. Uppdatera översikten innan du försöker igen.',
            ),
            409,
          )
        }
        throw run.error
      }
      let imported = 0
      try {
        const candidates = await fetchCandidates(term)
        for (const candidate of candidates) {
          // Stable request UUID per run+advertisement; import RPC also deduplicates org and external ID across runs.
          const hash = createHash('sha256')
            .update(`${requestId}:${candidate.external_id}`)
            .digest('hex')
          const childId = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`
          try {
            const result = await command(ctx, childId, 'import', candidate)
            await refreshBrief(ctx, result.account_id)
            imported++
          } catch (error) {
            const code = (error as { code?: string }).code
            // Existing ownership and suppression are exclusions, not provider failures.
            if (code === '42501' || code === '22023') continue
            throw error
          }
        }
        const done = await ctx.db
          .from('revenue_source_runs')
          .update({
            status: 'succeeded',
            imported,
            finished_at: new Date().toISOString(),
          })
          .eq('id', requestId)
        if (done.error) throw done.error
        return NextResponse.json({ ok: true, imported })
      } catch (error) {
        const reason =
          error instanceof Error
            ? error.message
            : 'Importen avbröts. Redan sparade företag finns kvar.'
        const failed = await ctx.db
          .from('revenue_source_runs')
          .update({
            status: 'failed',
            imported,
            error: reason,
            finished_at: new Date().toISOString(),
          })
          .eq('id', requestId)
        if (failed.error)
          console.error('[revenue] source status failed', failed.error.message)
        return failure(
          new Error(
            `${reason} ${imported} företag behandlades före avbrottet.`,
          ),
          502,
        )
      }
    }
    if (type === 'create') {
      const input = {
        company_name: text(body.company_name, 200),
        org_number: normalizeOrg(body.org_number),
        industry: text(body.industry, 200),
        city: text(body.city, 200),
        source: 'manual',
      }
      if (!input.company_name)
        return failure(new Error('Företagsnamn krävs.'), 400)
      return NextResponse.json(await command(ctx, requestId, type, input))
    }
    // ─── Flera företag i ett svep ───────────────────────────────────────
    // Båda är säljledaråtgärder och båda RPC:erna kräver p_manager själva;
    // kontrollen här är för felmeddelandets skull, inte för grindens.
    if (type === 'discard') {
      if (!ctx.manager)
        return failure(new Error('Bara säljledare får rensa i katalogen.'), 403)
      const { data, error } = await ctx.db.rpc('revenue_discard_accounts', {
        p_actor: ctx.userId,
        p_email: ctx.email,
        p_manager: true,
        p_request: requestId,
        p_ids: ids(body.ids, 200),
      })
      if (error) throw error
      return NextResponse.json(data)
    }
    if (type === 'assign_bulk') {
      if (!ctx.manager)
        return failure(new Error('Bara säljledare får fördela partnerleads.'), 403)
      const { data, error } = await ctx.db.rpc('revenue_assign_partner_bulk', {
        p_actor: ctx.userId,
        p_email: ctx.email,
        p_manager: true,
        p_request: requestId,
        p_partner: id(body.partner_id),
        p_ids: ids(body.ids, 50),
        p_agreement: AGREEMENT_VERSION,
      })
      if (error) throw error
      return NextResponse.json(data)
    }

    const accountId = id(body.account_id)
    const a = await account(ctx, accountId)
    if (!a)
      return NextResponse.json(
        { error: 'Företaget är inte tillgängligt.' },
        { status: 404 },
      )
    let input: Record<string, unknown> = { account_id: accountId }
    if (type === 'qualify' || type.startsWith('sequence_')) {
      if (!Number.isInteger(body.version)) return failure(new Error('Uppdatera sidan innan du sparar.'), 400)
      input.version = body.version
      if (type === 'qualify') input = { ...input, ...qualification(body) }
      else if (type === 'sequence_start') input = { ...input, contact_id: id(body.contact_id), due_at: date(body.due_at) }
      else if (type === 'sequence_approve') input = { ...input, sequence_id: id(body.sequence_id), body: text(body.body, 10000) }
      else if (type === 'sequence_complete') input = { ...input, sequence_id: id(body.sequence_id), outcome: text(body.outcome, 40), summary: text(body.summary, 5000) }
      else if (type !== 'sequence_stop') return failure(new Error('Okänd åtgärd.'), 400)
    } else if (type === 'contact') {
      input = {
        ...input,
        name: text(body.name, 200),
        email: text(body.email, 320).toLowerCase(),
        phone: text(body.phone, 60),
        role: text(body.role, 200),
        source_url: safeUrl(body.source_url),
        contact_basis: text(body.contact_basis, 40),
      }
      if (
        !input.name ||
        ![
          'public_business_contact',
          'public_professional_role',
          'warm_intro',
          'inbound',
          'customer_referral',
        ].includes(String(input.contact_basis))
      )
        return failure(new Error('Ange namn och kontaktgrund.'), 400)
      if (
        input.email &&
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(input.email))
      )
        return failure(new Error('Ogiltig e-postadress.'), 400)
      if (
        String(input.contact_basis).startsWith('public_') &&
        !input.source_url
      )
        return failure(
          new Error('Ange källan till den offentliga kontaktuppgiften.'),
          400,
        )
    } else if (type === 'activity') {
      const activityType = text(body.activity_type, 30),
        outcome = text(body.outcome, 40),
        summary = text(body.summary, 5000)
      if (
        !['call', 'email', 'meeting', 'audit', 'demo', 'note'].includes(
          activityType,
        ) ||
        ![
          'connected',
          'no_response',
          'replied',
          'declined',
          'pause',
          'opt_out',
          'completed',
        ].includes(outcome)
      )
        return failure(new Error('Välj aktivitet och utfall.'), 400)
      if (!summary) return failure(new Error('Beskriv vad som hände.'), 400)
      input = {
        ...input,
        activity_type: activityType,
        outcome,
        summary,
        occurred_at: date(body.occurred_at),
        next_action: text(body.next_action, 1000),
        next_action_at: date(body.next_action_at),
      }
      if (
        body.make_draft === true &&
        activityType !== 'note' &&
        !['replied', 'declined', 'pause', 'opt_out'].includes(outcome)
      )
        input.draft_body = followupBody(a.company_name, summary, undefined, outcome)
    } else if (type === 'next') {
      const stage = text(body.status, 40)
      if (
        !Object.prototype.hasOwnProperty.call(STAGES, stage) ||
        !Number.isInteger(body.version)
      )
        return failure(new Error('Ogiltigt steg eller inaktuell version.'), 400)
      input = {
        ...input,
        status: stage,
        version: body.version,
        contact_state: text(body.contact_state, 40),
        next_action: text(body.next_action, 1000),
        next_action_at: date(body.next_action_at),
        lost_reason: text(body.lost_reason, 40) || null,
      }
      if (
        !['active', 'paused', 'opted_out'].includes(String(input.contact_state))
      )
        return failure(new Error('Ogiltig kontaktstatus.'), 400)
      if (ctx.manager && body.owner_email !== undefined) {
        const email = text(body.owner_email, 320).toLowerCase()
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
          return failure(new Error('Ange säljarens e-postadress.'), 400)
        input.owner_email = email
      }
    } else if (type === 'research') {
      await refreshBrief(ctx, accountId)
      return NextResponse.json({ ok: true })
    } else if (type === 'case') {
      const sessionId = id(body.session_id)
      const session = await ctx.db
        .from('revenue_sessions')
        .select('meeting_date,version')
        .eq('id', sessionId)
        .eq('account_id', accountId)
        .maybeSingle()
      if (session.error) throw session.error
      if (!session.data) return failure(new Error('Genomgången saknas.'), 404)
      const payload = casePayload(a, body, session.data.meeting_date)
      input = {
        ...input,
        session_id: sessionId,
        session_version: body.session_version,
        payload,
        business_id: ctx.businessId,
        draft_body: followupBody(
          a.company_name,
          payload.goal?.quote || payload.goal?.name || '',
          `${request.nextUrl.origin}/case/{{CASE_TOKEN}}`,
        ),
      }
    } else if (type === 'draft') {
      const content = text(body.body, 10000)
      if (!content)
        return failure(new Error('Utkastet får inte vara tomt.'), 400)
      input = { ...input, draft_id: id(body.draft_id), body: content }
    } else if (type !== 'session')
      return failure(new Error('Okänd åtgärd.'), 400)
    return NextResponse.json(await command(ctx, requestId, type, input))
  } catch (error) {
    const code = (error as { code?: string })?.code
    if (code === '42501')
      return failure(new Error('Du saknar åtkomst till företaget.'), 403)
    if (code === 'PT409' || code === '40001' || code === '23505')
      return failure(
        new Error('Uppgifterna ändrades eller finns redan. Uppdatera sidan.'),
        409,
      )
    if (code === '22023' || code?.startsWith('22') || code?.startsWith('23'))
      return failure(new Error((error as { message: string }).message), 400)
    return failure(error, error instanceof Error ? 400 : 500)
  }
}
