import { NextRequest, NextResponse } from 'next/server'
import { getServerSupabase } from '@/lib/supabase'
import { checkPublicRateLimitDb, hashClientIp } from '@/lib/rate-limit-db'
import { DEMO_QUOTE_BUSINESS_ID, demoCorsHeaders } from '@/lib/demo/demo-quote'
import { extractFirstName } from '@/lib/customers/namn'

export const dynamic = 'force-dynamic'

/**
 * GET /api/public/demo-quote/[token]/status — efteråt-vyn på handymate.se
 * (yta 9). Landningen pollar var 5:e sekund i tio minuter efter att
 * offerten skickats, och öppnar vyn direkt när SMS 2:s länk (?demo=token)
 * följs.
 *
 * Token = offertens sign_token — samma hemlighet som kundens egen länk bär.
 * Svaret är begränsat till demo-företaget: en riktig offerts token ger 404
 * här, oavsett om den finns.
 *
 * Tidsstämplarna är härledda ur det som FAKTISKT hände:
 *   accepted_at         quotes.accepted_at (signeringen)
 *   project_created_at  project.created_at för projektet ur offerten
 *   deal_won_at         deal.closed_at för affären kopplad till offerten
 * Raden i efteråt-vyn visas bara när stämpeln finns — inget påhittat.
 */
export async function OPTIONS(request: NextRequest) {
  return new Response(null, { status: 204, headers: demoCorsHeaders(request) })
}

export async function GET(request: NextRequest, props: { params: Promise<{ token: string }> }) {
  const params = await props.params;
  const headers = { ...demoCorsHeaders(request), 'Cache-Control': 'no-store' }
  const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers })

  const token = String(params.token || '').trim()
  if (!/^[0-9a-f-]{36}$/i.test(token)) return json({ error: 'Hittades inte' }, 404)

  // Pollning 12/min per klient — 60/min per IP täcker flera flikar utan att
  // en loop kan hamra DB:n. Fail-closed som övriga publika tak.
  const rate = await checkPublicRateLimitDb(`demo-quote:status:${hashClientIp(request)}`, {
    maxRequests: 60,
    windowMs: 60 * 1000,
  })
  if (!rate.allowed) return json({ error: 'För många anrop' }, 429)

  const supabase = getServerSupabase()
  const { data: quote, error } = await supabase
    .from('quotes')
    .select('quote_id, quote_number, status, accepted_at, total, customer_pays, rot_rut_deduction, valid_until, customer:customer_id (name)')
    .eq('sign_token', token)
    .eq('business_id', DEMO_QUOTE_BUSINESS_ID)
    .maybeSingle()

  if (error) {
    console.error('[demo-quote/status] uppslag misslyckades:', error.message)
    return json({ error: 'Kunde inte läsa status' }, 500)
  }
  if (!quote) return json({ error: 'Hittades inte' }, 404)

  const [projectRes, dealRes] = await Promise.all([
    supabase
      .from('project')
      .select('created_at')
      .eq('business_id', DEMO_QUOTE_BUSINESS_ID)
      .eq('quote_id', quote.quote_id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('deal')
      .select('closed_at, stage:stage_id (slug)')
      .eq('business_id', DEMO_QUOTE_BUSINESS_ID)
      .eq('quote_id', quote.quote_id)
      .limit(1)
      .maybeSingle(),
  ])

  const dealRow = dealRes.data as { closed_at: string | null; stage: { slug: string } | { slug: string }[] | null } | null
  const stage = Array.isArray(dealRow?.stage) ? dealRow?.stage[0] : dealRow?.stage
  const dealWonAt = stage?.slug === 'won' ? dealRow?.closed_at ?? null : null
  const customer = (quote as any).customer
  const customerName = Array.isArray(customer) ? customer[0]?.name : customer?.name

  return json({
    status: quote.status,
    quote_number: quote.quote_number,
    first_name: extractFirstName(customerName) || null,
    total: quote.total,
    customer_pays: quote.customer_pays,
    rot_deduction: quote.rot_rut_deduction,
    valid_until: quote.valid_until,
    accepted_at: quote.accepted_at ?? null,
    project_created_at: projectRes.data?.created_at ?? null,
    deal_won_at: dealWonAt,
  })
}
