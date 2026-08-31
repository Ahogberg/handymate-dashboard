import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
// Auth via request.headers i importerad helper — utan force-dynamic kan
// rutten frysas i Full Route Cache och servera fel företags data
// (2026-08-22-klassen, se CLAUDE.md; residualsvep 2026-08-31).
export const dynamic = 'force-dynamic'


/**
 * GET /api/customers/[id]/referrals
 *
 * Attributionsstatistik för en kunds rekommendationer: hur många leads och
 * vunna affärer kan spåras till att DENNA kund tipsat en vän (leads.referral_customer_id
 * / deal.referral_customer_id, se sql/v107_referral_attribution.sql).
 *
 * Fail-soft: attributionsdata är "nice to have" på kundkortet, aldrig kritisk.
 * Går något fel i databasfrågan loggas felet och vi svarar 200 med nollor
 * i stället för att krascha kundkortet.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const empty = { leadsCount: 0, wonDealsCount: 0, wonValueSum: 0 }

  const business = await getAuthenticatedBusiness(request)
  if (!business) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id: customerId } = await params
  const supabase = getServerSupabase()

  // Tenant-koll: kunden måste tillhöra det inloggade företaget. Läck aldrig
  // attributionsdata mellan tenants — 404 om kunden inte finns eller hör
  // till en annan business_id.
  const { data: customerRow, error: customerError } = await supabase
    .from('customer')
    .select('customer_id')
    .eq('customer_id', customerId)
    .eq('business_id', business.business_id)
    .maybeSingle()

  if (customerError) {
    console.error('[referrals] customer lookup error:', customerError)
    return NextResponse.json(empty)
  }

  if (!customerRow) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  try {
    const [leadsRes, dealsRes] = await Promise.all([
      supabase
        .from('leads')
        .select('lead_id', { count: 'exact', head: true })
        .eq('business_id', business.business_id)
        .eq('referral_customer_id', customerId),
      supabase
        .from('deal')
        .select('id, value, pipeline_stage:stage_id(is_won, is_lost)')
        .eq('business_id', business.business_id)
        .eq('referral_customer_id', customerId),
    ])

    if (leadsRes.error) {
      console.error('[referrals] leads query error:', leadsRes.error)
      return NextResponse.json(empty)
    }
    if (dealsRes.error) {
      console.error('[referrals] deals query error:', dealsRes.error)
      return NextResponse.json(empty)
    }

    const leadsCount = leadsRes.count || 0

    let wonDealsCount = 0
    let wonValueSum = 0
    for (const row of dealsRes.data || []) {
      // Embedded relationen kan komma som objekt ELLER array beroende på
      // Supabase-klientversion — hantera båda defensivt (se deal-cycle.ts).
      const stageRaw = (row as any).pipeline_stage
      const stage = Array.isArray(stageRaw) ? stageRaw[0] : stageRaw
      if (stage?.is_won === true) {
        wonDealsCount++
        wonValueSum += (row as any).value || 0
      }
    }

    return NextResponse.json({ leadsCount, wonDealsCount, wonValueSum })
  } catch (error) {
    console.error('[referrals] unexpected error:', error)
    return NextResponse.json(empty)
  }
}
