import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedBusiness } from '@/lib/auth'
import { getServerSupabase } from '@/lib/supabase'
import { computeInstantValue } from '@/lib/onboarding/instant-value'

/**
 * GET /api/onboarding/instant-value
 *
 * Onboardingens "payoff": DETERMINISTISK, synkron sammanfattning av kundens
 * NYSS importerade data — inget cron, ingen agent, inga externa anrop. Detta
 * ger LiveTour (steg 6) den EMOTIONELLA toppen: "Karin har hittat 3 förfallna
 * fakturor värda 45 000 kr", räknat direkt ur databasen.
 *
 * Rutten är ett tunt lager: den hämtar rader ur databasen och delegerar ALL
 * beräkning till lib/onboarding/instant-value.ts (ren, enhetstestad). Se den
 * filen för ärlighets-/prioritetslogiken.
 *
 * Snabb (<1s): några count/sum-queries scope:ade på business_id. Ingen skrivning,
 * inga utskick, inga agent-körningar.
 */
export async function GET(request: NextRequest) {
  const business = await getAuthenticatedBusiness(request)
  if (!business) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = getServerSupabase()
  const businessId = business.business_id

  // Obetalda fakturor (samma konvention som cash-radar-data: status IN
  // ('sent','overdue'), belopp = total). Öppna deals filtreras via stage-flaggor.
  const [invoicesRes, customerRes, dealRows, stagesRes] = await Promise.all([
    supabase
      .from('invoice')
      .select('total, status')
      .eq('business_id', businessId)
      .in('status', ['sent', 'overdue'])
      .limit(5000),
    supabase
      .from('customer')
      .select('customer_id', { count: 'exact', head: true })
      .eq('business_id', businessId),
    supabase
      .from('deal')
      .select('value, stage_id')
      .eq('business_id', businessId)
      .limit(2000),
    supabase
      .from('pipeline_stage')
      .select('id, is_won, is_lost')
      .eq('business_id', businessId),
  ])

  const result = computeInstantValue({
    invoices: invoicesRes.data ?? [],
    customerCount: customerRes.count ?? 0,
    deals: dealRows.data ?? [],
    stages: stagesRes.data ?? [],
  })

  return NextResponse.json(result)
}
