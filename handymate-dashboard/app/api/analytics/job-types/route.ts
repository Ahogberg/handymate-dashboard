import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'

/**
 * GET /api/analytics/job-types
 * Aggregerar intäkter och jobbantal per jobbtyp för senaste 12 månaderna.
 * Kombinerar deal.job_type + quote.job_type (accepted) + invoice.total per deal.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = getServerSupabase()
  const sinceIso = new Date(Date.now() - 365 * 86_400_000).toISOString()

  const [{ data: jobTypes }, { data: deals }, { data: quotes }, { data: invoices }] = await Promise.all([
    supabase.from('job_types').select('id, name, slug, color').eq('business_id', business.business_id),
    supabase.from('deal').select('id, job_type, value, created_at')
      .eq('business_id', business.business_id).gte('created_at', sinceIso),
    supabase.from('quotes').select('quote_id, job_type, total, status, accepted_at, created_at')
      .eq('business_id', business.business_id).gte('created_at', sinceIso),
    supabase.from('invoice').select('invoice_id, total, status, created_at')
      .eq('business_id', business.business_id).gte('created_at', sinceIso),
  ])

  // Bygg aggregation per slug
  const aggregate: Record<string, {
    slug: string
    name: string
    color: string
    deal_count: number
    deal_value: number
    quote_count: number
    quote_accepted_count: number
    accepted_value: number
  }> = {}

  // Initialisera med definierade jobbtyper
  for (const jt of jobTypes || []) {
    aggregate[jt.slug] = {
      slug: jt.slug,
      name: jt.name,
      color: jt.color || '#0F766E',
      deal_count: 0,
      deal_value: 0,
      quote_count: 0,
      quote_accepted_count: 0,
      accepted_value: 0,
    }
  }

  // Hjälpare — säkerställ slot för okänd jobbtyp
  const ensureSlot = (slug: string) => {
    if (!aggregate[slug]) {
      aggregate[slug] = {
        slug,
        name: slug,
        color: '#94A3B8',
        deal_count: 0,
        deal_value: 0,
        quote_count: 0,
        quote_accepted_count: 0,
        accepted_value: 0,
      }
    }
    return aggregate[slug]
  }

  // Deals
  for (const d of deals || []) {
    if (!d.job_type) continue
    const s = ensureSlot(d.job_type)
    s.deal_count++
    s.deal_value += Number(d.value) || 0
  }

  // Quotes
  for (const q of quotes || []) {
    if (!q.job_type) continue
    const s = ensureSlot(q.job_type)
    s.quote_count++
    if (q.status === 'accepted') {
      s.quote_accepted_count++
      s.accepted_value += Number(q.total) || 0
    }
  }

  const rows = Object.values(aggregate).sort((a, b) => b.accepted_value - a.accepted_value)
  const totalValue = rows.reduce((sum, r) => sum + r.accepted_value, 0)
  const totalDeals = rows.reduce((sum, r) => sum + r.deal_count, 0)

  return NextResponse.json({
    since: sinceIso,
    total_value: Math.round(totalValue),
    total_deals: totalDeals,
    rows: rows.map(r => ({
      ...r,
      deal_value: Math.round(r.deal_value),
      accepted_value: Math.round(r.accepted_value),
      share_pct: totalValue > 0 ? Math.round((r.accepted_value / totalValue) * 100) : 0,
      share_deals_pct: totalDeals > 0 ? Math.round((r.deal_count / totalDeals) * 100) : 0,
    })),
  })
}
