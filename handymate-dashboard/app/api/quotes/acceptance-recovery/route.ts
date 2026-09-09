import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getCurrentUser, isOwnerOrAdmin } from '@/lib/permissions'
import { getServerSupabase } from '@/lib/supabase'
import { finalizeAcceptedQuote } from '@/lib/quotes/finalize-accepted'
export const dynamic = 'force-dynamic'
const headers = { 'Cache-Control': 'no-store' }
async function context(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return { error: NextResponse.json({ error: 'Logga in först.' }, { status: 401, headers }) }
  const user = await getCurrentUser(request, business.business_id)
  if (!user?.is_active || !isOwnerOrAdmin(user)) return { error: NextResponse.json({ error: 'Endast ägare och administratör kan slutföra accepterade offerter.' }, { status: 403, headers }) }
  return { db: getServerSupabase(), businessId: business.business_id }
}
export async function GET(request: NextRequest) {
  const c = await context(request)
  if (c.error) return c.error
  const { data, error } = await c.db!.from('quote_acceptance_completion')
    .select('quote_id,project_state,deal_state,email_state,updated_at')
    .eq('business_id', c.businessId!).or('project_state.neq.done,deal_state.not.in.(done,skipped),email_state.not.in.(done,skipped)')
    .order('created_at', { ascending: true }).limit(100)
  if (error) return NextResponse.json({ error: 'Kunde inte läsa offertacceptens eftersteg.' }, { status: 503, headers })
  return NextResponse.json({ rows: data || [] }, { headers })
}
export async function POST(request: NextRequest) {
  const c = await context(request)
  if (c.error) return c.error
  try {
    const body = await request.json()
    if (typeof body?.quote_id !== 'string' || !body.quote_id || body.quote_id.length > 100) return NextResponse.json({ error: 'Välj en offert.' }, { status: 400, headers })
    const { data: quote, error } = await c.db!.from('quotes').select('quote_id,status')
      .eq('business_id', c.businessId!).eq('quote_id', body.quote_id).single()
    if (error || !quote) return NextResponse.json({ error: 'Offerten kunde inte läsas.' }, { status: error ? 503 : 404, headers })
    if (quote.status !== 'accepted') return NextResponse.json({ error: 'Offerten är inte accepterad.' }, { status: 409, headers })
    // Recovery never sends email. The original acceptance sends it once; an
    // interrupted/uncertain notification needs a separately reviewed send.
    const result = await finalizeAcceptedQuote(c.db!, { businessId: c.businessId!, quoteId: quote.quote_id, source: 'internt', recoveryOnly: true })
    return NextResponse.json({ result }, { headers })
  } catch {
    return NextResponse.json({ error: 'Kunde inte slutföra. Läs den sparade statusen och försök igen.' }, { status: 503, headers })
  }
}
